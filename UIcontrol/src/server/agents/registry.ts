import type { AgentRegistryEntry } from './contracts.js'

// Adaptive model routing — env overrides take precedence
// Model IDs are bare (no opencode-go/ prefix) — prefix is only for CLI config
const EX_FAST   = process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-v4-flash'
const EX_BRAND  = process.env.LLM_MODEL_BRAND    ?? 'kimi-k2.6'
const EX_CONTENT = process.env.LLM_MODEL_CONTENT ?? 'kimi-k2.5'   // MiniMax uses Anthropic format, not OpenAI-compatible
const EX_STORE  = process.env.LLM_MODEL_STORE    ?? 'qwen3.6-plus'
const EX_GROWTH = process.env.LLM_MODEL_GROWTH   ?? 'qwen3.5-plus'
const RV_MODEL  = process.env.LLM_MODEL_REVIEWER ?? 'deepseek-v4-pro'

export const AGENT_REGISTRY: Record<string, AgentRegistryEntry> = {
  'trend-agent':       { id: 'trend-agent',       label: 'Trend Agent',       kind: 'EX',  model: EX_FAST,    timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'niche-reviewer':    { id: 'niche-reviewer',     label: 'Niche Reviewer',    kind: 'RV',  model: RV_MODEL,   timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'product-agent':     { id: 'product-agent',      label: 'Product Agent',     kind: 'EX',  model: EX_FAST,    timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'product-reviewer':  { id: 'product-reviewer',   label: 'Product Reviewer',  kind: 'RV',  model: RV_MODEL,   timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'brand-agent':       { id: 'brand-agent',        label: 'Brand Agent',       kind: 'EX',  model: EX_BRAND,   timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'content-agent':     { id: 'content-agent',      label: 'Content Agent',     kind: 'EX',  model: EX_CONTENT, timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'store-builder':     { id: 'store-builder',      label: 'Store Builder',     kind: 'EX',  model: EX_STORE,   timeoutMs: 180_000, maxRetries: 2, circuitBreakerThreshold: 2 },
  'build-validator':   { id: 'build-validator',    label: 'Build Validator',   kind: 'EX',  model: EX_FAST,    timeoutMs: 300_000, maxRetries: 1, circuitBreakerThreshold: 2 },
  'deploy-agent':      { id: 'deploy-agent',       label: 'Deploy Agent',      kind: 'EX',  model: EX_FAST,    timeoutMs: 600_000, maxRetries: 1, circuitBreakerThreshold: 2 },
  'store-reviewer':    { id: 'store-reviewer',     label: 'Store Reviewer',    kind: 'RV',  model: RV_MODEL,   timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'ads-agent':         { id: 'ads-agent',          label: 'Ads Agent',         kind: 'EX',  model: EX_GROWTH,  timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'ads-reviewer':      { id: 'ads-reviewer',       label: 'Ads Reviewer',      kind: 'RV',  model: RV_MODEL,   timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3 },
  'growth-agent':      { id: 'growth-agent',       label: 'Growth Agent',      kind: 'AN',  model: EX_GROWTH,  timeoutMs: 120_000, maxRetries: 2, circuitBreakerThreshold: 3 },
  'security-agent':    { id: 'security-agent',     label: 'Security Agent',    kind: 'SEC', model: EX_FAST,    timeoutMs: 120_000, maxRetries: 2, circuitBreakerThreshold: 3 },
}

export function getAgent(id: string): AgentRegistryEntry {
  return AGENT_REGISTRY[id] ?? {
    id, label: id, kind: 'EX', model: EX_FAST,
    timeoutMs: 120_000, maxRetries: 3, circuitBreakerThreshold: 3,
  }
}
