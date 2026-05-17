import { useState, useEffect, useCallback } from 'react'
import { verifyPin, getPending, submitDecision, PendingApproval } from './api'

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

export default function App() {
  const [pin, setPin] = useState('')
  const [authed, setAuthed] = useState(false)
  const [pinError, setPinError] = useState(false)
  const [pending, setPending] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getPending()
    setPending(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authed) return
    load()
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [authed, load])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const ok = await verifyPin(pin)
    if (ok) {
      setAuthed(true)
      setPinError(false)
    } else {
      setPinError(true)
      setPin('')
    }
  }

  async function decide(item: PendingApproval, decision: 'approve' | 'reject') {
    const key = `${item.runId}-${item.agentId}`
    setBusy(b => ({ ...b, [key]: true }))
    await submitDecision(item.runId, item.agentId, decision, notes[key])
    await load()
    setBusy(b => ({ ...b, [key]: false }))
  }

  if (!authed) {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <h1 style={styles.title}>Dropship Approvals</h1>
          <p style={styles.sub}>Voer je PIN in om door te gaan</p>
          <form onSubmit={handleLogin} style={styles.form}>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="PIN"
              maxLength={8}
              style={{ ...styles.input, borderColor: pinError ? '#ef4444' : '#2d3748' }}
              autoFocus
            />
            {pinError && <p style={styles.err}>Verkeerde PIN</p>}
            <button type="submit" style={styles.btn}>Inloggen</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.title}>Escalaties</span>
        <span style={{ color: '#64748b', fontSize: 13 }}>
          {loading ? 'Laden...' : `${pending.length} openstaand`}
        </span>
      </header>

      {pending.length === 0 && !loading && (
        <div style={styles.empty}>Geen openstaande escalaties</div>
      )}

      <div style={styles.list}>
        {pending.map(item => {
          const key = `${item.runId}-${item.agentId}`
          return (
            <div key={key} style={styles.item}>
              <div style={styles.itemHeader}>
                <span style={{ ...styles.badge, background: SEVERITY_COLOR[item.severity] ?? '#64748b' }}>
                  {item.severity.toUpperCase()}
                </span>
                <span style={styles.agentId}>{item.agentId}</span>
                <span style={styles.niche}>{item.niche}</span>
              </div>

              <p style={styles.reason}>{item.reason}</p>

              {item.outputJson && (
                <details style={styles.details}>
                  <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: 12 }}>Agent output</summary>
                  <pre style={styles.pre}>{JSON.stringify(item.outputJson, null, 2)}</pre>
                </details>
              )}

              <textarea
                placeholder="Opmerking (optioneel)"
                value={notes[key] ?? ''}
                onChange={e => setNotes(n => ({ ...n, [key]: e.target.value }))}
                style={styles.textarea}
                rows={2}
              />

              <div style={styles.actions}>
                <button
                  onClick={() => decide(item, 'approve')}
                  disabled={busy[key]}
                  style={{ ...styles.btn, background: '#16a34a' }}
                >
                  Goedkeuren
                </button>
                <button
                  onClick={() => decide(item, 'reject')}
                  disabled={busy[key]}
                  style={{ ...styles.btn, background: '#dc2626' }}
                >
                  Afwijzen
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' },
  card: { background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 12, padding: 32, width: 320 },
  page: { maxWidth: 720, margin: '0 auto', padding: '24px 16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 700, color: '#e2e8f0' },
  sub: { color: '#64748b', fontSize: 14, margin: '8px 0 20px' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { background: '#0f1117', border: '1px solid', borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 16, outline: 'none' },
  btn: { background: '#3b82f6', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  err: { color: '#ef4444', fontSize: 13 },
  empty: { textAlign: 'center', color: '#64748b', padding: 48, fontSize: 15 },
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  item: { background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 12, padding: 20 },
  itemHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  badge: { borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#fff' },
  agentId: { fontWeight: 600, color: '#94a3b8', fontSize: 13 },
  niche: { color: '#e2e8f0', fontSize: 13, marginLeft: 'auto' },
  reason: { color: '#cbd5e1', fontSize: 14, lineHeight: 1.5, marginBottom: 12 },
  details: { marginBottom: 12 },
  pre: { background: '#0f1117', borderRadius: 8, padding: 12, fontSize: 11, color: '#94a3b8', overflow: 'auto', maxHeight: 200, marginTop: 8 },
  textarea: { width: '100%', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, resize: 'vertical', marginBottom: 12, outline: 'none' },
  actions: { display: 'flex', gap: 10 },
}
