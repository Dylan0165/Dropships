// ═══════ Pipeline v3 — types ═══════

export const STAGES = [
  'trend-discovery',
  'niche-review',
  'product-research',
  'product-review',
  'brand-creation',
  'content-generation',
  'store-build',
  'build-validate',
  'deploy',
  'health-check',
  'growth',
] as const

export type Stage = typeof STAGES[number]

export type StageStatus =
  | 'pending'
  | 'running'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'skipped'
  | 'uncertain'

export interface StageState {
  status: StageStatus
  startedAt?: string
  finishedAt?: string
  output?: unknown
  error?: string
  retries: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
  verdict?: 'APPROVED' | 'REJECTED' | 'UNCERTAIN'
  reason?: string
}

export interface PipelineState {
  runId: string
  niche: string
  currentStage: Stage
  stages: Record<Stage, StageState>
  storeId?: string
  storeUrl?: string
  paused: boolean
  cancelled: boolean
  startedAt: string
  finishedAt?: string
}

export interface AgentResult {
  ok: boolean
  output: Record<string, unknown> | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  attempts: number
  durationMs: number
  rawResponse: string
  error?: string
  validationErrors?: string[]
}

export type ReviewerVerdict = 'APPROVED' | 'REJECTED' | 'UNCERTAIN'

export interface ReviewerOutput {
  verdict: ReviewerVerdict
  reason: string
  score?: number
  suggestions?: string[]
}

export function emptyStageState(): StageState {
  return {
    status: 'pending',
    retries: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    durationMs: 0,
  }
}

export function initialState(runId: string, niche: string): PipelineState {
  const stages = {} as Record<Stage, StageState>
  for (const s of STAGES) stages[s] = emptyStageState()
  return {
    runId,
    niche,
    currentStage: STAGES[0],
    stages,
    paused: false,
    cancelled: false,
    startedAt: new Date().toISOString(),
  }
}
