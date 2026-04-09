import type {
  AgentId,
  AgentRun,
  PipelineRun,
  LogEntry,
  EscalationInfo,
  StoreInfo,
} from '../types/index.js'

// Re-export shared configs for server-side use
export { AGENT_CONFIGS, PIPELINE_EDGES, ALL_AGENT_IDS } from '../constants/pipeline.js'
import { ALL_AGENT_IDS } from '../constants/pipeline.js'
import db from './db.js'

// ═══════ Helper: create empty agent runs ═══════

export function createEmptyAgentRuns(): Record<AgentId, AgentRun> {
  const runs = {} as Record<AgentId, AgentRun>
  for (const id of ALL_AGENT_IDS) {
    runs[id] = {
      agentId: id,
      status: 'idle',
      startedAt: null,
      completedAt: null,
      durationMs: null,
      attempt: 0,
      outputJson: null,
      logs: [],
      tokenCount: 0,
      costEur: 0,
      escalation: null,
    }
  }
  return runs
}

// ═══════ Prepared statements ═══════

const insertRun = db.prepare(`
  INSERT INTO runs (run_id, niche, status, data, started_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const selectRun = db.prepare(`SELECT * FROM runs WHERE run_id = ?`)
const selectAllRuns = db.prepare(`SELECT * FROM runs ORDER BY started_at DESC`)
const updateRunData = db.prepare(`UPDATE runs SET data = ?, updated_at = ? WHERE run_id = ?`)
const updateRunStatus = db.prepare(`UPDATE runs SET status = ?, completed_at = ?, data = ?, updated_at = ? WHERE run_id = ?`)

const insertStore = db.prepare(`
  INSERT OR REPLACE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, roas, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const selectStoresByRun = db.prepare(`SELECT * FROM stores WHERE run_id = ?`)

// ═══════ Internal helpers ═══════

function rowToRun(row: Record<string, unknown>): PipelineRun {
  const data = JSON.parse(row.data as string) as {
    agents: Record<AgentId, AgentRun>
    totalTokens: number
    totalCostEur: number
    activeEscalations: number
  }
  const stores = selectStoresByRun.all(row.run_id) as Record<string, unknown>[]
  return {
    runId: row.run_id as string,
    niche: row.niche as string,
    status: row.status as PipelineRun['status'],
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string) ?? null,
    agents: data.agents,
    totalTokens: data.totalTokens,
    totalCostEur: data.totalCostEur,
    storesLive: stores.map(s => ({
      storeId: s.store_id as string,
      subdomein: s.subdomein as string,
      niche: s.niche as string,
      previewUrl: s.preview_url as string,
      createdAt: s.created_at as string,
      roas: s.roas as number | null,
      status: s.status as StoreInfo['status'],
    })),
    activeEscalations: data.activeEscalations,
  }
}

function saveRunData(run: PipelineRun): void {
  const data = JSON.stringify({
    agents: run.agents,
    totalTokens: run.totalTokens,
    totalCostEur: run.totalCostEur,
    activeEscalations: run.activeEscalations,
  })
  updateRunData.run(data, new Date().toISOString(), run.runId)
}

// In-memory cache for hot runs (active pipeline runs)
const cache = new Map<string, PipelineRun>()

// ═══════ Public API (same interface as before) ═══════

export function createRun(runId: string, niche: string): PipelineRun {
  const now = new Date().toISOString()
  const agents = createEmptyAgentRuns()
  const data = JSON.stringify({
    agents,
    totalTokens: 0,
    totalCostEur: 0,
    activeEscalations: 0,
  })
  insertRun.run(runId, niche, 'running', data, now, now)

  const run: PipelineRun = {
    runId,
    niche,
    status: 'running',
    startedAt: now,
    completedAt: null,
    agents,
    totalTokens: 0,
    totalCostEur: 0,
    storesLive: [],
    activeEscalations: 0,
  }
  cache.set(runId, run)
  return run
}

