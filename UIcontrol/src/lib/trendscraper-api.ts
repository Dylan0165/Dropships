// Trendscraper API client
const BASE = (import.meta.env.VITE_TRENDSCRAPER_URL as string) ?? 'http://localhost:8001'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'online' | 'offline'
  timestamp: string
}

export interface RunRecord {
  id: number
  timestamp: string
  status: 'running' | 'completed' | 'failed'
  total_niches_found: number
}

export interface NicheCounts {
  pending: number
  approved: number
  rejected: number
  total: number
}

export interface StatusResponse {
  last_run: RunRecord | null
  next_run_time: string | null
  niche_counts: NicheCounts
}

export interface NicheRecord {
  id: number
  run_id: number
  name: string
  trend_score: number
  competition_level: 'low' | 'medium' | 'high'
  estimated_market_size: 'small' | 'medium' | 'large'
  recommended_audience: string
  sources: string // JSON string
  reasoning: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface ProductRecord {
  id: number
  niche_id: number
  cj_product_id: string
  name: string
  buy_price: number
  sell_price_suggested: number
  margin_percent: number
  delivery_days_nl: number
  virality_score: number
  image_url: string
  created_at: string
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText })) as { detail?: string }
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health')
}

export async function getStatus(): Promise<StatusResponse> {
  return apiFetch<StatusResponse>('/status')
}

export async function getRuns(): Promise<RunRecord[]> {
  return apiFetch<RunRecord[]>('/runs')
}

export async function getNiches(status?: string): Promise<NicheRecord[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiFetch<NicheRecord[]>(`/niches${qs}`)
}

export async function approveNiche(id: number): Promise<NicheRecord> {
  return apiFetch<NicheRecord>(`/niches/${id}/approve`, { method: 'POST' })
}

export async function rejectNiche(id: number): Promise<NicheRecord> {
  return apiFetch<NicheRecord>(`/niches/${id}/reject`, { method: 'POST' })
}

export async function triggerRun(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/run/trigger', { method: 'POST' })
}

export async function getProducts(nicheId: number): Promise<ProductRecord[]> {
  return apiFetch<ProductRecord[]>(`/products?niche_id=${nicheId}`)
}
