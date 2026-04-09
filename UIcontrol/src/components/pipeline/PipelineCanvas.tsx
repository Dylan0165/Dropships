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
import { Play, Square, Terminal, ChevronDown, RefreshCw, TrendingUp, Zap } from 'lucide-react'
import clsx from 'clsx'
import type { AgentId, PipelineRun } from '@/types'
import { AGENT_CONFIGS, PIPELINE_EDGES } from '@/constants/pipeline'
import { AgentNode } from './AgentNode'
import * as api from '@/lib/api'
import type { NicheSuggestion } from '@/lib/api'

const nodeTypes: NodeTypes = { agentNode: AgentNode }

const CATEGORY_COLORS: Record<string, string> = {
  executor: '#7c3aed',
  reviewer: '#0d9488',
  security: '#dc2626',
  analytics: '#2563eb',
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

  // Load niche suggestions
  useEffect(() => {
    api.getNiches().then(setSuggestions).catch(() => {})
  }, [])

  // Close dropdown on outside click
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
        const sourceCfg = AGENT_CONFIGS.find((c) => c.id === e.source)
        return {
          id: `e-${i}`,
          source: e.source,
          target: e.target,
          animated: sourceAgent?.status === 'running',
          label: e.label,
          style: {
            stroke: CATEGORY_COLORS[sourceCfg?.category ?? 'executor'] ?? '#7c3aed',
            strokeWidth: 1.5,
            opacity: 0.65,
            strokeDasharray: e.dashed ? '6 3' : undefined,
          },
          labelStyle: { fill: '#475569', fontSize: 9 },
          labelBgStyle: { fill: '#0d1117', fillOpacity: 0.9 },
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
      // Refresh suggestions (mark used)
      api.getNiches().then(setSuggestions).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start'
      setStartError(msg)
      setTimeout(() => setStartError(null), 5000)
    }
  }, [nicheInput, onStartPipeline])

  const selectSuggestion = useCallback((name: string) => {
    setNicheInput(name)
    setShowSuggestions(false)
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      {/* Control bar */}
      <div className="h-14 bg-[#0d1117]/80 backdrop-blur-sm border-b border-white/[0.06] px-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md" ref={dropdownRef}>
          <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 focus-within:border-violet-500/40 transition-colors">
            <Terminal size={13} className="text-slate-600 flex-shrink-0" />
            <input
              type="text"
              placeholder="Enter niche (e.g. fitness accessories)"
              value={nicheInput}
              onChange={(e) => setNicheInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              onFocus={() => availableSuggestions.length > 0 && setShowSuggestions(true)}
              className="flex-1 bg-transparent border-none text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
            />
            {availableSuggestions.length > 0 && (
              <button
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="text-slate-600 hover:text-slate-400 transition-colors"
              >
                <ChevronDown size={14} className={clsx('transition-transform', showSuggestions && 'rotate-180')} />
              </button>
            )}
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && availableSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d1117] border border-white/[0.08] rounded-lg shadow-2xl shadow-black/50 z-50 max-h-72 overflow-y-auto">
              <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Aanbevolen Niches</span>
                <button
                  onClick={handleRescrape}
                  disabled={rescraping}
                  className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw size={10} className={clsx(rescraping && 'animate-spin')} />
                  {rescraping ? 'Laden...' : 'Rescrape'}
                </button>
              </div>
              {availableSuggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSuggestion(s.name)}
                  className="w-full px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors border-b border-white/[0.03] last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-200 font-medium">{s.name}</span>
                    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-500">
                      <TrendingUp size={10} className="text-emerald-400" />
                      {s.trending_score}
                      <Zap size={10} className="text-amber-400 ml-1" />
                      {s.viral_potential}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{s.reasoning}</p>
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

        <button
          onClick={handleStart}
          disabled={isRunning || !nicheInput.trim()}
          className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-all shadow-lg shadow-violet-900/20 flex-shrink-0"
        >
          <Play size={12} />
          Start Pipeline
        </button>

        {isRunning && (
          <button
            onClick={onStopPipeline}
            className="bg-red-600/15 hover:bg-red-600/25 border border-red-500/25 text-red-400 hover:text-red-300 text-xs font-semibold px-3 py-2.5 rounded-lg flex items-center gap-1.5 transition-all flex-shrink-0"
          >
            <Square size={12} />
            Stop
          </button>
        )}

        {lastNiche && (
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500 flex-shrink-0">
            <span className={clsx(
              'w-1.5 h-1.5 rounded-full',
              activeRun?.status === 'running' ? 'bg-emerald-400 animate-pulse' :
              activeRun?.status === 'completed' ? 'bg-emerald-500' :
              activeRun?.status === 'failed' ? 'bg-red-400' : 'bg-slate-600',
            )} />
            <span className="truncate max-w-[160px]">{lastNiche}</span>
            <span className="text-slate-700">—</span>
            <span>{activeRun?.status ?? 'idle'}</span>
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
          <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={22} size={1} />
          <Controls position="top-left" />
          <MiniMap
            nodeColor={(n) => CATEGORY_COLORS[(n.data as { category: string })?.category] ?? '#7c3aed'}
            maskColor="rgba(13,17,23,0.75)"
          />
        </ReactFlow>
      </div>
    </div>
  )
}
