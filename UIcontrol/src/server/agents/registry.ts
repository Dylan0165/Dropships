import type { AgentRegistryEntry } from './contracts.js'

const EX_MODEL  = process.env.LLM_MODEL_EXECUTOR ?? process.env.LLM_MODEL ?? 'deepseek-chat'
const RV_MODEL  = process.env.LLM_MODEL_REVIEWER ?? process.env.LLM_MODEL ?? 'deepseek-chat'

export const AGENT_REGISTRY: Record<string, AgentRegistryEntry> = {
  'trend-agent':       { id: 'trend-agent',       label: 'Trend Agent',       kind: 'EX',  model: EX_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'niche-reviewer':    { id: 'niche-reviewer',     label: 'Niche Reviewer',    kind: 'RV',  model: RV_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'product-agent':     { id: 'product-agent',      label: 'Product Agent',     kind: 'EX',  model: EX_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'product-reviewer':  { id: 'product-reviewer',   label: 'Product Reviewer',  kind: 'RV',  model: RV_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'brand-agent':       { id: 'brand-agent',        label: 'Brand Agent',       kind: 'EX',  model: EX_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'content-agent':     { id: 'content-agent',      label: 'Content Agent',     kind: 'EX',  model: EX_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'store-builder':     { id: 'store-builder',      label: 'Store Builder',     kind: 'EX',  model: EX_MODEL,                       timeoutMs: 180_000, maxRetries: 2, circuitBreakerThreshold: 2 },
  'build-validator':   { id: 'build-validator',    label: 'Build Validator',   kind: 'EX',  model: EX_MODEL,                       timeoutMs: 300_000, maxRetries: 1, circuitBreakerThreshold: 2 },
  'deploy-agent':      { id: 'deploy-agent',       label: 'Deploy Agent',      kind: 'EX',  model: EX_MODEL,                       timeoutMs: 600_000, maxRetries: 1, circuitBreakerThreshold: 2 },
  'store-reviewer':    { id: 'store-reviewer',     label: 'Store Reviewer',    kind: 'RV',  model: RV_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'ads-agent':         { id: 'ads-agent',          label: 'Ads Agent',         kind: 'EX',  model: EX_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'ads-reviewer':      { id: 'ads-reviewer',       label: 'Ads Reviewer',      kind: 'RV',  model: RV_MODEL,                       timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'growth-agent':      { id: 'growth-agent',       label: 'Growth Agent',      kind: 'AN',  model: EX_MODEL,                       timeoutMs: 120_000, maxRetries: 2, circuitBreakerThreshold: 3 },
  'security-agent':    { id: 'security-agent',     label: 'Security Agent',    kind: 'SEC', model: EX_MODEL,                       timeoutMs: 120_000, maxRetries: 2, circuitBreakerThreshold: 3 },
}

export function getAgent(id: string): AgentRegistryEntry {
  return AGENT_REGISTRY[id] ?? {
    id, label: id, kind: 'EX', model: EX_MODEL,
    timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3,
  }
}
