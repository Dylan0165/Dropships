import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { z, type ZodSchema } from 'zod'
import type { AgentResult } from './types.js'
import { logAgentExecution } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../../../../')
const SKILLS_PATH = process.env.SKILLS_PATH ?? path.join(workspaceRoot, 'Skillslibrary')

// Pricing — USD per 1M tokens
const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat':                    { input: 0.27,  output: 1.10  },
  'deepseek-reasoner':                { input: 0.55,  output: 2.19  },
  'opencode-go/deepseek-v4-flash':    { input: 0.07,  output: 0.28  },
  'opencode-go/deepseek-v4-pro':      { input: 0.27,  output: 1.10  },
  'opencode-go/qwen3.5-plus':         { input: 0.07,  output: 0.28  },
  'opencode-go/qwen3.6-plus':         { input: 0.14,  output: 0.55  },
  'opencode-go/kimi-k2.6':            { input: 0.14,  output: 0.55  },
  'opencode-go/minimax-m2.7':         { input: 0.14,  output: 0.55  },
  'opencode-go/glm-5.1':              { input: 0.07,  output: 0.28  },
  'opencode-go/mimo-v2.5-pro':        { input: 0.14,  output: 0.55  },
}

// Read at call time so dotenv/pm2 env updates are always picked up
function llmConfig() {
  return {
    baseUrl: process.env.LLM_BASE_URL ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
    apiKey:  process.env.LLM_API_KEY  ?? process.env.OPENCODE_API_KEY  ?? process.env.DEEPSEEK_API_KEY ?? '',
  }
}

function computeCost(model: string, inTok: number, outTok: number): number {
  const p = PRICING[model] ?? PRICING['deepseek-chat']
  return Math.round(((inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output) * 10000) / 10000
}

export function loadSkillPrompt(skillName: string): string {
  const f = path.join(SKILLS_PATH, skillName, 'SKILL.md')
  try {
    return fs.readFileSync(f, 'utf-8')
  } catch {
    return `Je bent de ${skillName} agent. Geef alleen valide JSON terug.`
  }
}

function stripJsonFences(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  }
  return t.trim()
}

function extractJson(text: string): string | null {
  const stripped = stripJsonFences(text)
  // try the whole thing first
  try { JSON.parse(stripped); return stripped } catch { /* fall through */ }
  // find first { ... matching } block
  const start = stripped.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        const candidate = stripped.slice(start, i + 1)
        try { JSON.parse(candidate); return candidate } catch { return null }
      }
    }
  }
  return null
}

