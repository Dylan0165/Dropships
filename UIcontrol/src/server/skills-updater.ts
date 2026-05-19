/**
 * Skills auto-updater.
 *
 * Records per-agent performance after every pipeline run.
 * Every 7 days: analyzes last 20 runs per agent, asks LLM to improve SKILL.md,
 * saves backup, writes improved version.  Notifies via WhatsApp on completion.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from './db.js'
import { notifyApprovalNeeded } from './whatsapp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.resolve(__dirname, '../../skills')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkillPerformanceRecord {
  run_id: string
  agent_id: string
  success: boolean
  attempts: number
  duration_ms: number
  cost_eur: number
  validation_errors: string
  output_quality: number   // 0-100 subjective score from reviewer or heuristic
  created_at: string
}

// ── DB setup ──────────────────────────────────────────────────────────────────

export function ensureSkillsTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills_performance (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id           TEXT NOT NULL,
      agent_id         TEXT NOT NULL,
      success          INTEGER NOT NULL DEFAULT 1,
      attempts         INTEGER NOT NULL DEFAULT 1,
      duration_ms      INTEGER NOT NULL DEFAULT 0,
      cost_eur         REAL    NOT NULL DEFAULT 0,
      validation_errors TEXT   NOT NULL DEFAULT '[]',
      output_quality   INTEGER NOT NULL DEFAULT 70,
      created_at       TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_skills_agent ON skills_performance(agent_id);
    CREATE INDEX IF NOT EXISTS idx_skills_run   ON skills_performance(run_id);
  `)
}

// ── Record performance ─────────────────────────────────────────────────────────

export function recordSkillPerformance(params: {
  runId: string
  agentId: string
  success: boolean
  attempts: number
  durationMs: number
  costEur: number
  validationErrors?: string[]
  outputQuality?: number
}): void {
  try {
    db.prepare(
      `INSERT INTO skills_performance
       (run_id, agent_id, success, attempts, duration_ms, cost_eur, validation_errors, output_quality, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      params.runId,
      params.agentId,
      params.success ? 1 : 0,
      params.attempts,
      params.durationMs,
      params.costEur,
      JSON.stringify(params.validationErrors ?? []),
      params.outputQuality ?? 70,
      new Date().toISOString(),
    )
  } catch (err) {
    console.error('[skills-updater] recordSkillPerformance failed:', err)
  }
}

// ── LLM skill improvement ──────────────────────────────────────────────────────

async function improveSkillFile(agentId: string, records: SkillPerformanceRecord[]): Promise<boolean> {
  const skillPath = path.join(SKILLS_DIR, `${agentId}.md`)
  if (!fs.existsSync(skillPath)) {
    console.log(`[skills-updater] No skill file for ${agentId} — skipping`)
    return false
  }

  const currentSkill = fs.readFileSync(skillPath, 'utf-8')

  const successRate = Math.round((records.filter(r => r.success).length / records.length) * 100)
  const avgAttempts = (records.reduce((a, r) => a + r.attempts, 0) / records.length).toFixed(1)
  const avgQuality  = Math.round(records.reduce((a, r) => a + r.output_quality, 0) / records.length)

  // Aggregate validation errors
  const errorCounts: Record<string, number> = {}
  for (const r of records) {
    try {
      const errors = JSON.parse(r.validation_errors) as string[]
      for (const e of errors) {
        const key = e.slice(0, 80)
        errorCounts[key] = (errorCounts[key] ?? 0) + 1
      }
    } catch { /* ignore */ }
  }
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e, c]) => `- "${e}" (${c}x)`)
    .join('\n')

  const llmBaseUrl = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1'
  const llmModel   = process.env.LLM_MODEL    ?? 'deepseek-chat'
  const llmApiKey  = process.env.LLM_API_KEY  ?? process.env.DEEPSEEK_API_KEY ?? ''

  const prompt = `You are improving a skill/system-prompt file for an AI agent.

## Agent: ${agentId}
## Performance summary (last ${records.length} runs)
- Success rate: ${successRate}%
- Avg attempts to succeed: ${avgAttempts}
- Avg output quality score: ${avgQuality}/100

## Top validation errors:
${topErrors || '(none)'}

## Current skill file:
\`\`\`markdown
${currentSkill.slice(0, 4000)}
\`\`\`

## Task
Rewrite the skill file to address the recurring errors and improve success rate.
- Keep the same general structure and language (Dutch/English as-is)
- Add clearer output format instructions where validation errors occurred
- Do NOT add unnecessary verbosity
- Return ONLY the improved markdown, no commentary`

  try {
    const resp = await fetch(`${llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmApiKey}` },
      body: JSON.stringify({
        model: llmModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 3000,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!resp.ok) {
      console.error(`[skills-updater] LLM call failed for ${agentId}: ${resp.status}`)
      return false
    }

    const data = await resp.json() as { choices: { message: { content: string } }[] }
    const improved = data.choices[0]?.message?.content?.trim()
    if (!improved || improved.length < 100) return false

    // Save backup
    const backupPath = `${skillPath}.backup.${Date.now()}`
    fs.copyFileSync(skillPath, backupPath)

    // Write improved
    fs.writeFileSync(skillPath, improved, 'utf-8')
    console.log(`[skills-updater] ${agentId} skill verbeterd (backup: ${path.basename(backupPath)})`)
    return true
  } catch (err) {
    console.error(`[skills-updater] improveSkillFile(${agentId}) failed:`, err)
    return false
  }
}

