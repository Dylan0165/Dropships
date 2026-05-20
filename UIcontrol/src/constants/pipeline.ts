import type { AgentConfig, AgentId } from '@/types'

// ═══════ Agent configuration (static, shared between client & server) ═══════
// Model wordt gelezen uit env: LLM_MODEL_EXECUTOR en LLM_MODEL_REVIEWER
// DeepSeek native: deepseek-chat (executors) / deepseek-reasoner (reviewers)
const EXECUTOR_MODEL = (typeof process !== 'undefined' ? process.env.LLM_MODEL_EXECUTOR : undefined) ?? (typeof process !== 'undefined' ? process.env.LLM_MODEL : undefined) ?? 'deepseek-chat'
const REVIEWER_MODEL = (typeof process !== 'undefined' ? process.env.LLM_MODEL_REVIEWER : undefined) ?? (typeof process !== 'undefined' ? process.env.LLM_MODEL : undefined) ?? 'deepseek-reasoner'

export const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'trend-agent',      label: 'Trend Agent',      category: 'executor',   model: EXECUTOR_MODEL, description: 'Scans trending niches',          position: { x: 0,    y: 0   } },
  { id: 'niche-reviewer',   label: 'Niche Reviewer',   category: 'reviewer',   model: REVIEWER_MODEL, description: 'Evaluates niche viability',       position: { x: 260,  y: 0   } },
  { id: 'product-agent',    label: 'Product Agent',     category: 'executor',   model: EXECUTOR_MODEL, description: 'Finds products via Zendrop EU',  position: { x: 520,  y: 0   } },
  { id: 'product-reviewer', label: 'Product Reviewer',  category: 'reviewer',   model: REVIEWER_MODEL, description: 'Selects best product',            position: { x: 780,  y: 0   } },
  { id: 'brand-agent',      label: 'Brand Agent',       category: 'executor',   model: EXECUTOR_MODEL, description: 'Generates brand identity',        position: { x: 1040, y: 0   } },
  { id: 'store-builder',    label: 'Store Builder',     category: 'executor',   model: EXECUTOR_MODEL, description: 'Assembles Next.js store',         position: { x: 1300, y: 0   } },
  { id: 'store-reviewer',   label: 'Store Reviewer',    category: 'reviewer',   model: REVIEWER_MODEL, description: 'UI/UX quality check',             position: { x: 1560, y: 0   } },
  // growth-agent en security-agent zijn niet meer onderdeel van de standaard pipeline.
  // Ze blijven in de agent registry (registry.ts) zodat een toekomstige aparte tool
  // ze on-demand kan aanroepen.
]

export const PIPELINE_EDGES: { source: string; target: string; dashed?: boolean; label?: string }[] = [
  { source: 'trend-agent',      target: 'niche-reviewer' },
  { source: 'niche-reviewer',   target: 'product-agent' },
  { source: 'product-agent',    target: 'product-reviewer' },
  { source: 'product-reviewer', target: 'brand-agent' },
  { source: 'brand-agent',      target: 'store-builder' },
  { source: 'store-builder',    target: 'store-reviewer' },
  { source: 'store-builder',    target: 'growth-agent',   dashed: true, label: 'weekly' },
  { source: 'store-builder',    target: 'security-agent', dashed: true, label: 'continuous' },
]

export const ALL_AGENT_IDS: AgentId[] = AGENT_CONFIGS.map(c => c.id)
