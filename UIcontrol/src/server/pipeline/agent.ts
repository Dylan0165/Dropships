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

// Pricing — USD per 1M tokens (DeepSeek native API)
const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat':     { input: 0.27, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
}

// Read at call time so dotenv/pm2 env updates are always picked up
function llmConfig() {
  return {
    baseUrl: process.env.LLM_BASE_URL ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
    apiKey:  process.env.LLM_API_KEY  ?? process.env.DEEPSEEK_API_KEY  ?? '',
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

/**
 * Laadt de eigen skill plus optionele extra skills uit `Skillslibrary/`.
 *
 * De extra's zijn andermans regels die de agent tijdens zijn werk nodig heeft —
 * bijvoorbeeld de design-skills die de store-builder sturen bij het kiezen van
 * een palet en lettercombinatie. Ze gaan mét hun frontmatter mee zodat in de
 * prompt te zien blijft welke skill welke regel oplegt, en ze komen ná de
 * eigen skill: bij een conflict wint de taak-specifieke instructie.
 *
 * Ontbreekt een extra skill, dan gaat de agent door zonder — een skill die in
 * de repo ontbreekt mag nooit een hele run laten vallen.
 */
export function loadSkillPrompts(skillName: string, extraSkills: string[] = [], onLog?: (msg: string) => void): string {
  const parts = [loadSkillPrompt(skillName)]
  for (const extra of extraSkills) {
    const f = path.join(SKILLS_PATH, extra, 'SKILL.md')
    try {
      const body = fs.readFileSync(f, 'utf-8').trim()
      parts.push(`---\n\n# Extra regels: ${extra}\n\n${body}`)
    } catch {
      onLog?.(`extra skill "${extra}" niet gevonden in ${SKILLS_PATH} — overgeslagen`)
    }
  }
  return parts.join('\n\n')
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
  temperature: number,
  maxTokens: number = 8000,
): Promise<{ content: string; reasoningOnly: boolean; inputTokens: number; outputTokens: number }> {
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
        temperature,
        max_tokens: maxTokens,
        ...(model.startsWith('deepseek') ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`LLM ${res.status}: ${txt.slice(0, 200)}`)
    }
    const json = await res.json() as {
      choices: Array<{ message: { content: string; reasoning_content?: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }
    const msg = json.choices[0]?.message
    // deepseek-reasoner splitst zijn antwoord in `reasoning_content` (het denken)
    // en `content` (het antwoord). Is `content` leeg maar `reasoning_content`
    // niet, dan is het tokenbudget in het denken opgegaan en komt er nooit JSON
    // meer. Dat als "geen JSON" rapporteren stuurt iedereen het verkeerde bos in.
    const reasoningOnly = !msg?.content && !!msg?.reasoning_content
    return {
      content: msg?.content || msg?.reasoning_content || '',
      reasoningOnly,
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
  /**
   * Extra skills uit `Skillslibrary/` die met deze stage meeladen — bijvoorbeeld
   * de design-skills achter de store-builder. Zie loadSkillPrompts().
   */
  extraSkills?: string[]
  model: string
  input: Record<string, unknown>
  /**
   * Kleinere invoer voor pogingen ná de eerste. Een antwoord dat afgekapt raakt
   * wordt niet beter van dezelfde volle prompt; met minder invoer is er ruimte
   * voor het antwoord. Weglaten = elke poging dezelfde invoer.
   */
  compactInput?: Record<string, unknown>
  outputSchema: ZodSchema<T>
  timeoutMs?: number
  retries?: number
  /**
   * Sampling temperature. Laag (~0.3) voor data/technische stages (trend, product,
   * reviewers) → consistent + parseerbaar. Hoog (~0.9) voor creatieve stages
   * (brand, content, store-build) → variatie tussen stores. Default 0.4.
   */
  temperature?: number
  /**
   * Antwoordbudget in tokens. `deepseek-reasoner` splitst dit budget tussen
   * redeneren en antwoorden; met de oude vaste 8000 verdween het JSON-antwoord
   * geregeld in het denken (zie `reasoningOnly`). Stages met een grote
   * JSON-uitvoer (store-build) zetten dit hoger.
   */
  maxTokens?: number
  /**
   * Model voor de pogingen NÁ een `reasoningOnly`-antwoord. Het reasoner-model
   * verbruikte zijn budget aan denken en leverde nooit JSON; opnieuw proberen
   * met hetzelfde model herhaalt dat. Een executor-model zonder aparte
   * reasoning-stroom antwoordt binnen hetzelfde budget wél.
   */
  fallbackModel?: string
  /** Budget zodra `fallbackModel` in gebruik is (default: max(maxTokens, 16000)). */
  fallbackMaxTokens?: number
  onLog?: (level: 'info' | 'warn' | 'error', msg: string) => void
}

export async function runAgent<T>(cfg: RunAgentConfig<T>): Promise<AgentResult & { parsed?: T }> {
  const startTime = Date.now()
  const execId = uuid()
  const startedAt = new Date().toISOString()
  const timeoutMs = cfg.timeoutMs ?? 120_000
  const maxRetries = cfg.retries ?? 3
  const log = cfg.onLog ?? (() => { /* no-op */ })

  // Actief model/budget: start met de configuratie van de stage, en schakel
  // definitief over zodra het reasoner-model zijn budget in het denken opmaakte.
  let activeModel = cfg.model
  let activeMaxTokens = cfg.maxTokens ?? 8000
  let switchedModel = false

  const skill = loadSkillPrompts(cfg.skillName, cfg.extraSkills, m => log('info', m))
  const systemPrompt = `${skill}

CRITICAL RULES:
- Antwoord ALLEEN met valide JSON. Geen tekst buiten JSON.
- Geen markdown fences. Geen uitleg vooraf of erna.
- Volg het OUTPUT schema exact.`

  const promptFor = (input: Record<string, unknown>) => `Input voor deze stage:
${JSON.stringify(input, null, 2)}

Geef je antwoord als één JSON object.`
  const userPrompt = promptFor(cfg.input)
  const compactPrompt = cfg.compactInput ? promptFor(cfg.compactInput) : userPrompt

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
        : `${compactPrompt}

VORIGE POGING WAS ONGELDIG. Fout: ${lastErr}
Stuur nu uitsluitend valide JSON volgens schema.`
      if (attempt > 1 && cfg.compactInput) {
        log('info', `poging ${attempt} met verkorte invoer (${Math.round((userPrompt.length - compactPrompt.length) / 1000)}k tekens minder)`)
      }

      const { content, reasoningOnly, inputTokens, outputTokens } =
        await callLLM(activeModel, systemPrompt, promptForAttempt, timeoutMs, cfg.temperature ?? 0.4, activeMaxTokens)

      totalInTok += inputTokens
      totalOutTok += outputTokens
      totalCost += computeCost(activeModel, inputTokens, outputTokens)
      lastRaw = content

      // Reasoning-only: het budget ging op aan denken en er kwam geen JSON meer.
      // Opnieuw proberen met hetzelfde model herhaalt dat vrijwel zeker, dus
      // schakelen we naar het executor-model (en een ruimer budget).
      if (reasoningOnly && cfg.fallbackModel && !switchedModel) {
        switchedModel = true
        activeModel = cfg.fallbackModel
        activeMaxTokens = cfg.fallbackMaxTokens ?? Math.max(activeMaxTokens, 16_000)
        log('warn',
          `${cfg.agentName}: alleen redenering terug (${outputTokens} output-tokens) — ` +
          `verdere pogingen met ${activeModel} en max_tokens ${activeMaxTokens}`)
      }

      const jsonText = extractJson(content)
      if (!jsonText) {
        lastErr = reasoningOnly
          ? `model gaf alleen redenering terug, geen antwoord (${outputTokens} output-tokens) — waarschijnlijk max_tokens bereikt tijdens het denken`
          : `geen parseerbare JSON in het antwoord (${outputTokens} output-tokens, begint met: ${content.slice(0, 80).replace(/\s+/g, ' ')})`
        log('warn', `JSON parse mislukt — ${lastErr}`)
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
