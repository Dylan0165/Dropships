import { Handle, Position, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import type { AgentConfig, AgentRun, AgentStatus } from '@/types'

type AgentNodeData = AgentConfig & { run: AgentRun | null; selected: boolean }

const CATEGORY: Record<string, { border: string; glow: string; accent: string; dot: string }> = {
  executor:  { border: 'border-violet-600/50',  glow: 'rgba(124, 58, 237, 0.3)',  accent: 'text-violet-300',  dot: 'bg-violet-500' },
  reviewer:  { border: 'border-teal-600/50',    glow: 'rgba(13, 148, 136, 0.3)',  accent: 'text-teal-300',    dot: 'bg-teal-500' },
  security:  { border: 'border-red-600/50',     glow: 'rgba(220, 38, 38, 0.3)',   accent: 'text-red-300',     dot: 'bg-red-500' },
  analytics: { border: 'border-blue-600/50',    glow: 'rgba(37, 99, 235, 0.3)',   accent: 'text-blue-300',    dot: 'bg-blue-500' },
}

const STATUS_CFG: Record<AgentStatus, { bg: string; text: string; dot: string; label: string }> = {
  idle:             { bg: 'bg-slate-800/40',   text: 'text-slate-500',   dot: 'bg-slate-600',                    label: 'Idle' },
  running:          { bg: 'bg-emerald-900/30', text: 'text-emerald-400', dot: 'bg-emerald-400 animate-pulse',    label: 'Running' },
  completed:        { bg: 'bg-slate-800/40',   text: 'text-emerald-500', dot: 'bg-emerald-500',                  label: 'Done' },
  failed:           { bg: 'bg-red-900/30',     text: 'text-red-400',     dot: 'bg-red-400',                      label: 'Error' },
  waiting_approval: { bg: 'bg-amber-900/30',   text: 'text-amber-400',   dot: 'bg-amber-400 animate-pulse',      label: 'Approval' },
  skipped:          { bg: 'bg-slate-800/40',   text: 'text-slate-500',   dot: 'bg-slate-600',                    label: 'Skip' },
}

export function AgentNode({ data }: NodeProps) {
  const d = data as unknown as AgentNodeData
  const run = d.run
  const status: AgentStatus = run?.status ?? 'idle'
  const isRunning = status === 'running'
  const isWaiting = status === 'waiting_approval'
  const cat = CATEGORY[d.category] ?? CATEGORY.executor
  const st = STATUS_CFG[status]
  const lastLog = run?.logs.length ? run.logs[run.logs.length - 1].message : null

  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-2 !h-2" />
      <div
        className={clsx(
          'w-[210px] rounded-xl bg-[#0d1117] border transition-all duration-200 cursor-pointer overflow-hidden',
          cat.border,
          isWaiting && 'animate-amber-blink',
          d.selected && 'ring-2 ring-violet-400/50 ring-offset-1 ring-offset-[#030712]',
        )}
        style={{
          boxShadow: isRunning
            ? `0 0 20px ${cat.glow}, 0 2px 8px rgba(0,0,0,0.4)`
            : '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Running accent bar */}
        {isRunning && (
          <div
            className="h-[2px] w-full"
            style={{ background: `linear-gradient(90deg, transparent 0%, ${cat.glow.replace(/0\.\d+\)$/, '1)')}, transparent 100%)` }}
          />
        )}

        <div className="px-3 py-2.5">
          {/* Row 1: label + model badge */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-slate-100 truncate leading-tight max-w-[140px]">
              {d.label}
            </span>
            <span className={clsx(
              'text-[9px] px-1.5 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.04] font-medium',
              cat.accent,
            )}>
              {d.model === 'deepseek-chat' ? 'chat' : 'R1'}
            </span>
          </div>

          {/* Row 2: status + last log */}
          <div className="flex items-center gap-1.5">
            <span className={clsx('flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0', st.bg, st.text)}>
              <span className={clsx('w-1.5 h-1.5 rounded-full', st.dot)} />
              {st.label}
            </span>
            {lastLog && (
              <span className="text-[9px] text-slate-600 truncate flex-1">{lastLog}</span>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-2 !h-2" />
    </>
  )
}
