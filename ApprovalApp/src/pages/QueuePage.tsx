import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle, Clock, Wifi, WifiOff } from 'lucide-react'
import { fetchPending, openWebSocket, type PendingApproval } from '../lib/api'
import ApprovalCard from '../components/ApprovalCard'

interface Props {
  onSelect: (item: PendingApproval) => void
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export default function QueuePage({ onSelect }: Props) {
  const [items, setItems] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [wsOk, setWsOk] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchPending()
      const sorted = [...data].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      )
      setItems(sorted)
      setLastRefresh(new Date())
    } catch {
      /* silently retry */
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => { load() }, [load])

  // WebSocket for real-time updates
  useEffect(() => {
    let ws: WebSocket
    let retryTimeout: ReturnType<typeof setTimeout>

    const connect = () => {
      ws = openWebSocket((msg: unknown) => {
        const event = msg as { type: string }
        // Refresh queue whenever something relevant happens
        if (
          event.type === 'agent_escalation' ||
          event.type === 'agent_completed' ||
          event.type === 'agent_failed' ||
          event.type === 'pipeline_completed'
        ) {
          load()
        }
      })
      ws.onopen = () => setWsOk(true)
      ws.onclose = () => {
        setWsOk(false)
        retryTimeout = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      clearTimeout(retryTimeout)
      ws?.close()
    }
  }, [load])

  return (
    <div className="flex flex-col h-full safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-800">
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Approvals</h1>
          {lastRefresh && (
            <p className="text-zinc-600 text-xs mt-0.5">
              {lastRefresh.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {wsOk
            ? <Wifi size={16} className="text-emerald-500" />
            : <WifiOff size={16} className="text-zinc-600" />
          }
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl bg-zinc-800 active:bg-zinc-700 transition-all active:scale-95"
          >
            <RefreshCw size={16} className={`text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {items.length > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {items.length}
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">
            <RefreshCw size={18} className="animate-spin mr-2" />
            Laden...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <CheckCircle size={40} className="text-emerald-500 mb-3" />
            <p className="text-white font-semibold">Alles goedgekeurd</p>
            <p className="text-zinc-500 text-sm mt-1">Geen openstaande goedkeuringen</p>
          </div>
        )}

        {items.map(item => (
          <ApprovalCard key={`${item.runId}-${item.agentId}`} item={item} onClick={() => onSelect(item)} />
        ))}
      </div>

      {/* Footer with pending count */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center gap-2 text-zinc-500 text-xs">
          <Clock size={13} />
          {items.length} wacht{items.length === 1 ? '' : 'en'} op jouw beslissing
        </div>
      )}
    </div>
  )
}
