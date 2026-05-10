import { useEffect, useState } from 'react'
import { RefreshCw, ChevronRight, Clock, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import type { PipelineRun } from '@/types'
import { getRuns } from '@/lib/api'
import { AGENT_CONFIGS } from '@/constants/pipeline'

interface Props {
  onSelectRun: (runId: string) => void
}

export function RunsView({ onSelectRun }: Props) {
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRuns = async () => {
    setLoading(true)
    try {
      const data = await getRuns()
      // Nieuwste eerst
      setRuns([...data].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRuns()
    const interval = setInterval(fetchRuns, 5000)
    return () => clearInterval(interval)
  }, [])

  const progressPercent = (run: PipelineRun) => {
    const vals = Object.values(run.agents)
    const completed = vals.filter((a) => a.status === 'completed').length
    return vals.length > 0 ? Math.round((completed / vals.length) * 100) : 0
  }

  const failedAgent = (run: PipelineRun): string | null => {
    const entry = Object.entries(run.agents).find(([, a]) => a.status === 'failed')
    if (!entry) return null
    const cfg = AGENT_CONFIGS.find((c) => c.id === entry[0])
    return cfg?.label ?? entry[0]
  }

  const storeDeployed = (run: PipelineRun) => run.storesLive?.length > 0

  type SK = 'idle' | 'running' | 'completed' | 'failed' | 'paused'
  const statusCfg: Record<SK, { Icon: React.ElementType; color: string; bg: string; border: string; spin?: boolean }> = {
    idle:      { Icon: Clock,       color: 'text-zinc-500',   bg: 'bg-white/[0.03]',  border: 'border-white/[0.07]' },
    running:   { Icon: Loader2,     color: 'text-emerald-400',bg: 'bg-white/[0.03]',  border: 'border-white/[0.1]', spin: true },
    completed: { Icon: CheckCircle, color: 'text-white',      bg: 'bg-white/[0.03]',  border: 'border-white/[0.07]' },
    failed:    { Icon: XCircle,     color: 'text-red-400',    bg: 'bg-red-500/[0.04]',border: 'border-red-500/20' },
    paused:    { Icon: AlertTriangle,color: 'text-amber-400', bg: 'bg-amber-500/[0.04]',border:'border-amber-500/20' },
  }

  const totalRuns   = runs.length
  const completedN  = runs.filter(r => r.status === 'completed').length
  const failedN     = runs.filter(r => r.status === 'failed').length
  const runningN    = runs.filter(r => r.status === 'running').length
  const totalCost   = runs.reduce((s, r) => s + (r.totalCostEur ?? 0), 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.07]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-base font-semibold text-white">Run History</h1>
            <p className="text-xs text-zinc-600 mt-0.5">{totalRuns} runs totaal</p>
          </div>
          <button
            onClick={fetchRuns}
            disabled={loading}
            className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 p-2 rounded-lg hover:bg-white/[0.04] transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Totaal',    value: totalRuns,         color: 'text-white' },
            { label: 'Geslaagd',  value: completedN,        color: 'text-emerald-400' },
            { label: 'Mislukt',   value: failedN,           color: failedN > 0 ? 'text-red-400' : 'text-zinc-500' },
            { label: 'Kosten',    value: `€${totalCost.toFixed(3)}`, color: 'text-white' },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-center">
              <div className={clsx('text-sm font-bold font-mono', s.color)}>{s.value}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {runningN > 0 && (
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1 px-1">Actief</div>
        )}
        {runs.filter(r => r.status === 'running').map(run => (
          <RunRow key={run.runId} run={run} statusCfg={statusCfg} progressPercent={progressPercent} failedAgent={failedAgent} storeDeployed={storeDeployed} onSelect={onSelectRun} />
        ))}

        {completedN + failedN > 0 && (
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mt-3 mb-1 px-1">Afgerond</div>
        )}
        {runs.filter(r => r.status !== 'running').map(run => (
          <RunRow key={run.runId} run={run} statusCfg={statusCfg} progressPercent={progressPercent} failedAgent={failedAgent} storeDeployed={storeDeployed} onSelect={onSelectRun} />
        ))}

        {runs.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center mt-24 gap-2 text-zinc-700">
            <Clock size={32} className="opacity-30" />
            <p className="text-sm">Nog geen runs</p>
            <p className="text-xs">Start een pipeline vanuit de Pipeline weergave</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RunRow({
  run,
  statusCfg,
  progressPercent,
  failedAgent,
  storeDeployed,
  onSelect,
}: {
  run: PipelineRun
  statusCfg: Record<string, { Icon: React.ElementType; color: string; bg: string; border: string; spin?: boolean }>
  progressPercent: (r: PipelineRun) => number
  failedAgent: (r: PipelineRun) => string | null
  storeDeployed: (r: PipelineRun) => boolean
  onSelect: (id: string) => void
}) {
  const pct = progressPercent(run)
  const sc = statusCfg[run.status] ?? statusCfg.idle
  const Icon = sc.Icon
  const cost = run.totalCostEur ?? Object.values(run.agents ?? {}).reduce((s, a) => s + (a.costEur ?? 0), 0)
  const failed = failedAgent(run)
  const deployed = storeDeployed(run)

  const duration = (() => {
    if (!run.startedAt) return null
    const end = run.completedAt ? new Date(run.completedAt) : new Date()
    const ms = end.getTime() - new Date(run.startedAt).getTime()
    const s = Math.floor(ms / 1000)
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  })()

  return (
    <button
      onClick={() => onSelect(run.runId)}
      className={clsx(
        'w-full rounded-xl border p-4 flex items-start gap-3 transition-all text-left group',
        'hover:border-white/[0.14]',
        sc.bg, sc.border,
      )}
    >
      {/* Status icon */}
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border mt-0.5', sc.bg, sc.border)}>
        <Icon size={14} className={clsx(sc.color, sc.spin && 'animate-spin')} />
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-white text-sm font-medium truncate">{run.niche || 'Naamloos'}</span>
          {cost > 0 && (
            <span className="text-zinc-400 text-xs font-mono flex-shrink-0">€{cost.toFixed(3)}</span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px] text-zinc-600">
            {new Date(run.startedAt).toLocaleString('nl', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
          {duration && (
            <>
              <span className="text-zinc-800">·</span>
              <span className="text-[11px] text-zinc-600">{duration}</span>
            </>
          )}
          <span className="text-zinc-800">·</span>
          <span className="text-[11px] text-zinc-700 font-mono">{run.runId.slice(0, 8)}</span>
        </div>

        {/* Progress bar (for running / partial) */}
        {(run.status === 'running' || pct < 100) && pct > 0 && (
          <div className="mt-2 h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-white/60 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {/* Failure detail */}
        {run.status === 'failed' && failed && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-400">
            <XCircle size={10} />
            <span>Gestopt bij: <strong>{failed}</strong></span>
          </div>
        )}

        {/* Deployed badge */}
        {deployed && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <CheckCircle size={10} />
            <span>Store deployed</span>
          </div>
        )}
      </div>

      <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 transition-colors flex-shrink-0 mt-2" />
    </button>
  )
}
