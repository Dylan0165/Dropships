import type { AgentId, PipelineRun, StoreInfo, WsEvent } from '@/types'

const BASE = '/api'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export async function startPipeline(niche: string): Promise<{ runId: string }> {
  const res = await fetch(`${BASE}/pipeline/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ niche }),
  })
  return json(res)
}

export async function stopPipeline(runId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/pipeline/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId }),
  })
  return json(res)
}

export async function approvePipeline(
  runId: string,
  agentId: AgentId,
  decision: 'approve' | 'reject',
  opmerking?: string,
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/pipeline/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId, agentId, decision, opmerking }),
  })
  return json(res)
}

export async function getRuns(): Promise<PipelineRun[]> {
  const res = await fetch(`${BASE}/runs`)
  return json(res)
}

export async function getRun(runId: string): Promise<PipelineRun> {
  const res = await fetch(`${BASE}/runs/${runId}`)
  return json(res)
}

export async function getAgentOutput(
  runId: string,
  agentId: AgentId,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/runs/${runId}/agents/${agentId}/output`)
  return json(res)
}

export async function getStores(): Promise<StoreInfo[]> {
  const res = await fetch(`${BASE}/stores`)
  return json(res)
}

export interface ComponentInfo {
  naam: string
  categorie: string
  pad: string
  beschrijving: string
  files: { name: string; content: string }[]
}

export async function getComponents(): Promise<ComponentInfo[]> {
  const res = await fetch(`${BASE}/components`)
  return json(res)
}

export interface DashboardStoreRow {
  storeId: string
  subdomein: string
  niche: string
  status: string
  createdAt: string
  roas: number
  revenue: number
  costs: number
  profit: number
  taxEstimate: number
  visitors: number
  orders: number
  conversionRate: number
  avgOrderValue: number
}

export interface DashboardData {
  summary: {
    revenueTotal: number
    costsTotal: number
    profitNet: number
    taxEstimate: number
    visitorsTotal: number
    ordersTotal: number
    conversionRate: number
    avgOrderValue: number
    roasAvg: number
  }
  revenueByDay: { date: string; revenue: number; costs: number }[]
  stores: DashboardStoreRow[]
}

export async function getDashboard(): Promise<DashboardData> {
  const res = await fetch(`${BASE}/dashboard`)
  return json(res)
}

// ═══════ Niches ═══════

export interface NicheSuggestion {
  id: number
  name: string
  trending_score: number
  active_advertisers: number
  market_size_eu: string
  viral_potential: number
  reasoning: string
  status: 'suggested' | 'used' | 'rejected'
  run_id: string | null
  created_at: string
  updated_at: string
}

export async function getNiches(): Promise<NicheSuggestion[]> {
  const res = await fetch(`${BASE}/niches`)
  return json(res)
}

export async function rescrapeNiches(): Promise<{ rescraped: number; niches: NicheSuggestion[] }> {
  const res = await fetch(`${BASE}/niches/rescrape`, { method: 'POST' })
  return json(res)
}

// ═══════ Settings ═══════

export async function getSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/settings`)
  return json(res)
}

export async function saveSetting(key: string, value: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  return json(res)
}
