import clsx from 'clsx'
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react'
import type { PipelineRun } from '@/types'

interface Props {
  activeRun: PipelineRun | null
  totalCostEur: number
  activeEscalations: number
  wsConnected: boolean
}

export function TopBar({ activeRun, totalCostEur, activeEscalations, wsConnected }: Props) {
  const completedCount = activeRun
    ? Object.values(activeRun.agents).filter((a) => a.status === 'completed').length
    : 0
  const totalAgents = activeRun ? Object.keys(activeRun.agents).length : 0

  type StatusCfg = { dot: string; text: string; label: string; badge: string }
  const statusConfig = (): StatusCfg => {
    if (!activeRun || activeRun.status === 'idle')
      return { dot: 'bg-zinc-600', text: 'text-zinc-500', label: 'Idle', badge: '' }
    if (activeRun.status === 'running')
      return { dot: 'bg-emerald-400 animate-pulse', text: 'text-white', label: activeRun.niche ?? 'Running', badge: `${completedCount}/${totalAgents}` }
    if (activeRun.status === 'paused')
      return { dot: 'bg-amber-400', text: 'text-amber-400', label: 'Paused', badge: '' }
    if (activeRun.status === 'failed')
      return { dot: 'bg-red-400', text: 'text-red-400', label: 'Failed', badge: '' }
    if (activeRun.status === 'completed')
      return { dot: 'bg-emerald-400', text: 'text-white', label: `Done — ${activeRun.niche}`, badge: '' }
    return { dot: 'bg-zinc-600', text: 'text-zinc-500', label: 'Idle', badge: '' }
  }

  const s = statusConfig()

  return (
    <header className="h-[52px] flex-shrink-0 bg-[#0a0a0a] border-b border-white/[0.07] px-5 flex items-center justify-between z-50">
      {/* Left — brand */}
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-white tracking-tight text-sm">Dropship</span>
        <span className="text-[10px] border border-white/[0.1] text-zinc-500 px-1.5 py-0.5 rounded-full font-mono">v0.1</span>
      </div>

      {/* Center — status pill */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.07]">
        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', s.dot)} />
        <span className={clsx('text-xs font-medium truncate max-w-[220px]', s.text)}>{s.label}</span>
        {s.badge && (
          <span className="text-[10px] text-zinc-500 bg-white/[0.05] px-1.5 py-0.5 rounded-full flex-shrink-0 font-mono">{s.badge}</span>
        )}
      </div>

      {/* Right — metrics */}
      <div className="flex items-center gap-4">
        {/* Cost */}
        {totalCostEur > 0 && (
          <span className="text-white font-semibold font-mono text-sm">€{totalCostEur.toFixed(3)}</span>
        )}

        {/* Escalations */}
        {activeEscalations > 0 && (
          <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-1">
            <AlertTriangle size={11} className="text-red-400" />
            <span className="text-red-400 text-xs font-bold">{activeEscalations}</span>
          </div>
        )}

        {/* WS status */}
        <div
          title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
          className={clsx(
            'flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border',
            wsConnected
              ? 'text-zinc-400 border-white/[0.08]'
              : 'text-red-400 border-red-500/20 bg-red-500/5',
          )}
        >
          {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span>{wsConnected ? 'Live' : 'Off'}</span>
        </div>
      </div>
    </header>
  )
}
