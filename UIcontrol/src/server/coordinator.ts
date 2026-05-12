import type { AgentId, WsEvent } from '../types/index.js'
import * as store from './store.js'
import * as trendscraper from './trendscraper.js'
import { runAgent as runValidatedAgent } from './agent-runner.js'
import { saveAgentOutput } from './db.js'
import { generateProductImages } from './image-gen.js'
import { AGENT_CONFIGS, PIPELINE_EDGES } from '../constants/pipeline.js'

const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'deepseek-v4-pro':   { input: 0.435, output: 0.87 },
}
const USD_TO_EUR = 0.92

// Active pipeline runs that can be cancelled
const activeRuns = new Set<string>()
// Approval wait resolvers
const approvalWaiters = new Map<string, (decision: { decision: string; opmerking?: string }) => void>()

function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || PRICING['deepseek-v4-flash']
  const usd = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  return Math.round(usd * USD_TO_EUR * 10000) / 10000
}

// ── Build the pipeline execution order from edges ──
function getPipelineOrder(): AgentId[] {
  // Main chain: follow non-dashed edges from trend-agent
  const order: AgentId[] = []
  const edgeMap = new Map<string, string>()
  for (const e of PIPELINE_EDGES) {
    if (!e.dashed) edgeMap.set(e.source, e.target)
  }
  let current: string | undefined = 'trend-agent'
  while (current) {
    order.push(current as AgentId)
    current = edgeMap.get(current)
  }
  return order
}

// ── Run a single agent ──
async function runAgent(
  runId: string,
  agentId: AgentId,
  niche: string,
  previousOutput: Record<string, unknown> | null,
  broadcast: (event: WsEvent) => void,
): Promise<Record<string, unknown> | null> {
  if (!activeRuns.has(runId)) return null

  const now = () => new Date().toISOString()
  const cfg = AGENT_CONFIGS.find(c => c.id === agentId)!
  const startTime = Date.now()

  // Mark agent as running
  store.updateAgent(runId, agentId, { status: 'running', startedAt: now() })
  broadcast({ type: 'agent_started', runId, agentId, payload: {}, timestamp: now() })

  const log = (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
    store.addLog(runId, agentId, { timestamp: now(), level, message })
    broadcast({ type: 'agent_log', runId, agentId, payload: { level, message }, timestamp: now() })
  }

  try {
    log(`Running ${cfg.label} via agent-runner (validated)`)

    const result = await runValidatedAgent(
      agentId,
      { niche, previous_agent_output: previousOutput },
      runId,
      {
        model: cfg.model,
        onLog: (level, message) => log(message, level),
      },
    )

    const durationMs = Date.now() - startTime
    const costEur = computeCost(cfg.model, result.inputTokens, result.outputTokens)

    if (!result.ok || !result.output) {
      const reason = result.error ?? 'agent failed validation'
      log(`Agent failed after ${result.attempts} attempt(s): ${reason}`, 'error')
      store.updateAgent(runId, agentId, {
        status: 'failed', completedAt: now(), durationMs,
        tokenCount: result.inputTokens + result.outputTokens, costEur,
        outputJson: { error: reason, validation_errors: result.validationErrors ?? [], raw: result.rawResponse.slice(0, 1000) },
      })
      // Escalate so a human can see the failure
      store.setEscalation(runId, agentId, {
        reason: `Agent ${agentId} failed: ${reason}`,
        severity: 'HIGH',
        createdAt: now(),
        resolvedAt: null,
        decision: null,
        opmerking: null,
      })
      broadcast({
        type: 'agent_escalation', runId, agentId,
        payload: { reason, severity: 'HIGH', validationErrors: result.validationErrors ?? [] },
        timestamp: now(),
      })
      // Wait for human to approve continuation or kill the pipeline
      const approval = await new Promise<{ decision: string; opmerking?: string }>((resolve) => {
        approvalWaiters.set(`${runId}:${agentId}`, resolve)
      })
      if (approval.decision === 'reject') return null
    }

    const outputJson = result.output ?? { raw_response: result.rawResponse }

    // Persist output immediately so a server crash does not lose work
    saveAgentOutput(runId, agentId, outputJson)

    log(`Completed in ${(durationMs / 1000).toFixed(1)}s — ${result.inputTokens + result.outputTokens} tokens, €${costEur.toFixed(4)}`)

    // If this is a reviewer agent, check for escalation
    const isReviewer = cfg.category === 'reviewer'
    const decision = outputJson.decision as string | undefined
    const needsEscalation = isReviewer && decision === 'UNCERTAIN'

    if (needsEscalation) {
      log(`⚠ Reviewer flagged UNCERTAIN — requesting human approval`, 'warn')

      store.setEscalation(runId, agentId, {
        reason: (outputJson.reasoning as string) ?? 'Reviewer flagged for manual review',
        severity: 'MEDIUM',
        createdAt: now(),
        resolvedAt: null,
        decision: null,
        opmerking: null,
      })
      broadcast({
        type: 'agent_escalation', runId, agentId,
        payload: { reason: outputJson.reasoning ?? 'Manual review required', severity: 'MEDIUM' },
        timestamp: now(),
      })

      // Wait for human approval
      const approval = await new Promise<{ decision: string; opmerking?: string }>((resolve) => {
        approvalWaiters.set(`${runId}:${agentId}`, resolve)
      })

      log(`Human decision: ${approval.decision}${approval.opmerking ? ` — "${approval.opmerking}"` : ''}`)

      if (approval.decision === 'reject') {
        store.updateAgent(runId, agentId, {
          status: 'failed', completedAt: now(), durationMs,
          tokenCount: result.inputTokens + result.outputTokens, costEur, outputJson,
        })
        broadcast({ type: 'agent_failed', runId, agentId, payload: { reason: 'Rejected by human' }, timestamp: now() })
        return null
      }
    }

    store.updateAgent(runId, agentId, {
      status: 'completed', completedAt: now(), durationMs,
      tokenCount: result.inputTokens + result.outputTokens, costEur, outputJson,
    })
    broadcast({
      type: 'agent_completed', runId, agentId,
      payload: { outputJson, tokenCount: result.inputTokens + result.outputTokens, costEur, durationMs },
      timestamp: now(),
    })

    return outputJson
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log(`Failed: ${message}`, 'error')
    store.updateAgent(runId, agentId, { status: 'failed', completedAt: now() })
    broadcast({ type: 'agent_failed', runId, agentId, payload: { error: message }, timestamp: now() })
    return null
  }
}

