import { Handle, Position, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import type { AgentConfig, AgentRun, AgentStatus } from '@/types'

type AgentNodeData = AgentConfig & { run: AgentRun | null; selected: boolean }

const STATUS_CFG: Record<AgentStatus, {
  border: string
  bg: string
  pill: string
  pillText: string
  dot: string
  label: string
  glow?: string
}> = {
  idle: {
    border: 'border-white/[0.08]',
    bg: 'bg-[#111]',
    pill: 'bg-white/[0.04]',
    pillText: 'text-zinc-600',
    dot: 'bg-zinc-700',
    label: 'Idle',
  },
  running: {
    border: 'border-emerald-400/40',
    bg: 'bg-[#111]',
    pill: 'bg-emerald-500/10',
    pillText: 'text-emerald-400',
    dot: 'bg-emerald-400 animate-pulse',
    label: 'Actief',
    glow: '0 0 18px rgba(52,211,153,0.15)',
  },
  completed: {
    border: 'border-white/[0.14]',
    bg: 'bg-[#111]',
    pill: 'bg-white/[0.06]',
    pillText: 'text-white',
    dot: 'bg-white',
    label: 'Klaar',
  },
  failed: {
    border: 'border-red-500/40',
    bg: 'bg-red-500/[0.04]',
    pill: 'bg-red-500/10',
    pillText: 'text-red-400',
    dot: 'bg-red-400',
    label: 'Fout',
    glow: '0 0 14px rgba(239,68,68,0.12)',
  },
  waiting_approval: {
    border: 'border-amber-400/40',
    bg: 'bg-amber-500/[0.04]',
    pill: 'bg-amber-500/10',
    pillText: 'text-amber-400',
    dot: 'bg-amber-400 animate-pulse',
    label: 'Review',
    glow: '0 0 14px rgba(251,191,36,0.12)',
  },
  skipped: {
    border: 'border-white/[0.05]',
    bg: 'bg-[#0e0e0e]',
    pill: 'bg-white/[0.03]',
    pillText: 'text-zinc-700',
    dot: 'bg-zinc-800',
    label: 'Skip',
  },
}

export function AgentNode({ data }: NodeProps) {
  const d = data as unknown as AgentNodeData
  const run = d.run
  const status: AgentStatus = run?.status ?? 'idle'
  const st = STATUS_CFG[status]
  const isRunning = status === 'running'
  const isWaiting = status === 'waiting_approval'

  // Show a short, parsed last log message
  const lastLog = (() => {
    if (!run?.logs.length) return null
    const msg = run.logs[run.logs.length - 1].message
    // Strip verbose prefixes
    return msg
      .replace(/attempt \d+\/\d+ — calling \S+/i, 'Bezig...')
      .replace(/Running .+ via agent-runner.*$/i, 'Gestart')
      .replace(/Completed in .*/i, '')
      .slice(0, 36)
  })()

  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-2 !h-2" />
      <div
        className={clsx(
          'w-[200px] rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden',
          st.bg,
          st.border,
          d.selected && 'ring-1 ring-white/30 ring-offset-1 ring-offset-[#080808]',
          isWaiting && 'animate-pulse-subtle',
        )}
        style={{ boxShadow: st.glow ?? '0 2px 8px rgba(0,0,0,0.4)' }}
      >
        {/* Top accent bar when running */}
        {isRunning && (
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
        )}

        <div className="px-3 py-2.5">
          {/* Label + category badge */}
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-[12px] font-semibold text-white truncate leading-tight">
              {d.label}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md border border-white/[0.07] bg-white/[0.03] text-zinc-500 font-medium flex-shrink-0 uppercase tracking-wide">
              {d.category === 'reviewer' ? 'rv' : d.category === 'security' ? 'sec' : d.category === 'analytics' ? 'an' : 'ex'}
            </span>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-1.5">
            <span className={clsx('flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0', st.pill, st.pillText)}>
              <span className={clsx('w-1 h-1 rounded-full flex-shrink-0', st.dot)} />
              {st.label}
            </span>
            {lastLog && (
              <span className="text-[9px] text-zinc-600 truncate flex-1">{lastLog}</span>
            )}
          </div>

          {/* Token/cost mini bar */}
          {run && run.tokenCount > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[9px] text-zinc-700 font-mono">{run.tokenCount.toLocaleString()} tok</span>
              {run.costEur > 0 && (
                <span className="text-[9px] text-zinc-700 font-mono">€{run.costEur.toFixed(4)}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-2 !h-2" />
    </>
  )
}
