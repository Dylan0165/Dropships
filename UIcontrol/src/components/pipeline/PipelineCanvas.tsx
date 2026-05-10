import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Play, Square, Search, ChevronDown, RefreshCw, TrendingUp, Zap } from 'lucide-react'
import clsx from 'clsx'
import type { AgentId, PipelineRun } from '@/types'
import { AGENT_CONFIGS, PIPELINE_EDGES } from '@/constants/pipeline'
import { AgentNode } from './AgentNode'
import * as api from '@/lib/api'
import type { NicheSuggestion } from '@/lib/api'

const nodeTypes: NodeTypes = { agentNode: AgentNode }

// B&W edge colors: wit voor actieve, zinc voor idle
const EDGE_STATUS_COLOR = {
  running:   '#e4e4e7',   // zinc-200
  completed: '#52525b',   // zinc-600
  idle:      '#27272a',   // zinc-800
  failed:    '#ef4444',   // red
}

interface Props {
  activeRun: PipelineRun | null
  selectedAgentId: AgentId | null
  onSelectAgent: (id: AgentId | null) => void
  onStartPipeline: (niche: string) => Promise<void>
  onStopPipeline: () => Promise<void>
  lastNiche?: string
}

export function PipelineCanvas({
  activeRun,
  selectedAgentId,
  onSelectAgent,
  onStartPipeline,
  onStopPipeline,
  lastNiche,
}: Props) {
  const [nicheInput, setNicheInput] = useState('')
  const [suggestions, setSuggestions] = useState<NicheSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [rescraping, setRescraping] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isRunning = activeRun?.status === 'running'

  useEffect(() => {
    api.getNiches().then(setSuggestions).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as HTMLElement)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleRescrape = useCallback(async () => {
    setRescraping(true)
    try {
      const result = await api.rescrapeNiches()
      setSuggestions(result.niches)
    } catch {
      // ignore
    } finally {
      setRescraping(false)
    }
  }, [])

  const availableSuggestions = suggestions.filter(s => s.status === 'suggested')

  const nodes: Node[] = useMemo(
    () =>
      AGENT_CONFIGS.map((cfg) => ({
        id: cfg.id,
        type: 'agentNode',
        position: cfg.position,
        data: {
          ...cfg,
          run: activeRun?.agents[cfg.id] ?? null,
          selected: selectedAgentId === cfg.id,
        },
        draggable: false,
      })),
    [activeRun, selectedAgentId],
  )

  const edges: Edge[] = useMemo(
    () =>
      PIPELINE_EDGES.map((e, i) => {
        const sourceAgent = activeRun?.agents[e.source as AgentId]
        const status = sourceAgent?.status ?? 'idle'
        const color = status === 'running' ? EDGE_STATUS_COLOR.running
          : status === 'completed' ? EDGE_STATUS_COLOR.completed
          : status === 'failed' ? EDGE_STATUS_COLOR.failed
          : EDGE_STATUS_COLOR.idle
        return {
          id: `e-${i}`,
          source: e.source,
          target: e.target,
          animated: status === 'running',
          label: e.label,
          style: {
            stroke: color,
            strokeWidth: 1.5,
            opacity: 0.7,
            strokeDasharray: e.dashed ? '5 4' : undefined,
          },
          labelStyle: { fill: '#52525b', fontSize: 9 },
          labelBgStyle: { fill: '#080808', fillOpacity: 1 },
        }
      }),
    [activeRun],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectAgent(node.id as AgentId)
    },
    [onSelectAgent],
  )

  const handleStart = useCallback(async () => {
    if (!nicheInput.trim()) return
    setStartError(null)
    try {
      await onStartPipeline(nicheInput.trim())
      setNicheInput('')
      api.getNiches().then(setSuggestions).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Start mislukt'
      setStartError(msg)
      setTimeout(() => setStartError(null), 6000)
    }
  }, [nicheInput, onStartPipeline])

  const selectSuggestion = useCallback((name: string) => {
    setNicheInput(name)
    setShowSuggestions(false)
  }, [])

  // Stats van huidige run
  const completedCount = activeRun ? Object.values(activeRun.agents).filter(a => a.status === 'completed').length : 0
  const totalAgents    = activeRun ? Object.keys(activeRun.agents).length : 0

  return (
    <div className="flex-1 flex flex-col">
      {/* Control bar */}
      <div className="h-14 bg-[#0a0a0a] border-b border-white/[0.07] px-4 flex items-center gap-3">

        {/* Niche input + suggestions */}
        <div className="relative flex-1 max-w-md" ref={dropdownRef}>
          <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 focus-within:border-white/[0.2] transition-colors">
            <Search size={13} className="text-zinc-600 flex-shrink-0" />
            <input
              type="text"
              placeholder="Niche invoeren (bijv. fitness accessories)"
              value={nicheInput}
              onChange={(e) => setNicheInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              onFocus={() => availableSuggestions.length > 0 && setShowSuggestions(true)}
              className="flex-1 bg-transparent border-none text-sm text-white placeholder:text-zinc-700 focus:outline-none"
            />
            {availableSuggestions.length > 0 && (
              <button
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <ChevronDown size={14} className={clsx('transition-transform', showSuggestions && 'rotate-180')} />
              </button>
            )}
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && availableSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#111] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 z-50 max-h-72 overflow-y-auto">
              <div className="px-3 py-2 border-b border-white/[0.07] flex items-center justify-between">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  {availableSuggestions.length} aanbevolen niches
                </span>
                <button
                  onClick={handleRescrape}
                  disabled={rescraping}
                  className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={10} className={clsx(rescraping && 'animate-spin')} />
                  {rescraping ? 'Laden...' : 'Vernieuwen'}
                </button>
              </div>
              {availableSuggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSuggestion(s.name)}
                  className="w-full px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors border-b border-white/[0.04] last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">{s.name}</span>
                    <span className="ml-auto flex items-center gap-2 text-[10px] text-zinc-600 flex-shrink-0">
                      <span className="flex items-center gap-0.5">
                        <TrendingUp size={9} className="text-emerald-500" />
                        {s.trending_score}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Zap size={9} className="text-amber-500" />
                        {s.viral_potential}
                      </span>
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5 line-clamp-1">{s.reasoning}</p>
                </button>
              ))}
            </div>
          )}

          {/* Error toast */}
          {startError && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-red-900/80 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-200 z-50">
              {startError}
            </div>
          )}
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={isRunning || !nicheInput.trim()}
          className="bg-white hover:bg-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed text-black text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-all flex-shrink-0"
        >
          <Play size={12} />
          Start
        </button>

        {/* Stop button */}
        {isRunning && (
          <button
            onClick={onStopPipeline}
            className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 text-xs font-semibold px-3 py-2.5 rounded-lg flex items-center gap-1.5 transition-all flex-shrink-0"
          >
            <Square size={12} />
            Stop
          </button>
        )}

        {/* Live run status — rechts */}
        {lastNiche && (
          <div className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500 flex-shrink-0">
            <span className={clsx(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              activeRun?.status === 'running'   ? 'bg-emerald-400 animate-pulse' :
              activeRun?.status === 'completed' ? 'bg-white' :
              activeRun?.status === 'failed'    ? 'bg-red-400' : 'bg-zinc-700',
            )} />
            <span className="truncate max-w-[140px] text-zinc-400">{lastNiche}</span>
            {activeRun?.status === 'running' && (
              <span className="text-zinc-600 font-mono">{completedCount}/{totalAgents}</span>
            )}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="#1c1c1c" gap={22} size={1} />
          <Controls position="top-left" />
          <MiniMap
            nodeColor={(n) => {
              const status = (n.data as { run?: { status: string } })?.run?.status
              if (status === 'running')   return '#34d399'
              if (status === 'completed') return '#52525b'
              if (status === 'failed')    return '#ef4444'
              return '#1c1c1c'
            }}
            maskColor="rgba(8,8,8,0.8)"
          />
        </ReactFlow>
      </div>
    </div>
  )
}
