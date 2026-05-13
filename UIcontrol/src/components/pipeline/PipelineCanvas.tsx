import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Play, Pause, Square, RotateCw, Trash2 } from 'lucide-react'
import { usePipelineSocket, type Stage } from '@/hooks/usePipelineSocket'
import { StageNode, STAGE_META } from './StageNode'
import { StageDrawer } from './StageDrawer'

interface RunSummary {
  runId: string
  niche: string
  status: string
  currentStage: string | null
  paused: boolean
  startedAt: string
  completedAt: string | null
}

interface CostSummary {
  byRun: Array<{ runId: string; totalUsd: number; calls: number }>
  byAgent: Array<{ agentName: string; totalUsd: number; calls: number; successRate: number }>
}

const nodeTypes = { stage: StageNode }
const STAGES_ORDER: Stage[] = [
  'trend-discovery', 'niche-review', 'product-research', 'product-review',
  'brand-creation', 'content-generation', 'store-build', 'build-validate',
  'deploy', 'health-check', 'growth',
]

export function PipelineCanvas() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null)
  const [niche, setNiche] = useState('')
  const [costs, setCosts] = useState<CostSummary | null>(null)
  const [starting, setStarting] = useState(false)

  const { state, isConnected, lastEvent, logs } = usePipelineSocket({ runId: selectedRunId })

  const refreshRuns = useCallback(async () => {
    try {
      const r = await fetch('/api/pipeline/runs')
      if (r.ok) {
        const data = await r.json() as RunSummary[]
        setRuns(data)
        setSelectedRunId(prev => prev ?? (data[0]?.runId ?? null))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshRuns() }, [refreshRuns])

  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'pipeline:started' || lastEvent.type === 'pipeline:done'
        || lastEvent.type === 'pipeline:failed' || lastEvent.type === 'pipeline:cancelled') {
      refreshRuns()
    }
  }, [lastEvent, refreshRuns])

  useEffect(() => {
    if (!selectedRunId) { setCosts(null); return }
    fetch(`/api/obs/costs?run_id=${selectedRunId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: CostSummary | null) => setCosts(data))
      .catch(() => setCosts(null))
  }, [selectedRunId, lastEvent])

  const onStart = useCallback(async () => {
    const value = niche.trim()
    if (!value) return
    setStarting(true)
    try {
      const r = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: value }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'start failed' })) as { error?: string }
        alert(err.error ?? 'Pipeline start mislukt')
        return
      }
      const data = await r.json() as { runId: string }
      setSelectedRunId(data.runId)
      setNiche('')
      refreshRuns()
    } finally {
      setStarting(false)
    }
  }, [niche, refreshRuns])

  const onPause = useCallback(async () => {
    if (!selectedRunId) return
    await fetch(`/api/pipeline/${selectedRunId}/pause`, { method: 'POST' })
  }, [selectedRunId])

  const onResume = useCallback(async () => {
    if (!selectedRunId) return
    await fetch(`/api/pipeline/${selectedRunId}/resume`, { method: 'POST' })
  }, [selectedRunId])

  const onStop = useCallback(async () => {
    if (!selectedRunId) return
    if (!confirm('Pipeline stoppen?')) return
    await fetch(`/api/pipeline/${selectedRunId}/stop`, { method: 'POST' })
    refreshRuns()
  }, [selectedRunId, refreshRuns])

  const onDeleteFailed = useCallback(async () => {
    if (!confirm('Alle failed stores verwijderen?')) return
    const r = await fetch('/api/stores/failed', { method: 'DELETE' })
    const data = await r.json() as { deleted?: number; error?: string }
    alert(data.error ? `Error: ${data.error}` : `${data.deleted} stores verwijderd`)
  }, [])

  const { nodes, edges } = useMemo(() => {
    // Vertical layout: 2 columns, EX left / RV right for paired stages
    const LAYOUT: Record<Stage, { x: number; y: number }> = {
      'trend-discovery':    { x: 0,   y: 0    },
      'niche-review':       { x: 340, y: 0    },
      'product-research':   { x: 0,   y: 160  },
      'product-review':     { x: 340, y: 160  },
      'brand-creation':     { x: 0,   y: 320  },
      'content-generation': { x: 340, y: 320  },
      'store-build':        { x: 0,   y: 480  },
      'build-validate':     { x: 340, y: 480  },
      'deploy':             { x: 0,   y: 640  },
      'health-check':       { x: 340, y: 640  },
      'growth':             { x: 170, y: 800  },
    }

    const ns: Node[] = STAGES_ORDER.map((stage) => ({
      id: stage,
      type: 'stage',
      position: LAYOUT[stage],
      data: {
        stage,
        label: STAGE_META[stage].label,
        kind:  STAGE_META[stage].kind,
        model: STAGE_META[stage].model,
        state: state?.stages[stage] ?? {
          status: 'pending', retries: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: 0,
        },
        onClick: () => setSelectedStage(stage),
      },
    }))
    const es: Edge[] = []
    for (let i = 0; i < STAGES_ORDER.length - 1; i++) {
      const cur = STAGES_ORDER[i]
      const nxt = STAGES_ORDER[i + 1]
      const curState = state?.stages[cur]
      const isRunning = curState?.status === 'running'
      const isApproved = curState?.status === 'approved'
      es.push({
        id: `${cur}->${nxt}`,
        source: cur, target: nxt,
        sourceHandle: null,
        targetHandle: null,
        animated: isRunning,
        type: 'smoothstep',
        style: {
          stroke: isApproved ? '#16a34a' : isRunning ? '#3b82f6' : '#3f3f46',
          strokeWidth: isRunning || isApproved ? 2 : 1,
        },
      })
    }
    return { nodes: ns, edges: es }
  }, [state])

  const totalCost = costs?.byRun.find(r => r.runId === selectedRunId)
  const isRunning = state && Object.values(state.stages).some(s => s.status === 'running')
  const isPaused = state?.paused

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100">
      {/* Toolbar */}
      <div className="border-b border-zinc-800 px-4 py-2.5 flex items-center gap-2">
        <input
          type="text"
          placeholder="Niche (bv. 'portable blender bottles')…"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onStart()}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-sm w-72 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={onStart}
          disabled={starting || !niche.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs rounded font-medium"
        >
          <Play size={13} /> Start
        </button>
        <div className="w-px h-6 bg-zinc-800 mx-1" />
        <button
          onClick={isPaused ? onResume : onPause}
          disabled={!selectedRunId || (!isRunning && !isPaused)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-200 text-xs rounded"
        >
          {isPaused ? <RotateCw size={13} /> : <Pause size={13} />}
          {isPaused ? 'Hervat' : 'Pauzeer'}
        </button>
        <button
          onClick={onStop}
          disabled={!selectedRunId}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-200 text-xs rounded"
        >
          <Square size={13} /> Stop
        </button>
        <button
          onClick={onDeleteFailed}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs rounded ml-auto"
        >
          <Trash2 size={13} /> Failed wissen
        </button>

        <select
          value={selectedRunId ?? ''}
          onChange={(e) => setSelectedRunId(e.target.value || null)}
          className="px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs"
        >
          <option value="">— kies run —</option>
          {runs.map(r => (
            <option key={r.runId} value={r.runId}>
              {r.niche} · {r.runId.slice(0, 8)} · {r.status}
            </option>
          ))}
        </select>

        {totalCost && (
          <div className="text-xs font-mono text-zinc-400 px-2">
            €{(totalCost.totalUsd * 0.92).toFixed(4)} / {totalCost.calls} calls
          </div>
        )}

        <span className={`flex items-center gap-1 text-[10px] ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          {isConnected ? 'live' : 'offline'}
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#27272a" gap={20} />
          <Controls className="!bg-zinc-900 !border-zinc-800" />
          <MiniMap
            nodeColor={(n) => {
              const s = (n.data as { state?: { status: string } })?.state?.status ?? 'pending'
              const colors: Record<string, string> = {
                pending: '#3f3f46', running: '#3b82f6', approved: '#16a34a',
                rejected: '#dc2626', failed: '#dc2626', uncertain: '#f59e0b', skipped: '#52525b',
              }
              return colors[s] ?? '#3f3f46'
            }}
            className="!bg-zinc-900 !border-zinc-800"
          />
        </ReactFlow>

        {logs.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 max-h-32 overflow-y-auto bg-zinc-950/95 border-t border-zinc-800 px-3 py-2 text-[11px] font-mono text-zinc-400">
            {logs.slice(-12).map((l, i) => (
              <div key={i} className="truncate">
                <span className="text-zinc-600">{new Date(l.ts).toLocaleTimeString()}</span>
                {l.stage && <span className="text-zinc-500 ml-2">[{l.stage}]</span>}
                <span className="ml-2">{l.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedStage && state && (
        <StageDrawer
          stage={selectedStage}
          state={state.stages[selectedStage]}
          runId={state.runId}
          onClose={() => setSelectedStage(null)}
        />
      )}
    </div>
  )
}
