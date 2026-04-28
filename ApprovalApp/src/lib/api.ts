const BASE = import.meta.env.VITE_API_URL ?? ''

export interface PendingApproval {
  runId: string
  agentId: string
  niche: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  reason: string
  createdAt: string
  outputJson: Record<string, unknown> | null
}

export interface DecidePayload {
  runId: string
  agentId: string
  decision: 'approve' | 'reject'
  opmerking?: string
}

/** Verify PIN against the server */
export async function verifyPin(pin: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/approvals/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  if (!res.ok) return false
  const data = await res.json()
  return data.ok === true
}

/** Fetch all pending approvals */
export async function fetchPending(): Promise<PendingApproval[]> {
  const res = await fetch(`${BASE}/api/approvals/pending`)
  if (!res.ok) throw new Error('Kon approvals niet laden')
  return res.json()
}

/** Send approve/reject decision */
export async function decide(payload: DecidePayload): Promise<void> {
  const res = await fetch(`${BASE}/api/pipeline/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Beslissing mislukt')
}

/** Open a WebSocket to the UIcontrol backend */
export function openWebSocket(onMessage: (data: unknown) => void): WebSocket {
  const wsBase = BASE.replace(/^http/, 'ws')
  const ws = new WebSocket(`${wsBase}/ws`)
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch { /* ignore */ }
  }
  return ws
}
