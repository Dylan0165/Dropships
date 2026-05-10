import { useState, useRef, useEffect } from 'react'
import { X, Clock, Hash, Euro, CheckCircle2, AlertCircle, Info, Loader2, Zap, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import type { AgentId, AgentRun, LogEntry } from '@/types'
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

// ── Log message parser — turns raw strings into human-readable lines ──────────

interface ParsedLog {
  icon: React.ReactNode
  text: string
  sub?: string
  isLink?: boolean
  linkHref?: string
  accent?: string
}

function parseLogMessage(entry: LogEntry): ParsedLog {
  const msg = entry.message

  // Store live/deployed
  const storeMatch = msg.match(/Store.*?(?:live|deployed)[:\s]+?(https?:\/\/\S+)/i)
  if (storeMatch) return {
    icon: <Zap size={11} className="text-emerald-400 flex-shrink-0 mt-0.5" />,
    text: 'Store live',
    sub: storeMatch[1],
    isLink: true,
    linkHref: storeMatch[1],
    accent: 'text-emerald-400',
  }

  // Completed with stats: "Completed in 12.3s — 4521 tokens, €0.0006"
  const completedMatch = msg.match(/Completed in ([\d.]+)s\s*[—–-]\s*([\d,]+) tokens,\s*€([\d.]+)/i)
  if (completedMatch) return {
    icon: <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0 mt-0.5" />,
    text: `Done in ${completedMatch[1]}s`,
    sub: `${completedMatch[2]} tokens · €${completedMatch[3]}`,
    accent: 'text-emerald-400',
  }

  // Attempt calling model: "attempt 1/3 — calling deepseek-chat"
  const attemptCallMatch = msg.match(/attempt (\d+)\/(\d+)\s*[—–-]\s*calling (.+)/i)
  if (attemptCallMatch) return {
    icon: <Loader2 size={11} className="text-zinc-400 flex-shrink-0 mt-0.5 animate-spin" />,
    text: `Poging ${attemptCallMatch[1]} van ${attemptCallMatch[2]}`,
    sub: `→ ${attemptCallMatch[3]}`,
  }

  // Output validated: "attempt 1: output validated"
  const validatedMatch = msg.match(/attempt \d+: output validated/i)
  if (validatedMatch) return {
    icon: <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0 mt-0.5" />,
    text: 'Output gevalideerd',
    accent: 'text-emerald-400',
  }

  // Validation failed: "attempt 1: validation failed — ..."
  const validFailMatch = msg.match(/attempt \d+: validation failed\s*[—–-]\s*(.+)/i)
  if (validFailMatch) return {
    icon: <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />,
    text: 'Validatie mislukt',
    sub: validFailMatch[1].slice(0, 120),
    accent: 'text-amber-400',
  }

  // Running agent: "Running X via agent-runner"
  const runningMatch = msg.match(/Running (.+?) via agent-runner/i)
  if (runningMatch) return {
    icon: <Loader2 size={11} className="text-zinc-400 flex-shrink-0 mt-0.5" />,
    text: `Agent gestart`,
    sub: runningMatch[1],
  }

  // Human decision: "Human decision: approve — "..."
  const decisionMatch = msg.match(/Human decision:\s*(\w+)(.*)/i)
  if (decisionMatch) return {
    icon: <CheckCircle2 size={11} className="text-white flex-shrink-0 mt-0.5" />,
    text: `Besluit: ${decisionMatch[1]}`,
    sub: decisionMatch[2].trim().replace(/^[—–-]\s*"?/, '').replace(/"$/, '') || undefined,
    accent: 'text-white',
  }

  // Image generation
  const imgMatch = msg.match(/Productafbeeldingen gegenereerd:\s*(.+)/i)
  if (imgMatch) return {
    icon: <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0 mt-0.5" />,
    text: `Afbeeldingen: ${imgMatch[1]}`,
    accent: 'text-emerald-400',
  }

  // Store deploy failed (non-fatal)
  const deployFailMatch = msg.match(/Store deploy mislukt|Store deploy overgeslagen/i)
  if (deployFailMatch) return {
    icon: <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />,
    text: 'Store deploy overgeslagen',
    sub: msg.replace(/Store deploy mislukt.*?:\s*/i, '').replace(/Store deploy overgeslagen:\s*/i, '').slice(0, 100),
    accent: 'text-amber-400',
  }

  // Agent failed: "Agent failed after N attempt(s): REASON"
  const agentFailMatch = msg.match(/Agent failed after (\d+) attempt.*?:\s*(.+)/i)
  if (agentFailMatch) return {
    icon: <AlertCircle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />,
    text: `Mislukt na ${agentFailMatch[1]} poging${parseInt(agentFailMatch[1]) > 1 ? 'en' : ''}`,
    sub: agentFailMatch[2].slice(0, 120),
    accent: 'text-red-400',
  }

  // Reviewer: "Reviewer flagged UNCERTAIN"
  if (msg.toLowerCase().includes('uncertain')) return {
    icon: <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />,
    text: 'Reviewer: handmatige controle vereist',
    sub: msg.replace(/.*reviewer flagged uncertain/i, '').trim() || undefined,
    accent: 'text-amber-400',
  }

  // Generic error
  if (entry.level === 'error') return {
    icon: <AlertCircle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />,
    text: msg.slice(0, 100),
    sub: msg.length > 100 ? msg.slice(100, 200) : undefined,
    accent: 'text-red-400',
  }

  // Generic warning
  if (entry.level === 'warn') return {
    icon: <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />,
    text: msg.slice(0, 100),
    sub: msg.length > 100 ? msg.slice(100, 200) : undefined,
    accent: 'text-amber-400',
  }

  // Default info
  return {
    icon: <Info size={11} className="text-zinc-600 flex-shrink-0 mt-0.5" />,
    text: msg.slice(0, 120),
    sub: msg.length > 120 ? msg.slice(120, 240) : undefined,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LogPanel({ agentId, run, runId, onClose, onApprove }: Props) {
  const [tab, setTab] = useState<'logs' | 'output'>('logs')
  const logEndRef = useRef<HTMLDivElement>(null)
  const cfg = AGENT_CONFIGS.find((c) => c.id === agentId)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [run.logs.length])

  const formatDuration = (ms: number | null) => {
    if (ms == null) return '—'
    const s = Math.floor(ms / 1000)
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div className="w-[380px] flex-shrink-0 border-l border-white/[0.07] flex flex-col h-full bg-[#0e0e0e] animate-slide-in-right">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-white font-semibold text-sm">{cfg?.label ?? agentId}</span>
            <StatusPill status={run.status} />
          </div>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-white hover:bg-white/[0.06] p-1.5 rounded-lg transition-all"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Metrics */}
      {(run.status === 'running' || run.status === 'completed' || run.status === 'failed') && (
        <div className="grid grid-cols-3 gap-2 px-3 pt-3 pb-1">
          {[
            { Icon: Clock, label: 'Duur',    value: formatDuration(run.durationMs) },
            { Icon: Hash,  label: 'Tokens',  value: run.tokenCount > 0 ? run.tokenCount.toLocaleString() : '—' },
            { Icon: Euro,  label: 'Kosten',  value: run.costEur > 0 ? `€${run.costEur.toFixed(4)}` : '—' },
          ].map((m) => (
            <div key={m.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
              <m.Icon size={11} className="text-zinc-700 mx-auto mb-1" />
              <div className="text-white text-xs font-semibold font-mono">{m.value}</div>
              <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Attempt indicator */}
      {run.attempt > 1 && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 bg-amber-500/[0.08] border border-amber-500/20 rounded-lg flex items-center gap-1.5">
          <AlertCircle size={11} className="text-amber-400" />
          <span className="text-amber-400 text-[11px]">Poging {run.attempt} — vorige poging mislukt</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-white/[0.07] px-3 pt-2">
        {(['logs', 'output'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'relative px-3 py-2 text-xs capitalize transition-all',
              tab === t ? 'text-white' : 'text-zinc-600 hover:text-zinc-400',
            )}
          >
            {t === 'logs' ? 'Logs' : 'Output'}
            {tab === t && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-white rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'logs' ? (
          <div className="p-3 space-y-0.5">
            {run.logs.length === 0 && (
              <p className="text-zinc-700 text-xs text-center mt-8">Wachten op logs…</p>
            )}
            {run.logs.map((entry, i) => {
              const parsed = parseLogMessage(entry)
              return (
                <div key={i} className="flex gap-2.5 py-1.5 px-2 rounded-lg hover:bg-white/[0.02] group">
                  {/* Time */}
                  <span className="text-[10px] text-zinc-700 whitespace-nowrap flex-shrink-0 pt-0.5 font-mono w-14 text-right">
                    {new Date(entry.timestamp).toLocaleTimeString('nl', {
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </span>
                  {/* Icon */}
                  <div className="flex-shrink-0 pt-0.5">{parsed.icon}</div>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <span className={clsx('text-[12px] leading-5 font-medium', parsed.accent ?? 'text-zinc-200')}>
                      {parsed.isLink ? (
                        <a href={parsed.linkHref} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-1 hover:underline">
                          {parsed.text}
                          <ExternalLink size={10} />
                        </a>
                      ) : parsed.text}
                    </span>
                    {parsed.sub && (
                      <div className="text-[10px] text-zinc-600 mt-0.5 break-all leading-4">
                        {parsed.isLink ? (
                          <a href={parsed.linkHref} target="_blank" rel="noopener noreferrer"
                             className="hover:text-zinc-400 transition-colors">{parsed.sub}</a>
                        ) : parsed.sub}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={logEndRef} />
          </div>
        ) : (
          <div className="p-3">
            <OutputPanel outputJson={run.outputJson} agentId={agentId} />
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
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    idle:             { bg: 'bg-white/[0.04]',    text: 'text-zinc-500',   dot: 'bg-zinc-600',                    label: 'Wacht' },
    running:          { bg: 'bg-emerald-500/10',  text: 'text-emerald-400',dot: 'bg-emerald-400 animate-pulse',   label: 'Actief' },
    completed:        { bg: 'bg-white/[0.05]',    text: 'text-white',      dot: 'bg-white',                       label: 'Klaar' },
    failed:           { bg: 'bg-red-500/10',      text: 'text-red-400',    dot: 'bg-red-400',                     label: 'Mislukt' },
    waiting_approval: { bg: 'bg-amber-500/10',    text: 'text-amber-400',  dot: 'bg-amber-400 animate-pulse',     label: 'Wacht op review' },
    skipped:          { bg: 'bg-white/[0.03]',    text: 'text-zinc-600',   dot: 'bg-zinc-700',                    label: 'Overgeslagen' },
  }
  const s = map[status] ?? map.idle
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full', s.bg, s.text)}>
      <span className={clsx('w-1 h-1 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}
