// ═══════ Agent identifiers ═══════

export type AgentId =
  | 'trend-agent'
  | 'niche-reviewer'
  | 'product-agent'
  | 'product-reviewer'
  | 'brand-agent'
  | 'store-builder'
  | 'store-reviewer'
  | 'ads-agent'
  | 'ads-reviewer'
  | 'growth-agent'
  | 'security-agent'

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_approval'
  | 'skipped'

export type AgentCategory = 'executor' | 'reviewer' | 'security' | 'analytics'

export type EscalationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type PipelineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

// ═══════ Agent configuration (static) ═══════

export interface AgentConfig {
  id: AgentId
  label: string
  category: AgentCategory
  model: 'deepseek-chat' | 'deepseek-reasoner'
  description: string
  position: { x: number; y: number }
}

// ═══════ Runtime types ═══════

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

export interface EscalationInfo {
  reason: string
  severity: EscalationSeverity
  createdAt: string
  resolvedAt: string | null
  decision: 'approve' | 'reject' | null
  opmerking: string | null
}

export interface AgentRun {
  agentId: AgentId
  status: AgentStatus
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
  attempt: number
  outputJson: Record<string, unknown> | null
  logs: LogEntry[]
  tokenCount: number
  costEur: number
  escalation: EscalationInfo | null
}

export interface StoreInfo {
  storeId: string
  subdomein: string
  niche: string
  previewUrl: string
  createdAt: string
  roas: number | null
  status: 'building' | 'live' | 'paused' | 'killed'
}

export interface PipelineRun {
  runId: string
  niche: string
  status: PipelineStatus
  startedAt: string
  completedAt: string | null
  agents: Record<AgentId, AgentRun>
  totalTokens: number
  totalCostEur: number
  storesLive: StoreInfo[]
  activeEscalations: number
}

// ═══════ WebSocket events ═══════

export interface WsEvent {
  type:
    | 'pipeline_started'
    | 'agent_started'
    | 'agent_log'
    | 'agent_completed'
    | 'agent_failed'
    | 'agent_escalation'
    | 'pipeline_completed'
    | 'pipeline_failed'
    | 'store_live'
  runId: string
  agentId?: AgentId
  payload: Record<string, unknown>
  timestamp: string
}
