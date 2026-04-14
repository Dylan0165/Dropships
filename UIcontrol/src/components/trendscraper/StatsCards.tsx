import { useEffect, useState } from 'react'
import { TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react'
import clsx from 'clsx'
import type { NicheCounts } from '@/lib/trendscraper-api'

function AnimatedNumber({ target }: { target: number }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (target === 0) return
    let start = 0
    const step = Math.ceil(target / 30)
    const interval = setInterval(() => {
      start += step
      if (start >= target) {
        setDisplay(target)
        clearInterval(interval)
      } else {
        setDisplay(start)
      }
    }, 30)
    return () => clearInterval(interval)
  }, [target])

  return <span>{display}</span>
}

interface CardProps {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  border: string
}

function StatCard({ label, value, icon, color, border }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white/5 backdrop-blur-sm border rounded-xl p-6 flex flex-col gap-4 transition-all duration-200 hover:border-white/20',
        border,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</span>
        <div className={clsx('w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center', color)}>
          {icon}
        </div>
      </div>
      <div className={clsx('text-4xl font-bold tabular-nums tracking-tight', color)}>
        <AnimatedNumber target={value} />
      </div>
    </div>
  )
}

export function StatsCards({ counts }: { counts: NicheCounts | null }) {
  const c = counts ?? { total: 0, pending: 0, approved: 0, rejected: 0 }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Gevonden deze week"
        value={c.total}
        icon={<TrendingUp size={16} />}
        color="text-violet-400"
        border="border-violet-500/20"
      />
      <StatCard
        label="Wachten op review"
        value={c.pending}
        icon={<Clock size={16} />}
        color="text-amber-400"
        border="border-amber-500/20"
      />
      <StatCard
        label="Goedgekeurd"
        value={c.approved}
        icon={<CheckCircle size={16} />}
        color="text-emerald-400"
        border="border-emerald-500/20"
      />
      <StatCard
        label="Afgewezen"
        value={c.rejected}
        icon={<XCircle size={16} />}
        color="text-slate-400"
        border="border-white/10"
      />
    </div>
  )
}
