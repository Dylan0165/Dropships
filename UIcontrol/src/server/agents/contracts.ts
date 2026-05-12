export interface AgentInput<T = Record<string, unknown>> {
  run_id: string
  niche: string
  previous_agent_output: T | null
}

export interface AgentOutput<T = Record<string, unknown>> {
  ok: boolean
  output: T | null
  inputTokens: number
  outputTokens: number
  attempts: number
  rawResponse: string
  error?: string
  validationErrors?: string[]
  durationMs: number
  costEur: number
}

export type AgentKind = 'EX' | 'RV' | 'AN' | 'SEC'
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'paused'

export interface AgentRegistryEntry {
  id: string
  label: string
  kind: AgentKind
  model: string
  timeoutMs: number
  maxRetries: number
  circuitBreakerThreshold: number
}