export function getRun(runId: string): PipelineRun | undefined {
  // Check cache first (active runs)
  const cached = cache.get(runId)
  if (cached) return cached
  // Fallback to DB
  const row = selectRun.get(runId) as Record<string, unknown> | undefined
  if (!row) return undefined
  return rowToRun(row)
}

export function getAllRuns(): PipelineRun[] {
  const rows = selectAllRuns.all() as Record<string, unknown>[]
  return rows.map(rowToRun)
}

export function updateAgent(runId: string, agentId: AgentId, patch: Partial<AgentRun>): void {
  const run = getRun(runId)
  if (!run) return
  const agent = run.agents[agentId]
  if (!agent) return
  Object.assign(agent, patch)
  if (patch.tokenCount !== undefined) {
    run.totalTokens = Object.values(run.agents).reduce((s, a) => s + a.tokenCount, 0)
  }
  if (patch.costEur !== undefined) {
    run.totalCostEur = Object.values(run.agents).reduce((s, a) => s + a.costEur, 0)
  }
  run.activeEscalations = Object.values(run.agents).filter(a => a.status === 'waiting_approval').length
  cache.set(runId, run)
  saveRunData(run)
}

export function addLog(runId: string, agentId: AgentId, entry: LogEntry): void {
  const run = getRun(runId)
  if (!run) return
  const agent = run.agents[agentId]
  if (!agent) return
  agent.logs.push(entry)
  cache.set(runId, run)
  // Debounce log persistence — only save every 10 logs
  if (agent.logs.length % 10 === 0) {
    saveRunData(run)
  }
}

export function setEscalation(runId: string, agentId: AgentId, info: EscalationInfo): void {
  const run = getRun(runId)
  if (!run) return
  const agent = run.agents[agentId]
  if (!agent) return
  agent.escalation = info
  agent.status = 'waiting_approval'
  run.activeEscalations = Object.values(run.agents).filter(a => a.status === 'waiting_approval').length
  cache.set(runId, run)
  saveRunData(run)
}

export function resolveEscalation(
  runId: string,
  agentId: AgentId,
  decision: string,
  opmerking?: string,
): void {
  const run = getRun(runId)
  if (!run) return
  const agent = run.agents[agentId]
  if (!agent || !agent.escalation) return
  agent.escalation.resolvedAt = new Date().toISOString()
  agent.escalation.decision = decision as 'approve' | 'reject'
  agent.escalation.opmerking = opmerking ?? null
  agent.status = decision === 'approve' ? 'running' : 'failed'
  run.activeEscalations = Object.values(run.agents).filter(a => a.status === 'waiting_approval').length
  cache.set(runId, run)
  saveRunData(run)
}

export function completeRun(runId: string, status: 'completed' | 'failed'): void {
  const run = getRun(runId)
  if (!run) return
  run.status = status
  run.completedAt = new Date().toISOString()
  const data = JSON.stringify({
    agents: run.agents,
    totalTokens: run.totalTokens,
    totalCostEur: run.totalCostEur,
    activeEscalations: run.activeEscalations,
  })
  updateRunStatus.run(status, run.completedAt, data, new Date().toISOString(), runId)
  cache.delete(runId) // Remove from hot cache since it's done
}

export function addStore(runId: string, storeInfo: StoreInfo): void {
  const run = getRun(runId)
  if (!run) return
  insertStore.run(
    storeInfo.storeId,
    runId,
    storeInfo.subdomein,
    storeInfo.niche,
    storeInfo.previewUrl,
    storeInfo.createdAt,
    storeInfo.roas,
    storeInfo.status,
  )
  const existing = run.storesLive.findIndex(s => s.storeId === storeInfo.storeId)
  if (existing >= 0) {
    run.storesLive[existing] = storeInfo
  } else {
    run.storesLive.push(storeInfo)
  }
  cache.set(runId, run)
}
