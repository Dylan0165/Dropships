import { useState, useRef, useEffect } from 'react'
import { X, Clock, Hash, Euro } from 'lucide-react'
import clsx from 'clsx'
import type { AgentId, AgentRun } from '@/types'
import { AGENT_CONFIGS } from '@/constants/pipeline'
import { OutputPanel } from './OutputPanel'
import { ApprovalPanel } from './ApprovalPanel'

interface Props {
  agentId: AgentId
  run: AgentRun
  runId: string
  onClose: () => void
  onApprove: (agentId: AgentId, decision: 'approve' | 'reject', opmerking?: string) => Promise<void>
}

const CATEGORY_ACCENT: Record<string, string> = {
  executor:  'from-violet-600/15',
  reviewer:  'from-teal-600/15',
  security:  'from-red-600/15',
  analytics: 'from-blue-600/15',
}

export function LogPanel({ agentId, run, runId, onClose, onApprove }: Props) {
  const [tab, setTab] = useState<'logs' | 'output'>('logs')
  const logEndRef = useRef<HTMLDivElement>(null)
  const cfg = AGENT_CONFIGS.find((c) => c.id === agentId)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [run.logs.length])

  const formatDuration = (ms: number | null) => {
    if (ms == null) return '\u2014'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  const accent = CATEGORY_ACCENT[cfg?.category ?? 'executor']

  return (
    <div className="w-[380px] flex-shrink-0 border-l border-white/[0.06] flex flex-col h-full bg-[#0d1117] animate-slide-in-right">
      {/* Header */}
      <div className={clsx('px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r to-transparent', accent)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-white font-semibold text-sm">{cfg?.label ?? agentId}</span>
            <StatusPill status={run.status} />
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] p-1.5 rounded-lg transition-all"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Metrics */}
      {(run.status === 'running' || run.status === 'completed') && (
        <div className="grid grid-cols-3 gap-2 px-3 pt-3 pb-1">
          {[
            { Icon: Clock, label: 'Duration', value: formatDuration(run.durationMs) },
            { Icon: Hash,  label: 'Tokens',   value: run.tokenCount > 0 ? run.tokenCount.toLocaleString() : '\u2014' },
            { Icon: Euro,  label: 'Cost',     value: run.costEur > 0 ? `\u20ac${run.costEur.toFixed(4)}` : '\u2014' },
          ].map((m) => (
            <div key={m.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
              <m.Icon size={11} className="text-slate-600 mx-auto mb-1" />
              <div className="text-white text-xs font-semibold">{m.value}</div>
              <div className="text-[9px] text-slate-600 mt-0.5 uppercase tracking-wider">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-white/[0.06] px-3 pt-1">
        {(['logs', 'output'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'relative px-3 py-2 text-xs capitalize transition-all',
              tab === t ? 'text-white' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {t}
            {tab === t && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-violet-500 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'logs' ? (
          <div className="p-3 font-mono">
            {run.logs.length === 0 && (
              <p className="text-slate-600 text-xs text-center mt-8">No logs yet</p>
            )}
            {run.logs.map((l, i) => (
              <div key={i} className="flex gap-2 text-[11px] leading-5 hover:bg-white/[0.02] px-1 rounded">
                <span className="text-[10px] text-slate-700 whitespace-nowrap w-14 flex-shrink-0 pt-0.5">
                  {new Date(l.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span
                  className={clsx(
                    'flex-1 break-all',
                    l.level === 'error' && 'text-red-400',
                    l.level === 'warn'  && 'text-amber-400',
                    l.level === 'debug' && 'text-slate-600',
                    l.level === 'info'  && 'text-slate-300',
                  )}
                >
                  {l.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        ) : (
          <div className="p-3">
            <OutputPanel outputJson={run.outputJson} />
          </div>
        )}
      </div>

      {/* Approval */}
      {run.status === 'waiting_approval' && run.escalation && (
        <ApprovalPanel
          runId={runId}
          agentId={agentId}
          escalation={run.escalation}
          onResolved={() => {}}
          onApprove={onApprove}
        />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    idle:             { bg: 'bg-slate-800/50',   text: 'text-slate-500',   dot: 'bg-slate-600' },
    running:          { bg: 'bg-emerald-900/30', text: 'text-emerald-400', dot: 'bg-emerald-400 animate-pulse' },
    completed:        { bg: 'bg-slate-800/50',   text: 'text-emerald-500', dot: 'bg-emerald-500' },
    failed:           { bg: 'bg-red-900/30',     text: 'text-red-400',     dot: 'bg-red-400' },
    waiting_approval: { bg: 'bg-amber-900/30',   text: 'text-amber-400',   dot: 'bg-amber-400 animate-pulse' },
    skipped:          { bg: 'bg-slate-800/50',   text: 'text-slate-500',   dot: 'bg-slate-600' },
  }
  const s = map[status] ?? map.idle
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full', s.bg, s.text)}>
      <span className={clsx('w-1 h-1 rounded-full', s.dot)} />
      {status.replace('_', '\u00a0')}
    </span>
  )
}



