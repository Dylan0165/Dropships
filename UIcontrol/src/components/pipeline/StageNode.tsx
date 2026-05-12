import { Handle, Position } from '@xyflow/react'
import { memo } from 'react'
import type { Stage, StageState } from '@/hooks/usePipelineSocket'

interface StageNodeData {
  stage: Stage
  label: string
  kind: 'EX' | 'RV' | 'AN' | 'OP'
  state: StageState
  onClick: () => void
}

interface StageNodeProps {
  data: StageNodeData
  selected?: boolean
}

const STATUS_COLOR: Record<string, string> = {
  pending:   '#3f3f46',
  running:   '#3b82f6',
  approved:  '#16a34a',
  rejected:  '#dc2626',
  failed:    '#dc2626',
  uncertain: '#f59e0b',
  skipped:   '#52525b',
}

const VERDICT_BG: Record<string, string> = {
  APPROVED:  'bg-green-500/20 text-green-300 border border-green-500/40',
  REJECTED:  'bg-red-500/20 text-red-300 border border-red-500/40',
  UNCERTAIN: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function snippet(output: unknown): string {
  if (!output) return ''
  try {
    const s = typeof output === 'string' ? output : JSON.stringify(output)
    return s.slice(0, 80)
  } catch { return '' }
}

function StageNodeComponent({ data, selected }: StageNodeProps) {
  const { stage, label, kind, state, onClick } = data
  const color = STATUS_COLOR[state.status] ?? STATUS_COLOR.pending
  const isRunning = state.status === 'running'
  const isFinished = state.status === 'approved' || state.status === 'rejected'
    || state.status === 'failed' || state.status === 'uncertain'
  const isSkipped = state.status === 'skipped'

  return (
    <div
      onClick={onClick}
      className={`
        w-[220px] rounded-xl border bg-zinc-950 transition-all cursor-pointer
        ${selected ? 'border-blue-400 shadow-lg shadow-blue-500/20' : 'border-zinc-800 hover:border-zinc-700'}
        ${isRunning ? 'ring-1 ring-blue-500/40' : ''}
      `}
    >
      <Handle type="target" position={Position.Left}  className="!w-2 !h-2 !bg-zinc-600" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-600" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${isRunning ? 'animate-pulse' : ''}`}
            style={{ background: color, boxShadow: isRunning ? `0 0 8px ${color}` : 'none' }}
          />
          <span className={`text-[13px] font-semibold truncate ${isSkipped ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
            {label}
          </span>
        </div>
        <span className={`
          text-[9px] font-mono font-bold px-1.5 py-0.5 rounded
          ${kind === 'EX' ? 'bg-blue-500/15 text-blue-300' : ''}
          ${kind === 'RV' ? 'bg-purple-500/15 text-purple-300' : ''}
          ${kind === 'AN' ? 'bg-emerald-500/15 text-emerald-300' : ''}
          ${kind === 'OP' ? 'bg-zinc-500/15 text-zinc-300' : ''}
        `}>{kind}</span>
      </div>

      {/* Body */}
      {(isRunning || isFinished) && (
        <div className="px-3 py-2 space-y-1.5">
          <div className="flex gap-1.5 flex-wrap">
            {state.durationMs > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 font-mono">
                {formatDuration(state.durationMs)}
              </span>
            )}
            {(state.tokensIn + state.tokensOut) > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 font-mono">
                {(state.tokensIn + state.tokensOut).toLocaleString()}t
              </span>
            )}
            {state.costUsd > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 font-mono">
                ${state.costUsd.toFixed(4)}
              </span>
            )}
          </div>
          {state.error && (
            <p className="text-[11px] text-red-400 italic line-clamp-2">{state.error.slice(0, 100)}</p>
          )}
          {!state.error && state.output != null && (
            <p className="text-[11px] text-zinc-500 italic line-clamp-2">{snippet(state.output)}</p>
          )}
        </div>
      )}

      {/* Footer — verdict badge */}
      {state.verdict && (
        <div className="px-3 pb-2">
          <span className={`text-[10px] px-2 py-0.5 rounded ${VERDICT_BG[state.verdict] ?? ''}`}>
            {state.verdict}
          </span>
        </div>
      )}
    </div>
  )
}

export const StageNode = memo(StageNodeComponent)
StageNode.displayName = 'StageNode'

export const STAGE_META: Record<Stage, { label: string; kind: 'EX' | 'RV' | 'AN' | 'OP' }> = {
  'trend-discovery':    { label: 'Trend Discovery',  kind: 'EX' },
  'niche-review':       { label: 'Niche Review',     kind: 'RV' },
  'product-research':   { label: 'Product Research', kind: 'EX' },
  'product-review':     { label: 'Product Review',   kind: 'RV' },
  'brand-creation':     { label: 'Brand Creation',   kind: 'EX' },
  'content-generation': { label: 'Content Gen',      kind: 'EX' },
  'store-build':        { label: 'Store Build',      kind: 'EX' },
  'build-validate':     { label: 'Build Validate',   kind: 'OP' },
  'deploy':             { label: 'Deploy',           kind: 'OP' },
  'health-check':       { label: 'Health Check',     kind: 'OP' },
  'growth':             { label: 'Growth',           kind: 'AN' },
}
