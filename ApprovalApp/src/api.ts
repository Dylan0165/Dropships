const BASE = '/api'

export interface PendingApproval {
  runId: string
  agentId: string
  niche: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  createdAt: string
  outputJson: unknown
}

export async function verifyPin(pin: string): Promise<boolean> {
  const res = await fetch(`${BASE}/approvals/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  const data = await res.json()
  return data.ok === true
}

export async function getPending(): Promise<PendingApproval[]> {
  const res = await fetch(`${BASE}/approvals/pending`)
  if (!res.ok) return []
  return res.json()
}

export async function submitDecision(
  runId: string,
  agentId: string,
  decision: 'approve' | 'reject',
  opmerking?: string
): Promise<boolean> {
  const res = await fetch(`${BASE}/pipeline/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId, agentId, decision, opmerking }),
  })
  return res.ok
}
