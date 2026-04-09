import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import type { AgentId, WsEvent } from '../types/index.js'
import * as store from './store.js'
import { AGENT_CONFIGS, PIPELINE_EDGES } from '../constants/pipeline.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../../../')
const skillsPath = process.env.SKILLS_PATH ?? path.join(workspaceRoot, 'Skillslibrary')

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat': { input: 0.27, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
}
const USD_TO_EUR = 0.92

// Active pipeline runs that can be cancelled
const activeRuns = new Set<string>()
// Approval wait resolvers
const approvalWaiters = new Map<string, (decision: { decision: string; opmerking?: string }) => void>()

// ── Load skill prompt for an agent ──
function loadSkillPrompt(agentId: AgentId): string {
  const skillDir = path.join(skillsPath, agentId)
  const skillFile = path.join(skillDir, 'SKILL.md')
  if (fs.existsSync(skillFile)) return fs.readFileSync(skillFile, 'utf-8')
  return `You are the ${agentId} agent. Complete your task and return JSON output.`
}

// ── Call DeepSeek API ──
async function callDeepSeek(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set — configure it in Settings')

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const txt = await response.text()
    throw new Error(`DeepSeek API error ${response.status}: ${txt.slice(0, 300)}`)
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[]
    usage: { prompt_tokens: number; completion_tokens: number }
  }

  return {
    content: data.choices[0]?.message?.content ?? '',
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  }
}

function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || PRICING['deepseek-chat']
  const usd = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  return Math.round(usd * USD_TO_EUR * 10000) / 10000
}

function tryParseJson(text: string): Record<string, unknown> | null {
  // Try to extract JSON from markdown code blocks or raw text
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = jsonMatch ? jsonMatch[1].trim() : text.trim()
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
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
    const skillPrompt = loadSkillPrompt(agentId)
    log(`Loading skill prompt for ${cfg.label}`)

    const userPrompt = JSON.stringify({
      run_id: runId,
      niche,
      previous_agent_output: previousOutput,
    })

    log(`Calling DeepSeek ${cfg.model}...`)
    const result = await callDeepSeek(cfg.model, skillPrompt, userPrompt)
    const durationMs = Date.now() - startTime
    const costEur = computeCost(cfg.model, result.inputTokens, result.outputTokens)
    const outputJson = tryParseJson(result.content) ?? { raw_response: result.content }

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
    }

    if (activeRuns.has(runId)) {
      store.completeRun(runId, 'completed')
      broadcast({ type: 'pipeline_completed', runId, payload: {}, timestamp: new Date().toISOString() })
      activeRuns.delete(runId)
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