// ── Main update cycle ─────────────────────────────────────────────────────────

export async function runSkillsUpdate(): Promise<void> {
  console.log('[skills-updater] Wekelijkse skills update gestart')

  // Get agents with enough data (min 3 runs)
  const agents = db.prepare(`
    SELECT agent_id, COUNT(*) as cnt
    FROM skills_performance
    WHERE created_at > datetime('now', '-30 days')
    GROUP BY agent_id
    HAVING cnt >= 3
    ORDER BY cnt DESC
    LIMIT 3
  `).all() as { agent_id: string; cnt: number }[]

  if (agents.length === 0) {
    console.log('[skills-updater] Niet genoeg data voor skill verbetering (min. 3 runs per agent)')
    return
  }

  const improved: string[] = []

  for (const { agent_id } of agents) {
    const records = db.prepare(`
      SELECT * FROM skills_performance
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(agent_id) as SkillPerformanceRecord[]

    const ok = await improveSkillFile(agent_id, records)
    if (ok) improved.push(agent_id)
  }

  if (improved.length > 0) {
    await notifyApprovalNeeded({
      agentId: 'skills-updater',
      niche: 'systeem',
      severity: 'LOW',
      reason: `Skills auto-update klaar. Verbeterd: ${improved.join(', ')}. Controleer de bestanden in UIcontrol/skills/.`,
      runId: 'skills-update-' + Date.now(),
    }).catch(console.error)
  }

  console.log(`[skills-updater] Update klaar — ${improved.length}/${agents.length} agents verbeterd`)
}

// ── Stats query ────────────────────────────────────────────────────────────────

export function getSkillsStats(): Record<string, {
  successRate: number
  avgAttempts: number
  avgQuality: number
  runCount: number
}> {
  const rows = db.prepare(`
    SELECT agent_id,
           AVG(CAST(success AS REAL)) * 100 AS success_rate,
           AVG(attempts) AS avg_attempts,
           AVG(output_quality) AS avg_quality,
           COUNT(*) AS run_count
    FROM skills_performance
    GROUP BY agent_id
  `).all() as {
    agent_id: string
    success_rate: number
    avg_attempts: number
    avg_quality: number
    run_count: number
  }[]

  return Object.fromEntries(
    rows.map(r => [r.agent_id, {
      successRate: Math.round(r.success_rate),
      avgAttempts: parseFloat(r.avg_attempts.toFixed(1)),
      avgQuality: Math.round(r.avg_quality),
      runCount: r.run_count,
    }]),
  )
}
