import { useState } from 'react'
import clsx from 'clsx'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import type { NicheRecord } from '@/lib/trendscraper-api'

function TrendBadge({ score }: { score: number }) {
  const color =
    score > 75 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
    score > 50 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                 'bg-red-500/15 text-red-300 border-red-500/30'
  return (
    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full border', color)}>
      {score}
    </span>
  )
}

function CompetitionBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    high: 'bg-red-500/15 text-red-300 border-red-500/30',
  }
  const label: Record<string, string> = { low: 'Laag', medium: 'Middel', high: 'Hoog' }
  return (
    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full border', styles[level] ?? styles.medium)}>
      {label[level] ?? level}
    </span>
  )
}

interface Props {
  niche: NicheRecord
  onApprove: (id: number) => void
  onReject: (id: number) => void
}

export function NicheCard({ niche, onApprove, onReject }: Props) {
  const [expanded, setExpanded] = useState(false)
  const TRUNCATE = 120

  const reasoning = niche.reasoning ?? ''
  const short = reasoning.length > TRUNCATE ? reasoning.slice(0, TRUNCATE) + '…' : reasoning
  const showToggle = reasoning.length > TRUNCATE

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 flex flex-col gap-4 transition-all duration-200 hover:border-white/20">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-white text-lg leading-tight">{niche.name}</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          <TrendBadge score={niche.trend_score} />
          <CompetitionBadge level={niche.competition_level} />
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1 text-sm text-slate-400">
        <span>
          <span className="text-slate-500">Marktgrootte: </span>
          <span className="capitalize">{niche.estimated_market_size}</span>
        </span>
        <span>
          <span className="text-slate-500">Doelgroep: </span>
          {niche.recommended_audience}
        </span>
      </div>

      {/* Reasoning */}
      <p className="text-sm text-slate-400 leading-relaxed">
        {expanded ? reasoning : short}
        {showToggle && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="ml-1 text-violet-400 hover:text-violet-300 text-xs font-medium transition-colors"
          >
            {expanded ? 'Minder' : 'Meer lezen'}
          </button>
        )}
      </p>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onApprove(niche.id)}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-sm font-medium py-2 rounded-lg transition-all duration-150"
        >
          <ThumbsUp size={14} />
          Goedkeuren
        </button>
        <button
          onClick={() => onReject(niche.id)}
          className="flex-1 flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 text-sm font-medium py-2 rounded-lg transition-all duration-150"
        >
          <ThumbsDown size={14} />
          Afwijzen
        </button>
      </div>
    </div>
  )
}