async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const { baseUrl, apiKey } = llmConfig()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`LLM ${res.status}: ${txt.slice(0, 200)}`)
    }
    const json = await res.json() as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }
    return {
      content: json.choices[0]?.message?.content ?? '',
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    }
  } finally {
    clearTimeout(timer)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface RunAgentConfig<T> {
  runId: string
  stage: string
  agentName: string
  skillName: string
  model: 'deepseek-chat' | 'deepseek-reasoner'
  input: Record<string, unknown>
  outputSchema: ZodSchema<T>
  timeoutMs?: number
  retries?: number
  onLog?: (level: 'info' | 'warn' | 'error', msg: string) => void
}

export async function runAgent<T>(cfg: RunAgentConfig<T>): Promise<AgentResult & { parsed?: T }> {
  const startTime = Date.now()
  const execId = uuid()
  const startedAt = new Date().toISOString()
  const timeoutMs = cfg.timeoutMs ?? 120_000
  const maxRetries = cfg.retries ?? 3
  const log = cfg.onLog ?? (() => { /* no-op */ })

  const skill = loadSkillPrompt(cfg.skillName)
  const systemPrompt = `${skill}

CRITICAL RULES:
- Antwoord ALLEEN met valide JSON. Geen tekst buiten JSON.
- Geen markdown fences. Geen uitleg vooraf of erna.
- Volg het OUTPUT schema exact.`

  const userPrompt = `Input voor deze stage:
${JSON.stringify(cfg.input, null, 2)}

Geef je antwoord als één JSON object.`

  let lastErr = ''
  let lastValidationErrors: string[] = []
  let lastRaw = ''
  let totalInTok = 0
  let totalOutTok = 0
  let totalCost = 0

  const backoff = [2000, 8000, 32000]

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log('info', `${cfg.agentName} poging ${attempt}/${maxRetries}`)
    try {
      // On retry, prepend the previous validation error to the user prompt
      const promptForAttempt = attempt === 1
        ? userPrompt
        : `${userPrompt}

VORIGE POGING WAS ONGELDIG. Fout: ${lastErr}
Stuur nu uitsluitend valide JSON volgens schema.`

      const { content, inputTokens, outputTokens } =
        await callLLM(cfg.model, systemPrompt, promptForAttempt, timeoutMs)

      totalInTok += inputTokens
      totalOutTok += outputTokens
      totalCost += computeCost(cfg.model, inputTokens, outputTokens)
      lastRaw = content

      const jsonText = extractJson(content)
      if (!jsonText) {
        lastErr = 'no parseable JSON in response'
        log('warn', `JSON parse mislukt — retry`)
        if (attempt < maxRetries) await delay(backoff[attempt - 1] ?? 2000)
        continue
      }

      let parsed: unknown
      try { parsed = JSON.parse(jsonText) } catch (e) {
        lastErr = `JSON syntax: ${(e as Error).message}`
        if (attempt < maxRetries) await delay(backoff[attempt - 1] ?? 2000)
        continue
      }

      const result = cfg.outputSchema.safeParse(parsed)
      if (!result.success) {
        lastValidationErrors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        lastErr = `schema: ${lastValidationErrors.join('; ')}`
        log('warn', `Schema fail: ${lastErr.slice(0, 200)}`)
        if (attempt < maxRetries) await delay(backoff[attempt - 1] ?? 2000)
        continue
      }

      const durationMs = Date.now() - startTime
      logAgentExecution({
        id: execId, runId: cfg.runId, agentName: cfg.agentName,
        stage: cfg.stage, status: 'success',
        inputJson: JSON.stringify(cfg.input),
        outputJson: JSON.stringify(result.data),
        costUsd: totalCost, tokensIn: totalInTok, tokensOut: totalOutTok,
        durationMs, retryCount: attempt - 1, startedAt,
        finishedAt: new Date().toISOString(),
      })

      log('info', `${cfg.agentName} klaar in ${(durationMs / 1000).toFixed(1)}s — €${totalCost.toFixed(4)}`)

      return {
        ok: true,
        output: result.data as Record<string, unknown>,
        parsed: result.data,
        inputTokens: totalInTok,
        outputTokens: totalOutTok,
        costUsd: totalCost,
        attempts: attempt,
        durationMs,
        rawResponse: content,
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
      log('error', `${cfg.agentName} fout: ${lastErr}`)
      if (attempt < maxRetries) await delay(backoff[attempt - 1] ?? 2000)
    }
  }

  const durationMs = Date.now() - startTime
  logAgentExecution({
    id: execId, runId: cfg.runId, agentName: cfg.agentName,
    stage: cfg.stage, status: 'failed',
    inputJson: JSON.stringify(cfg.input),
    errorMessage: lastErr,
    costUsd: totalCost, tokensIn: totalInTok, tokensOut: totalOutTok,
    durationMs, retryCount: maxRetries, startedAt,
    finishedAt: new Date().toISOString(),
  })

  return {
    ok: false,
    output: null,
    inputTokens: totalInTok,
    outputTokens: totalOutTok,
    costUsd: totalCost,
    attempts: maxRetries,
    durationMs,
    rawResponse: lastRaw,
    error: lastErr,
    validationErrors: lastValidationErrors,
  }
}

// Re-export zod for callers
export { z }
