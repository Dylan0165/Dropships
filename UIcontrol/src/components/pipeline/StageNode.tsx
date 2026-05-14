'use client'
import { Handle, Position } from '@xyflow/react'
import { memo } from 'react'
import type { Stage, StageState } from '@/hooks/usePipelineSocket'

interface StageNodeData {
  stage: Stage
  label: string
  kind: 'EX' | 'RV' | 'AN' | 'OP'
  model?: string
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

const KIND_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  EX: { bg: 'bg-blue-500/15',    text: 'text-blue-300',    label: 'EX' },
  RV: { bg: 'bg-purple-500/15',  text: 'text-purple-300',  label: 'RV' },
  AN: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', label: 'AN' },
  OP: { bg: 'bg-zinc-500/15',    text: 'text-zinc-400',    label: 'OP' },
}

const VERDICT_STYLE: Record<string, string> = {
  APPROVED:  'bg-green-500/20 text-green-300 border border-green-500/30',
  REJECTED:  'bg-red-500/20 text-red-300 border border-red-500/30',
  UNCERTAIN: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
}

function shortModel(model?: string): string | null {
  if (!model) return null
  const m = model.replace('opencode-go/', '').replace('deepseek-', 'DS ').replace('-plus', '+').replace('-pro', ' Pro').replace('-flash', ' Flash').replace('kimi-', 'Kimi ').replace('minimax-', 'MiniMax ').replace('qwen', 'Qwen ').replace('glm-', 'GLM ').replace('mimo-', 'MiMo ')
  return m.length > 12 ? m.slice(0, 12) : m
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
    return s.slice(0, 90)
  } catch { return '' }
}

function StageNodeComponent({ data, selected }: StageNodeProps) {
  const { label, kind, model, state, onClick } = data
  const color   = STATUS_COLOR[state.status] ?? STATUS_COLOR.pending
  const kindCls = KIND_STYLE[kind] ?? KIND_STYLE.EX
  const isRunning  = state.status === 'running'
  const isFinished = ['approved','rejected','failed','uncertain'].includes(state.status)
  const isSkipped  = state.status === 'skipped'
  const modelLabel = shortModel(model)

  return (
    <div
      onClick={onClick}
      className={[
        'w-[300px] rounded-2xl border bg-[#0e0e10] cursor-pointer transition-all duration-150',
        selected  ? 'border-blue-400/60 shadow-xl shadow-blue-500/10' : 'border-white/[0.08] hover:border-white/[0.16]',
        isRunning ? 'ring-1 ring-blue-500/30' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top}    className="!w-2 !h-2 !bg-zinc-700 !border-zinc-600" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-zinc-700 !border-zinc-600" style={{ left: '50%' }} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${isRunning ? 'animate-pulse' : ''}`}
            style={{ background: color, boxShadow: isRunning ? `0 0 10px ${color}` : 'none' }}
          />
          <span className={`text-sm font-semibold leading-tight truncate ${isSkipped ? 'line-through text-zinc-600' : 'text-white'}`}>
            {label}
          </span>
        </div>
        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ml-2 ${kindCls.bg} ${kindCls.text}`}>
          {kindCls.label}
        </span>
      </div>

      {/* Model tag */}
      {modelLabel && (
        <div className="px-4 pb-2.5">
          <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
            {modelLabel}
          </span>
        </div>
      )}

      {/* Stats row — shown while running or after */}
      {(isRunning || isFinished) && (
        <div className="border-t border-white/[0.06] px-4 py-2.5 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {state.durationMs > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 font-mono">
                {formatDuration(state.durationMs)}
              </span>
            )}
            {(state.tokensIn + state.tokensOut) > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 font-mono">
                {(state.tokensIn + state.tokensOut).toLocaleString()}t
              </span>
            )}
            {state.costUsd > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 font-mono">
                ${state.costUsd.toFixed(4)}
              </span>
            )}
          </div>
          {state.error && (
            <p className="text-[11px] text-red-400 leading-snug line-clamp-2">{state.error.slice(0, 120)}</p>
          )}
          {!state.error && state.output != null && (
            <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2 italic">{snippet(state.output)}</p>
          )}
        </div>
      )}

      {/* Verdict badge */}
      {state.verdict && (
        <div className="px-4 pb-3">
          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${VERDICT_STYLE[state.verdict] ?? ''}`}>
            {state.verdict}
          </span>
        </div>
      )}
    </div>
  )
}

export const StageNode = memo(StageNodeComponent)
StageNode.displayName = 'StageNode'

export const STAGE_META: Record<Stage, { label: string; kind: 'EX' | 'RV' | 'AN' | 'OP'; model?: string }> = {
  'trend-discovery':    { label: 'Trend Discovery',  kind: 'EX', model: 'deepseek-v4-flash' },
  'niche-review':       { label: 'Niche Review',     kind: 'RV', model: 'deepseek-v4-pro'   },
  'product-research':   { label: 'Product Research', kind: 'EX', model: 'deepseek-v4-flash' },
  'product-review':     { label: 'Product Review',   kind: 'RV', model: 'deepseek-v4-pro'   },
  'brand-creation':     { label: 'Brand Creation',   kind: 'EX', model: 'kimi-k2.6'         },
  'content-generation': { label: 'Content Gen',      kind: 'EX', model: 'kimi-k2.5'         },
  'store-build':        { label: 'Store Build',      kind: 'EX', model: 'qwen3.6-plus'      },
  'build-validate':     { label: 'Build Validate',   kind: 'OP'                             },
  'deploy':             { label: 'Deploy',           kind: 'OP'                             },
  'health-check':       { label: 'Health Check',     kind: 'OP'                             },
  'growth':             { label: 'Growth',           kind: 'AN', model: 'qwen3.5-plus'      },
}
