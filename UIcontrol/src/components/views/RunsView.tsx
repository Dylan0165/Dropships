import { useEffect, useState } from 'react'
import { RefreshCw, ChevronRight, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { PipelineRun } from '@/types'
import { getRuns } from '@/lib/api'

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
      setRuns(data)
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
    const total = Object.keys(run.agents).length
    const completed = Object.values(run.agents).filter((a) => a.status === 'completed').length
    return total > 0 ? Math.round((completed / total) * 100) : 0
  }

  type StatusKey = 'idle' | 'running' | 'completed' | 'failed' | 'paused'
  const statusCfg: Record<StatusKey, { Icon: React.ElementType; color: string; bg: string; border: string }> = {
    idle:      { Icon: Clock,       color: 'text-slate-400',   bg: 'bg-slate-800/40',   border: 'border-slate-700/40' },
    running:   { Icon: Loader2,     color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-700/30' },
    completed: { Icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-900/15', border: 'border-emerald-700/20' },
    failed:    { Icon: XCircle,     color: 'text-red-400',     bg: 'bg-red-900/20',     border: 'border-red-700/30' },
    paused:    { Icon: Clock,       color: 'text-amber-400',   bg: 'bg-amber-900/20',   border: 'border-amber-700/30' },
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Pipeline Runs</h1>
          <p className="text-xs text-slate-500 mt-0.5">{runs.length} total runs</p>
        </div>
        <button
          onClick={fetchRuns}
          disabled={loading}
          className="text-slate-500 hover:text-slate-300 disabled:opacity-40 p-2 rounded-lg hover:bg-white/[0.04] transition-all"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {runs.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center mt-24 gap-2 text-slate-600">
          <Clock size={32} className="opacity-30" />
          <p className="text-sm">No runs yet</p>
          <p className="text-xs">Start a pipeline from the Pipeline view</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const pct = progressPercent(run)
            const sc = statusCfg[run.status as StatusKey] ?? statusCfg.idle
            const StatusIcon = sc.Icon
            const totalCost = Object.values(run.agents).reduce((s, a) => s + a.costEur, 0)
            return (
              <button
                key={run.runId}
                onClick={() => onSelectRun(run.runId)}
                className={clsx(
                  'w-full rounded-xl border p-4 flex items-center gap-4 transition-all text-left group hover:border-white/[0.14]',
                  sc.bg, sc.border,
                )}
              >
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border', sc.bg, sc.border)}>
                  <StatusIcon size={14} className={clsx(sc.color, run.status === 'running' && 'animate-spin')} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{run.niche || 'Unnamed run'}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>{new Date(run.startedAt).toLocaleString()}</span>
                    <span className="text-slate-700">·</span>
                    <span className="font-mono">{run.runId.slice(0, 8)}</span>
                  </div>
                </div>

                <div className="w-20 flex-shrink-0">
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 text-right mt-1">{pct}%</div>
                </div>

                <div className="text-right w-16 flex-shrink-0">
                  <div className="text-emerald-400 text-sm font-semibold font-mono">€{totalCost.toFixed(3)}</div>
                </div>

                <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
