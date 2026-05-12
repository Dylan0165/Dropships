/**
 * Agent runner — loads a SKILL.md, calls DeepSeek, parses + validates the JSON output.
 *
 * Validation uses minimal inline schema checks (no zod dep). Each agent has its own
 * required-shape check; on parse/validation failure we retry up to 2 extra times
 * with a stricter "JSON only" instruction. After 3 total failures, returns
 * { ok: false } so the coordinator can mark the agent as failed + escalate.
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { logAgentExecution } from './db.js'
import { getAgent } from './agents/registry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../../../')
const SKILLS_PATH = process.env.SKILLS_PATH ?? path.join(workspaceRoot, 'Skillslibrary')
const MAX_ATTEMPTS = 3

// ── Circuit breaker state (in-memory per process) ────────────────────────────
interface CircuitState { failures: number; openUntil: number }
const circuitBreakers = new Map<string, CircuitState>()
const CIRCUIT_OPEN_MS = 5 * 60 * 1000  // 5 minuten

function isCircuitOpen(agentId: string): boolean {
  const s = circuitBreakers.get(agentId)
  if (!s) return false
  if (Date.now() < s.openUntil) return true
  // Reset after cooldown
  circuitBreakers.delete(agentId)
  return false
}

function recordCircuitFailure(agentId: string): void {
  const threshold = getAgent(agentId).circuitBreakerThreshold
  const s = circuitBreakers.get(agentId) ?? { failures: 0, openUntil: 0 }
  s.failures++
  if (s.failures >= threshold) {
    s.openUntil = Date.now() + CIRCUIT_OPEN_MS
    console.warn(`[agent-runner] Circuit breaker OPEN voor ${agentId} — pauze ${CIRCUIT_OPEN_MS / 60000} min`)
  }
  circuitBreakers.set(agentId, s)
}

function recordCircuitSuccess(agentId: string): void {
  circuitBreakers.delete(agentId)
}

// ── LLM provider config ───────────────────────────────────────────────────────
// Werkt met zowel Ollama (lokaal) als DeepSeek API.
// Stel in .env in:
//   LLM_BASE_URL=http://192.168.121.122:11434/v1   ← Ollama
//   LLM_BASE_URL=https://api.deepseek.com          ← DeepSeek (productie)
//   LLM_API_KEY=                                   ← leeg laten voor Ollama, API key voor DeepSeek
//   LLM_MODEL=qwen2.5:14b                          ← Ollama model
//   LLM_MODEL=deepseek-chat                        ← DeepSeek model
const LLM_BASE_URL = process.env.LLM_BASE_URL
  ?? process.env.DEEPSEEK_BASE_URL
  ?? 'https://api.deepseek.com'
const LLM_API_KEY = process.env.LLM_API_KEY
  ?? process.env.DEEPSEEK_API_KEY
  ?? ''
const LLM_MODEL_DEFAULT = process.env.LLM_MODEL
  ?? process.env.DEEPSEEK_MODEL
  ?? 'deepseek-chat'

export interface AgentResult {
  ok: boolean
  output: Record<string, unknown> | null
  inputTokens: number
  outputTokens: number
  attempts: number
  rawResponse: string
  error?: string
  validationErrors?: string[]
}

// ── Minimal validator helpers ─────────────────────────────────────────────────

type Validator = (data: unknown) => string[]

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v)
const isArr = (v: unknown): v is unknown[] => Array.isArray(v)

function checkArrayOf(arr: unknown, itemCheck: (item: unknown, idx: number) => string[], path: string): string[] {
  if (!isArr(arr)) return [`${path}: expected array`]
  const errs: string[] = []
  arr.forEach((item, idx) => errs.push(...itemCheck(item, idx)))
  return errs
}

// Per-agent schemas — each returns an array of human-readable validation errors.
const VALIDATORS: Record<string, Validator> = {
  'trend-agent': (data) => {
    if (!isObj(data)) return ['root: expected object']
    return checkArrayOf(data.niches, (item, idx) => {
      if (!isObj(item)) return [`niches[${idx}]: expected object`]
      const errs: string[] = []
      if (!isStr(item.name)) errs.push(`niches[${idx}].name: expected non-empty string`)
      const score = item.trend_score ?? item.trending_score
      if (!isNum(score)) errs.push(`niches[${idx}].trend_score|trending_score: expected number`)
      return errs
    }, 'niches')
  },

  'product-agent': (data) => {
    if (!isObj(data)) return ['root: expected object']
    const list = (data.products ?? data.top_3) as unknown
    return checkArrayOf(list, (item, idx) => {
      if (!isObj(item)) return [`products[${idx}]: expected object`]
      const errs: string[] = []
      const name = item.name ?? item.product_name
      if (!isStr(name)) errs.push(`products[${idx}].name|product_name: expected non-empty string`)
      const buy = item.buy_price ?? item.purchase_price
      if (!isNum(buy)) errs.push(`products[${idx}].buy_price|purchase_price: expected number`)
      const margin = item.margin_percent ?? item.margin_factor
      if (!isNum(margin)) errs.push(`products[${idx}].margin_percent|margin_factor: expected number`)
      return errs
    }, 'products')
  },

  'brand-agent': (data) => {
    if (!isObj(data)) return ['root: expected object']
    // Accepteer brand.name (SKILL.md formaat) OF legacy brand_name op root
    const brand = data.brand
    if (isObj(brand)) {
      const errs: string[] = []
      if (!isStr(brand.name) && !isStr(brand.brand_name)) errs.push('brand.name: expected non-empty string')
      if (!isStr(brand.slogan)) errs.push('brand.slogan: expected non-empty string')
      if (!isObj(brand.colors)) errs.push('brand.colors: expected object')
      return errs
    }
    // Fallback: root-level formaat
    const errs: string[] = []
    if (!isStr(data.brand_name) && !isStr(data.name)) errs.push('brand_name/name: expected non-empty string')
    if (!isStr(data.slogan)) errs.push('slogan: expected non-empty string')
    if (!isObj(data.colors)) errs.push('colors: expected object')
    return errs
  },

  'ads-agent': (data) => {
    if (!isObj(data)) return ['root: expected object']
    const errs: string[] = []
    // hooks is verplicht (array van hook-objecten of strings)
    if (!isArr(data.hooks)) errs.push('hooks: expected array')
    // primary_text kan op root zitten OF in ad_copy_variants[]
    const hasPrimaryText = isStr(data.primary_text)
    const hasVariants = isArr(data.ad_copy_variants) && (data.ad_copy_variants as unknown[]).length > 0
    if (!hasPrimaryText && !hasVariants) errs.push('primary_text or ad_copy_variants: expected at least one')
    // targeting is optioneel (niet in alle SKILL.md versies)
    return errs
  },

  // Reviewers — accepteer elk niet-leeg object (DeepSeek output varieert per niche)
  'niche-reviewer': (data) => {
    if (!isObj(data)) return ['root: expected object']
    if (Object.keys(data).length > 0) return []
    return ['root: empty object']
  },

  'product-reviewer': (data) => {
    if (!isObj(data)) return ['root: expected object']
    if (Object.keys(data).length > 0) return []
    return ['root: empty object']
  },

  'store-reviewer': (data) => {
    if (!isObj(data)) return ['root: expected object']
    if (Object.keys(data).length > 0) return []
    return ['root: empty object']
  },

  'ads-reviewer': (data) => {
    if (!isObj(data)) return ['root: expected object']
    if (Object.keys(data).length > 0) return []
    return ['root: empty object']
  },
}

// Default validator for growth, security, etc.
const DEFAULT_VALIDATOR: Validator = (data) => {
  if (!isObj(data)) return ['root: expected object']
  // Accept any object with at least one meaningful field
  if (Object.keys(data).length > 0) return []
  return ['root: empty object']
}

function validateOutput(agentId: string, data: unknown): string[] {
  const validator = VALIDATORS[agentId] ?? DEFAULT_VALIDATOR
  return validator(data)
}

// ── Skill prompt loader ───────────────────────────────────────────────────────

export function loadSkillPrompt(agentId: string): string {
  const skillFile = path.join(SKILLS_PATH, agentId, 'SKILL.md')
  try {
    return fs.readFileSync(skillFile, 'utf-8')
  } catch (err) {
    console.error(`[agent-runner] Could not read SKILL.md for ${agentId}:`, err)
    return `You are the ${agentId} agent. Complete your task and return a JSON object.`
  }
}

// ── LLM call (OpenAI-compatible — werkt met Ollama én DeepSeek) ───────────────

async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (LLM_API_KEY) headers['Authorization'] = `Bearer ${LLM_API_KEY}`

  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(600_000),
  })

  if (!response.ok) {
    const txt = await response.text()
    throw new Error(`LLM API ${response.status}: ${txt.slice(0, 300)}`)
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

function tryParseJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1].trim() : text.trim()
  try {
    const parsed = JSON.parse(candidate)
    return isObj(parsed) ? parsed : null
  } catch {
    // Last-ditch: find the first {...} or [...] block
    const m = candidate.match(/[{[][\s\S]*[}\]]/)
    if (m) {
      try {
        const parsed = JSON.parse(m[0])
        return isObj(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return null
  }
}

// ── Public runner ─────────────────────────────────────────────────────────────

export async function runAgent(
  agentId: string,
  input: Record<string, unknown>,
  runId: string,
  options: { model?: string; onLog?: (level: 'info' | 'warn' | 'error', message: string) => void } = {},
): Promise<AgentResult> {
  const model = options.model ?? LLM_MODEL_DEFAULT
  const log = options.onLog ?? (() => { /* noop */ })

  const skillPrompt = loadSkillPrompt(agentId) +
    '\n\n## CRITICAL OUTPUT RULE\nReturn ONLY a single valid JSON object. No markdown code fences, no explanation text before or after. Start your response with `{` and end with `}`.'
  const baseUserMessage = JSON.stringify({ run_id: runId, ...input }, null, 2)

  let inputTokens = 0
  let outputTokens = 0
  let lastRaw = ''
  let lastErrors: string[] = []
  let lastError: string | undefined

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const userPrompt = attempt === 1
      ? baseUserMessage
      : `${baseUserMessage}\n\nIMPORTANT: Your previous response was invalid. ` +
        `Return ONLY valid JSON — no markdown, no explanations, no surrounding text. ` +
        (lastErrors.length ? `Validation errors were: ${lastErrors.join('; ')}` : '')

    log('info', `attempt ${attempt}/${MAX_ATTEMPTS} — calling ${model}`)

    let raw: string
    try {
      const result = await callLLM(model, skillPrompt, userPrompt)
      raw = result.content
      lastRaw = raw
      inputTokens += result.inputTokens
      outputTokens += result.outputTokens
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      log('error', `DeepSeek call failed: ${lastError}`)
      // Network/API errors are not retried in tight loop
      return {
        ok: false, output: null, inputTokens, outputTokens,
        attempts: attempt, rawResponse: lastRaw, error: lastError,
      }
    }

    const parsed = tryParseJson(raw)
    if (!parsed) {
      lastErrors = ['response is not valid JSON']
      log('warn', `attempt ${attempt}: JSON parse failed`)
      continue
    }

    const validationErrors = validateOutput(agentId, parsed)
    if (validationErrors.length === 0) {
      log('info', `attempt ${attempt}: output validated`)
      return {
        ok: true, output: parsed, inputTokens, outputTokens,
        attempts: attempt, rawResponse: raw,
      }
    }

    lastErrors = validationErrors
    log('warn', `attempt ${attempt}: validation failed — ${validationErrors.join('; ')}`)
  }

  return {
    ok: false, output: null, inputTokens, outputTokens,
    attempts: MAX_ATTEMPTS, rawResponse: lastRaw,
    error: 'validation failed after retries',
    validationErrors: lastErrors,
  }
}
