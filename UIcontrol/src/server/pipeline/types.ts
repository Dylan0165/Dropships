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

// ── Wizard config ─────────────────────────────────────────────────────────────
// Wordt meegegeven door de store-wizard i.p.v. alleen een niche-string.
// Als deze aanwezig is slaat de engine de research-stages over (producten en
// doelgroep zijn al door de gebruiker gekozen) en krijgen brand/content agents
// de persona als extra context.

export interface WizardProduct {
  productId: string
  variantId?: string
  supplier?: string
  title: string
  image?: string
  description?: string
  costPriceUsd?: number
  priceEur: number
  compareAtPriceEur?: number
  reason?: string
}

export interface WizardConfig {
  idea: string
  persona: {
    label: string
    ageRange?: string
    interests?: string[]
    buyingMotivation?: string
    problem?: string
    priceRange?: { min: number; max: number }
    tone?: string
  }
  products: WizardProduct[]
  siteStructure?: {
    nicheType?: string
    pages?: Array<{ id: string; title: string; purpose?: string }>
    extras?: Array<{ id: string; title: string; purpose?: string }>
    rationale?: string
  }
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
  /** Aanwezig wanneer de run vanuit de store-wizard gestart is */
  config?: WizardConfig
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

export function initialState(runId: string, niche: string, config?: WizardConfig): PipelineState {
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
    ...(config ? { config } : {}),
  }
}
