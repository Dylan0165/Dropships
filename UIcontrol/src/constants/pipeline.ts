import type { AgentConfig, AgentId } from '@/types'

// ═══════ Agent configuration (static, shared between client & server) ═══════

export const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'trend-agent',      label: 'Trend Agent',      category: 'executor',   model: 'deepseek-v4-flash',     description: 'Scans trending niches',          position: { x: 0,    y: 0   } },
  { id: 'niche-reviewer',   label: 'Niche Reviewer',   category: 'reviewer',   model: 'deepseek-v4-pro', description: 'Evaluates niche viability',       position: { x: 260,  y: 0   } },
  { id: 'product-agent',    label: 'Product Agent',     category: 'executor',   model: 'deepseek-v4-flash',     description: 'Finds products via Zendrop EU',  position: { x: 520,  y: 0   } },
  { id: 'product-reviewer', label: 'Product Reviewer',  category: 'reviewer',   model: 'deepseek-v4-pro', description: 'Selects best product',            position: { x: 780,  y: 0   } },
  { id: 'brand-agent',      label: 'Brand Agent',       category: 'executor',   model: 'deepseek-v4-flash',     description: 'Generates brand identity',        position: { x: 1040, y: 0   } },
  { id: 'store-builder',    label: 'Store Builder',     category: 'executor',   model: 'deepseek-v4-flash',     description: 'Assembles Next.js store',         position: { x: 1300, y: 0   } },
  { id: 'store-reviewer',   label: 'Store Reviewer',    category: 'reviewer',   model: 'deepseek-v4-pro', description: 'UI/UX quality check',             position: { x: 1560, y: 0   } },
  { id: 'ads-agent',        label: 'Ads Agent',         category: 'executor',   model: 'deepseek-v4-flash',     description: 'Creates ad content package',      position: { x: 1820, y: 0   } },
  { id: 'ads-reviewer',     label: 'Ads Reviewer',      category: 'reviewer',   model: 'deepseek-v4-pro', description: 'Validates ad compliance',         position: { x: 2080, y: 0   } },
  { id: 'growth-agent',     label: 'Growth Agent',      category: 'analytics',  model: 'deepseek-v4-pro', description: 'Weekly performance analysis',     position: { x: 1300, y: 220 } },
  { id: 'security-agent',   label: 'Security Agent',    category: 'security',   model: 'deepseek-v4-pro', description: 'Continuous security monitoring',  position: { x: 0,    y: 220 } },
]

export const PIPELINE_EDGES: { source: string; target: string; dashed?: boolean; label?: string }[] = [
  { source: 'trend-agent',      target: 'niche-reviewer' },
  { source: 'niche-reviewer',   target: 'product-agent' },
  { source: 'product-agent',    target: 'product-reviewer' },
  { source: 'product-reviewer', target: 'brand-agent' },
  { source: 'brand-agent',      target: 'store-builder' },
  { source: 'store-builder',    target: 'store-reviewer' },
  { source: 'store-reviewer',   target: 'ads-agent' },
  { source: 'ads-agent',        target: 'ads-reviewer' },
  { source: 'store-builder',    target: 'growth-agent',   dashed: true, label: 'weekly' },
  { source: 'store-builder',    target: 'security-agent', dashed: true, label: 'continuous' },
]

export const ALL_AGENT_IDS: AgentId[] = AGENT_CONFIGS.map(c => c.id)
