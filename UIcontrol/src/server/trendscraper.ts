/**
 * Trendscraper proxy — calls the Python FastAPI service running on port 8001.
 * All calls degrade gracefully (return [] / null on failure) so the UI never crashes
 * when Trendscraper is offline.
 */

const BASE_URL = process.env.TRENDSCRAPER_URL || 'http://localhost:8001'
const TIMEOUT_MS = 5000

interface TrendNiche {
  id: number
  run_id: number
  name: string
  trend_score: number
  competition_level: string
  estimated_market_size: string
  recommended_audience: string
  sources: string
  reasoning: string
  status: 'pending' | 'approved' | 'rejected' | 'used'
  created_at: string
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    })
    return res
  } catch (err) {
    console.error(`[trendscraper] ${init?.method || 'GET'} ${url} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

export async function getNiches(status: 'all' | 'pending' | 'approved' | 'rejected' = 'pending'): Promise<TrendNiche[]> {
  const res = await fetchWithTimeout(`${BASE_URL}/niches?status=${status}`)
  if (!res || !res.ok) return []
  try {
    return await res.json() as TrendNiche[]
  } catch (err) {
    console.error('[trendscraper] failed to parse /niches response:', err)
    return []
  }
}

export async function approveNiche(nicheId: number): Promise<TrendNiche | null> {
  const res = await fetchWithTimeout(`${BASE_URL}/niches/${nicheId}/approve`, { method: 'POST' })
  if (!res || !res.ok) return null
  try {
    return await res.json() as TrendNiche
  } catch {
    return null
  }
}

export async function rejectNiche(nicheId: number): Promise<TrendNiche | null> {
  const res = await fetchWithTimeout(`${BASE_URL}/niches/${nicheId}/reject`, { method: 'POST' })
  if (!res || !res.ok) return null
  try {
    return await res.json() as TrendNiche
  } catch {
    return null
  }
}

/**
 * Mark a niche as 'used' in the Trendscraper DB so the same niche is not picked twice.
 * Trendscraper does not expose a 'used' state directly — we re-use the approve endpoint
 * (idempotent) and rely on UIcontrol's local 'used' tracking for hard dedupe.
 * If Trendscraper is updated with a /niches/{id}/use endpoint, swap it in here.
 */
export async function markNicheUsed(nicheName: string): Promise<boolean> {
  const all = await getNiches('all')
  const match = all.find(n => n.name.toLowerCase() === nicheName.toLowerCase())
  if (!match) return false
  const result = await approveNiche(match.id)
  return result !== null
}

export async function isReachable(): Promise<boolean> {
  const res = await fetchWithTimeout(`${BASE_URL}/health`)
  return !!res && res.ok
}
