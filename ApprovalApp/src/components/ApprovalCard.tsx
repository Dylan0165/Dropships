import { ChevronRight, AlertTriangle } from 'lucide-react'
import type { PendingApproval } from '../lib/api'

interface Props {
  item: PendingApproval
  onClick: () => void
}

const SEVERITY_STYLES = {
  LOW:      { dot: 'bg-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-500/15 text-yellow-300' },
  MEDIUM:   { dot: 'bg-orange-500', text: 'text-orange-400', badge: 'bg-orange-500/15 text-orange-300' },
  HIGH:     { dot: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-500/15 text-red-300' },
  CRITICAL: { dot: 'bg-red-400 animate-pulse', text: 'text-red-300', badge: 'bg-red-500/20 text-red-200' },
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

export default function ApprovalCard({ item, onClick }: Props) {
  const sty = SEVERITY_STYLES[item.severity]
  const timeAgo = formatTimeAgo(item.createdAt)

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 active:bg-zinc-800 transition-all active:scale-[0.98]"
    >
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <div className="mt-1 flex-shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full ${sty.dot}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-semibold text-sm">
              {AGENT_LABELS[item.agentId] ?? item.agentId}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${sty.badge}`}>
              {item.severity}
            </span>
          </div>

          <p className="text-zinc-400 text-xs mb-2 truncate">
            🏪 {item.niche}
          </p>

          <div className="flex items-start gap-1.5">
            <AlertTriangle size={11} className={`${sty.text} flex-shrink-0 mt-0.5`} />
            <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2">
              {item.reason}
            </p>
          </div>

          <p className="text-zinc-700 text-[10px] mt-2">{timeAgo}</p>
        </div>

        {/* Arrow */}
        <ChevronRight size={18} className="text-zinc-700 flex-shrink-0 mt-1" />
      </div>
    </button>
  )
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Zojuist'
  if (mins < 60) return `${mins} min geleden`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} uur geleden`
  return `${Math.floor(hrs / 24)} dag geleden`
}
