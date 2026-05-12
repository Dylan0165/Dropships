import { useState } from 'react'
import { X, RotateCw, ChevronDown, ChevronRight } from 'lucide-react'
import type { Stage, StageState } from '@/hooks/usePipelineSocket'
import { STAGE_META } from './StageNode'

interface StageDrawerProps {
  stage: Stage
  state: StageState
  runId: string
  onClose: () => void
  onRetry?: () => void
}

function JsonBlock({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (value == null) return null
  return (
    <div className="border border-zinc-800 rounded">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900">
        <span className="font-semibold">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <pre className="px-3 py-2 text-[11px] font-mono text-zinc-400 overflow-auto max-h-[400px] border-t border-zinc-800 bg-zinc-950">
{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function StageDrawer({ stage, state, runId, onClose, onRetry }: StageDrawerProps) {
  const meta = STAGE_META[stage]

  return (
    <div className="fixed top-0 right-0 h-full w-[420px] bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{meta.label}</h2>
          <p className="text-[11px] text-zinc-500 font-mono">{stage}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-zinc-900 px-2 py-1.5 rounded">
            <p className="text-zinc-500 text-[10px]">Status</p>
            <p className="text-zinc-100 font-medium capitalize">{state.status}</p>
          </div>
          <div className="bg-zinc-900 px-2 py-1.5 rounded">
            <p className="text-zinc-500 text-[10px]">Run</p>
            <p className="text-zinc-100 font-mono text-[10px]">{runId.slice(0, 8)}…</p>
          </div>
          {state.durationMs > 0 && (
            <div className="bg-zinc-900 px-2 py-1.5 rounded">
              <p className="text-zinc-500 text-[10px]">Duur</p>
              <p className="text-zinc-100 font-mono">{(state.durationMs / 1000).toFixed(1)}s</p>
            </div>
          )}
          {state.costUsd > 0 && (
            <div className="bg-zinc-900 px-2 py-1.5 rounded">
              <p className="text-zinc-500 text-[10px]">Kosten</p>
              <p className="text-zinc-100 font-mono">${state.costUsd.toFixed(4)}</p>
            </div>
          )}
          {state.tokensIn + state.tokensOut > 0 && (
            <div className="bg-zinc-900 px-2 py-1.5 rounded col-span-2">
              <p className="text-zinc-500 text-[10px]">Tokens (in / out)</p>
              <p className="text-zinc-100 font-mono">
                {state.tokensIn.toLocaleString()} / {state.tokensOut.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {state.verdict && (
          <div className={`
            px-3 py-2 rounded text-xs
            ${state.verdict === 'APPROVED'  ? 'bg-green-500/10 text-green-300 border border-green-500/30' : ''}
            ${state.verdict === 'REJECTED'  ? 'bg-red-500/10 text-red-300 border border-red-500/30' : ''}
            ${state.verdict === 'UNCERTAIN' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : ''}
          `}>
            <p className="font-semibold">{state.verdict}</p>
            {state.reason && <p className="mt-1 text-zinc-300">{state.reason}</p>}
          </div>
        )}

        {state.error && (
          <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            <p className="font-semibold mb-1">Error</p>
            <pre className="whitespace-pre-wrap font-mono text-[10px]">{state.error}</pre>
          </div>
        )}

        <JsonBlock title="Output" value={state.output} defaultOpen={true} />

        {state.status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded"
          >
            <RotateCw size={14} /> Retry stage
          </button>
        )}
      </div>
    </div>
  )
}
