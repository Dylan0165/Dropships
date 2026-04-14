import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import clsx from 'clsx'
import type { RunRecord } from '@/lib/trendscraper-api'
import { getRuns } from '@/lib/trendscraper-api'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'zojuist'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min geleden`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} uur geleden`
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  running: 'bg-blue-500/15 text-blue-300 border-blue-500/30 animate-pulse',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
}
const STATUS_LABEL: Record<string, string> = {
  completed: 'Voltooid',
  running: 'Bezig…',
  failed: 'Mislukt',
}

export function RunHistory() {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRuns()
      .then(data => setRuns(data.slice(0, 10)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 transition-all duration-200 hover:border-white/20">
      <h4 className="font-bold text-slate-200 mb-4 flex items-center gap-2">
        <History size={16} className="text-violet-400" />
        Run History
      </h4>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white/10 rounded h-9" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="text-sm text-slate-500">Nog geen runs uitgevoerd.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-3 pr-4 font-medium">#</th>
                <th className="pb-3 pr-4 font-medium">Datum</th>
                <th className="pb-3 pr-4 font-medium text-right">Niches</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {runs.map(run => (
                <tr key={run.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="py-2 pr-4 text-slate-500 tabular-nums">{run.id}</td>
                  <td className="py-2 pr-4 text-slate-300">{timeAgo(run.timestamp)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-300">
                    {run.total_niches_found}
                  </td>
                  <td className="py-2">
                    <span
                      className={clsx(
                        'text-xs font-medium px-2 py-0.5 rounded-full border',
                        STATUS_STYLES[run.status] ?? STATUS_STYLES.failed,
                      )}
                    >
                      {STATUS_LABEL[run.status] ?? run.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