// ═══════ Public API ═══════

export function startPipeline(
  runId: string,
  niche: string,
  broadcast: (event: WsEvent) => void,
): void {
  activeRuns.add(runId)
  const order = getPipelineOrder()

  // Run pipeline async — don't block the request
  ;(async () => {
    let previousOutput: Record<string, unknown> | null = null
    // Bijhouden van alle agent outputs voor cross-agent data ophalen
    const allOutputs = new Map<string, Record<string, unknown>>()

    for (const agentId of order) {
      if (!activeRuns.has(runId)) break

      const result = await runAgent(runId, agentId, niche, previousOutput, broadcast)
      if (!result) {
        // Agent failed or was rejected — stop pipeline
        store.completeRun(runId, 'failed')
        broadcast({ type: 'pipeline_failed', runId, payload: { stoppedAt: agentId }, timestamp: new Date().toISOString() })
        activeRuns.delete(runId)
        return
      }
      previousOutput = result
      allOutputs.set(agentId, result)

      // Normalize niche-reviewer output — treat "Geen besluit" and unknown decisions as APPROVED
      if (agentId === 'niche-reviewer' && previousOutput) {
        type Assessment = { niche: string; decision: string; [k: string]: unknown }
        const assessments = previousOutput.assessments as Assessment[] | undefined
        if (Array.isArray(assessments)) {
          for (const a of assessments) {
            if (a.decision !== 'APPROVED' && a.decision !== 'REJECTED' && a.decision !== 'UNCERTAIN') {
              console.warn(`[niche-reviewer] onbekende beslissing "${a.decision}" voor "${a.niche}" → APPROVED`)
              a.decision = 'APPROVED'
            }
          }
          let approvedNiches = assessments.filter(a => a.decision === 'APPROVED').map(a => a.niche)
          if (approvedNiches.length === 0) {
            const fallback = assessments.find(a => a.decision !== 'REJECTED')
            if (fallback) {
              fallback.decision = 'APPROVED'
              approvedNiches = [fallback.niche]
              console.warn(`[niche-reviewer] geen APPROVED niche — eerste niet-REJECTED niche als fallback: "${fallback.niche}"`)
            }
          }
          previousOutput = { ...previousOutput, assessments, approved_niches: approvedNiches }
          allOutputs.set(agentId, previousOutput)
        }
      }

      // After store-builder: deploy the store via store-platform API (best-effort)
      if (agentId === 'store-builder' && previousOutput) {
        try {
          // Brand data zit in brand-agent output, niet in store-builder output
          const brandAgentOut = allOutputs.get('brand-agent') ?? {}
          const brandRaw = (brandAgentOut.brand ?? brandAgentOut) as Record<string, unknown>
          const storeConfig = previousOutput.store_config as Record<string, unknown> | undefined
          const tailwind = storeConfig?.tailwind_theme as Record<string, unknown> | undefined
          const colors = (tailwind?.colors ?? brandRaw?.colors ?? {}) as Record<string, string>

          // Producten uit product-agent output halen
          const productAgentOut = allOutputs.get('product-agent') ?? {}
          const productReviewerOut = allOutputs.get('product-reviewer') ?? {}
          const rawProducts = (productAgentOut.products ?? productAgentOut.top_3 ?? productReviewerOut.products ?? []) as Record<string, unknown>[]
          const products = rawProducts.map((p, i) => ({
            id: (p.cj_id ?? p.product_id ?? p.id ?? `product-${i}`) as string,
            title: (p.name ?? p.product_name ?? p.title ?? niche) as string,
            price: (p.sell_price ?? p.recommended_retail_price ?? p.price ?? 29.99) as number,
            compareAtPrice: (p.compare_at_price ?? undefined) as number | undefined,
            image: (p.image_url ?? p.image ?? '') as string,
            description: (p.description ?? '') as string,
          }))

          const brandName = (brandRaw?.name ?? brandRaw?.brand_name ?? previousOutput?.subdomain ?? niche) as string

          const storeData = {
            brand_name: brandName,
            slogan: (brandRaw?.slogan ?? '') as string,
            niche,
            colors,
            products,
            subdomain: (previousOutput.subdomain as string | undefined),
          }

          const PLATFORM_URL = process.env.PLATFORM_API_URL ?? 'http://localhost:3002'
          const deployRes = await fetch(`${PLATFORM_URL}/api/stores/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ run_id: runId, ...storeData }),
            signal: AbortSignal.timeout(300_000),
          })

          if (deployRes.ok) {
            const deployed = await deployRes.json() as { store_id: string; preview_url: string; subdomain: string }
            store.addLog(runId, agentId, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Store deployed: ${deployed.preview_url}`,
            })
            broadcast({
              type: 'agent_log', runId, agentId,
              payload: { level: 'info', message: `✅ Store live: ${deployed.preview_url}` },
              timestamp: new Date().toISOString(),
            })
            previousOutput = { ...previousOutput, deployed_store: deployed }
          } else {
            const errText = await deployRes.text()
            store.addLog(runId, agentId, {
              timestamp: new Date().toISOString(),
              level: 'warn',
              message: `Store deploy mislukt (non-fatal): ${errText.slice(0, 200)}`,
            })
          }
        } catch (err) {
          console.error(`[coordinator] store deploy failed (non-fatal):`, err)
          store.addLog(runId, agentId, {
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: `Store deploy overgeslagen: ${err instanceof Error ? err.message : String(err)}`,
          })
        }
      }

      // After brand-agent: generate product images via Flux 1.1 Pro (best-effort)
      if (agentId === 'brand-agent' && previousOutput) {
        try {
          const productName = (previousOutput.product_name as string)
            ?? (previousOutput.niche as string)
            ?? niche
          const imageUrls = await generateProductImages({ storeId: runId, productName, niche })
          previousOutput = {
            ...previousOutput,
            image_urls: imageUrls,
            product_image_1: imageUrls[0] ?? '',
            product_image_2: imageUrls[1] ?? '',
            product_image_3: imageUrls[2] ?? '',
          }
          store.addLog(runId, agentId, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Productafbeeldingen gegenereerd: ${imageUrls.filter(Boolean).length}/3`,
          })
        } catch (err) {
          console.error(`[coordinator] image-gen failed (non-fatal):`, err)
        }
      }
    }

    if (activeRuns.has(runId)) {
      store.completeRun(runId, 'completed')
      broadcast({ type: 'pipeline_completed', runId, payload: {}, timestamp: new Date().toISOString() })
      activeRuns.delete(runId)

      // Mark niche as used in Trendscraper so it won't be re-suggested.
      // Best-effort — never block or fail the pipeline on this.
      trendscraper.markNicheUsed(niche).catch((err: unknown) => {
        console.error(`[coordinator] markNicheUsed("${niche}") failed:`, err)
      })
    }
  })().catch((err) => {
    console.error(`[coordinator] Pipeline ${runId} crashed:`, err)
    store.completeRun(runId, 'failed')
    broadcast({ type: 'pipeline_failed', runId, payload: { error: String(err) }, timestamp: new Date().toISOString() })
    activeRuns.delete(runId)
  })
}

export function stopPipeline(runId: string): void {
  activeRuns.delete(runId)
}

export function sendApproval(
  runId: string,
  agentId: string,
  decision: string,
  opmerking?: string,
): void {
  const key = `${runId}:${agentId}`
  const waiter = approvalWaiters.get(key)
  if (waiter) {
    waiter({ decision, opmerking })
    approvalWaiters.delete(key)
  }
}
