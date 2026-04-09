import { useState } from 'react'
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import type { AgentId, EscalationInfo, EscalationSeverity } from '@/types'

const SEVERITY_STYLE: Record<EscalationSeverity, { bg: string; border: string; text: string; badge: string }> = {
  LOW:      { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400',  badge: 'bg-yellow-500/15 text-yellow-300' },
  MEDIUM:   { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400',  badge: 'bg-orange-500/15 text-orange-300' },
  HIGH:     { bg: 'bg-red-500/10',    border: 'border-red-500/20',    text: 'text-red-400',     badge: 'bg-red-500/15 text-red-300' },
  CRITICAL: { bg: 'bg-red-500/15',    border: 'border-red-400/30',    text: 'text-red-300',     badge: 'bg-red-500/15 text-red-200 animate-pulse' },
}

interface Props {
  runId: string
  agentId: AgentId
  escalation: EscalationInfo
  onResolved: () => void
  onApprove: (agentId: AgentId, decision: 'approve' | 'reject', opmerking?: string) => Promise<void>
}

export function ApprovalPanel({ agentId, escalation, onResolved, onApprove }: Props) {
  const [opmerking, setOpmerking] = useState('')
  const [loading, setLoading] = useState(false)

  const sty = SEVERITY_STYLE[escalation.severity]

  const handleDecision = async (decision: 'approve' | 'reject') => {
    setLoading(true)
    try {
      await onApprove(agentId, decision, opmerking || undefined)
      onResolved()
    } finally {
      setLoading(false)
    }
  }

  if (escalation.decision) {
    const isApproved = escalation.decision === 'approve'
    return (
      <div className="border-t border-white/[0.06] p-3">
        <div className={clsx('rounded-xl border p-3', isApproved ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-red-500/8 border-red-500/20')}>
          <div className="flex items-center gap-2 mb-2">
            {isApproved
              ? <CheckCircle size={13} className="text-emerald-400" />
              : <XCircle size={13} className="text-red-400" />
            }
            <span className={clsx('text-xs font-semibold', isApproved ? 'text-emerald-400' : 'text-red-400')}>
              {isApproved ? 'Approved' : 'Rejected'}
            </span>
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-md font-bold ml-auto', sty.badge)}>
              {escalation.severity}
            </span>
          </div>
          <p className="text-slate-400 text-xs">{escalation.reason}</p>
          {escalation.opmerking && (
            <p className="text-slate-500 text-[11px] mt-1.5 italic border-l-2 border-white/[0.08] pl-2">"{escalation.opmerking}"</p>
          )}
          {escalation.resolvedAt && (
            <p className="text-slate-600 text-[10px] mt-2">{new Date(escalation.resolvedAt).toLocaleString()}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-white/[0.06] p-3 space-y-2.5">
      <div className={clsx('rounded-xl border p-3', sty.bg, sty.border)}>
        <div className="flex items-start gap-2">
          <AlertTriangle size={13} className={clsx('mt-0.5 flex-shrink-0', sty.text)} />
          <div className="flex-1 min-w-0">
            <span className={clsx('inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md mb-1', sty.badge)}>
              {escalation.severity}
            </span>
            <p className={clsx('text-xs leading-relaxed', sty.text)}>{escalation.reason}</p>
          </div>
        </div>
      </div>

      <textarea
        value={opmerking}
        onChange={(e) => setOpmerking(e.target.value)}
        placeholder="Optional comment..."
        rows={2}
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 resize-none focus:outline-none focus:border-violet-500/40 transition-colors"
      />

      <div className="flex gap-2">
        <button
          onClick={() => handleDecision('approve')}
          disabled={loading}
          className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 disabled:opacity-40 text-emerald-400 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
          Approve
        </button>
        <button
          onClick={() => handleDecision('reject')}
          disabled={loading}
          className="flex-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 disabled:opacity-40 text-red-400 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
          Reject
        </button>
      </div>
    </div>
  )
}
