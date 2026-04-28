import { useState } from 'react'
import { ArrowLeft, CheckCircle, XCircle, Loader2, AlertTriangle, Info } from 'lucide-react'
import { decide, type PendingApproval } from '../lib/api'

interface Props {
  item: PendingApproval
  onBack: () => void
  onDone: () => void
}

const SEVERITY_COLORS = {
  LOW:      { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300' },
  MEDIUM:   { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' },
  HIGH:     { bg: 'bg-red-500/10',    border: 'border-red-500/20',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-300' },
  CRITICAL: { bg: 'bg-red-500/15',    border: 'border-red-400/30',    text: 'text-red-300',    badge: 'bg-red-500/20 text-red-200' },
}

const AGENT_LABELS: Record<string, string> = {
  'trend-agent':       'Trend Agent',
  'niche-reviewer':    'Niche Reviewer',
  'product-agent':     'Product Agent',
  'product-reviewer':  'Product Reviewer',
  'brand-agent':       'Brand Agent',
  'store-builder':     'Store Builder',
  'store-reviewer':    'Store Reviewer',
  'ads-agent':         'Ads Agent',
  'ads-reviewer':      'Ads Reviewer',
  'growth-agent':      'Growth Agent',
  'security-agent':    'Security Agent',
}

export default function ApprovalDetail({ item, onBack, onDone }: Props) {
  const [opmerking, setOpmerking] = useState('')
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [done, setDone] = useState<'approve' | 'reject' | null>(null)

  const sty = SEVERITY_COLORS[item.severity]

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (loading) return
    setLoading(decision)
    try {
      await decide({ runId: item.runId, agentId: item.agentId, decision, opmerking: opmerking || undefined })
      setDone(decision)
      setTimeout(onDone, 1200)
    } catch {
      setLoading(null)
    }
  }

  // Success state
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-full safe-top safe-bottom text-center px-6">
        {done === 'approve'
          ? <CheckCircle size={56} className="text-emerald-500 mb-4" />
          : <XCircle size={56} className="text-red-500 mb-4" />
        }
        <p className="text-white font-bold text-xl">
          {done === 'approve' ? 'Goedgekeurd!' : 'Afgewezen'}
        </p>
        <p className="text-zinc-500 text-sm mt-2">Pipeline gaat verder...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-zinc-800">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-zinc-800 active:bg-zinc-700 transition-all active:scale-95"
        >
          <ArrowLeft size={18} className="text-zinc-400" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {AGENT_LABELS[item.agentId] ?? item.agentId}
          </p>
          <p className="text-zinc-500 text-xs truncate">{item.niche}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${sty.badge}`}>
          {item.severity}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Reason card */}
        <div className={`rounded-2xl border p-4 ${sty.bg} ${sty.border}`}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className={`${sty.text} flex-shrink-0 mt-0.5`} />
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Reden voor escalatie
              </p>
              <p className={`text-sm leading-relaxed ${sty.text}`}>{item.reason}</p>
            </div>
          </div>
        </div>

        {/* Run info */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Info size={14} className="text-zinc-500" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Details</p>
          </div>
          <InfoRow label="Niche" value={item.niche} />
          <InfoRow label="Agent" value={AGENT_LABELS[item.agentId] ?? item.agentId} />
          <InfoRow label="Run ID" value={item.runId.slice(0, 8) + '...'} />
          <InfoRow label="Tijdstip" value={new Date(item.createdAt).toLocaleString('nl-NL')} />
        </div>

        {/* Agent output preview */}
        {item.outputJson && Object.keys(item.outputJson).length > 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Agent output
            </p>
            <div className="space-y-1.5">
              {Object.entries(item.outputJson).slice(0, 8).map(([k, v]) => (
                <InfoRow
                  key={k}
                  label={k}
                  value={typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Comment input */}
        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
            Opmerking (optioneel)
          </label>
          <textarea
            value={opmerking}
            onChange={e => setOpmerking(e.target.value)}
            placeholder="Voeg een opmerking toe..."
            rows={3}
            className="w-full bg-zinc-800/60 border border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </div>
      </div>

      {/* Big action buttons — always visible at bottom */}
      <div className="px-4 pb-4 pt-3 border-t border-zinc-800 space-y-3">
        <button
          onClick={() => handleDecision('approve')}
          disabled={!!loading}
          className="w-full h-16 rounded-2xl bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-emerald-900/30"
        >
          {loading === 'approve'
            ? <Loader2 size={22} className="animate-spin" />
            : <CheckCircle size={22} />
          }
          Goedkeuren
        </button>

        <button
          onClick={() => handleDecision('reject')}
          disabled={!!loading}
          className="w-full h-16 rounded-2xl bg-red-600/80 active:bg-red-700 disabled:opacity-50 text-white font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
        >
          {loading === 'reject'
            ? <Loader2 size={22} className="animate-spin" />
            : <XCircle size={22} />
          }
          Afwijzen
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-zinc-500 text-xs flex-shrink-0">{label}</span>
      <span className="text-zinc-300 text-xs text-right break-all">{value}</span>
    </div>
  )
}
