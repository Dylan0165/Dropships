import { useState, useCallback, useEffect } from 'react'
import type { AgentId, PipelineRun, WsEvent } from '@/types'
import { useWebSocket } from './useWebSocket'
import * as api from '@/lib/api'

export function usePipeline() {
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)

  // Load existing runs on mount — auto-select most recent run
  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const tryLoad = () => {
      api
        .getRuns()
        .then((data) => {
          if (cancelled) return
          setRuns(data)
          // Auto-select the most recent run (running first, then latest completed)
          if (data.length > 0 && !selectedRunId) {
            const running = data.find((r) => r.status === 'running')
            const latest = data.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
            setSelectedRunId((running ?? latest).runId)
          }
        })
        .catch(() => {
          if (!cancelled && ++attempts < 8) setTimeout(tryLoad, 1500 * attempts)
        })
    }
    tryLoad()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleWsEvent = useCallback((event: WsEvent) => {
    setRuns((prev) => {
      const idx = prev.findIndex((r) => r.runId === event.runId)
      if (idx === -1) {
        api.getRuns().then(setRuns).catch(() => {})
        return prev
      }

      const next = [...prev]
      const run = { ...next[idx] }
      const agents = { ...run.agents }

      const agentId = event.agentId as AgentId | undefined
      const p = event.payload ?? {}
      const now = event.timestamp

      switch (event.type) {
        case 'agent_started':
          if (agentId && agents[agentId]) {
            agents[agentId] = {
              ...agents[agentId],
              status: 'running',
              startedAt: now,
              attempt: agents[agentId].attempt + 1,
            }
          }
          break

        case 'agent_log':
          if (agentId && agents[agentId]) {
            agents[agentId] = {
              ...agents[agentId],
              logs: [
                ...agents[agentId].logs,
                {
                  timestamp: now,
                  level: (p.level as 'info' | 'warn' | 'error' | 'debug') ?? 'info',
                  message: (p.message as string) ?? '',
                },
              ],
            }
          }
          break

        case 'agent_completed':
          if (agentId && agents[agentId]) {
            agents[agentId] = {
              ...agents[agentId],
              status: 'completed',
              completedAt: now,
              outputJson: (p.outputJson as Record<string, unknown>) ?? null,
              tokenCount: (p.tokenCount as number) ?? agents[agentId].tokenCount,
              costEur: (p.costEur as number) ?? agents[agentId].costEur,
              durationMs: (p.durationMs as number) ?? null,
            }
          }
          break

        case 'agent_failed':
          if (agentId && agents[agentId]) {
            agents[agentId] = {
              ...agents[agentId],
              status: 'failed',
              completedAt: now,
            }
          }
          break

        case 'agent_escalation':
          if (agentId && agents[agentId]) {
            agents[agentId] = {
              ...agents[agentId],
              status: 'waiting_approval',
              escalation: {
                reason: (p.reason as string) ?? '',
                severity: (p.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
                createdAt: now,
                resolvedAt: null,
                decision: null,
                opmerking: null,
              },
            }
          }
          break

        case 'pipeline_completed':
          run.status = 'completed'
          run.completedAt = now
          break

        case 'pipeline_failed':
          run.status = 'failed'
          run.completedAt = now
          break

        case 'store_live':
          run.storesLive = [...run.storesLive, p as unknown as PipelineRun['storesLive'][0]]
          break

        case 'pipeline_started':
          api.getRuns().then((fresh) => {
            setRuns(fresh)
            // Auto-select the new run
            const found = fresh.find((r) => r.runId === event.runId)
            if (found) setSelectedRunId(found.runId)
          }).catch(() => {})
          return prev
      }

      run.agents = agents
      run.totalTokens = Object.values(agents).reduce((s, a) => s + a.tokenCount, 0)
      run.totalCostEur = Object.values(agents).reduce((s, a) => s + a.costEur, 0)
      run.activeEscalations = Object.values(agents).filter((a) => a.status === 'waiting_approval').length

      next[idx] = run
      return next
    })
  }, [])

  const { connected: wsConnected } = useWebSocket(handleWsEvent)

  // Re-fetch on WS reconnect — picks up state after backend restart
  useEffect(() => {
    if (wsConnected) {
      api.getRuns().then((fresh) => {
        setRuns(fresh)
        // If no run is selected, auto-select most recent
        setSelectedRunId((prev) => {
          if (prev) return prev
          const running = fresh.find((r) => r.status === 'running')
          const latest = [...fresh].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
          return (running ?? latest)?.runId ?? null
        })
      }).catch(() => {})
    }
  }, [wsConnected])

  const activeRun = runs.find((r) => r.runId === selectedRunId) ?? null

  const startPipeline = useCallback(async (niche: string) => {
    const { runId } = await api.startPipeline(niche)
    setSelectedRunId(runId)
    const fresh = await api.getRuns()
    setRuns(fresh)
  }, [])

  const stopPipeline = useCallback(async () => {
    if (!selectedRunId) return
    await api.stopPipeline(selectedRunId)
  }, [selectedRunId])

  const approvePipeline = useCallback(
    async (agentId: AgentId, decision: 'approve' | 'reject', opmerking?: string) => {
      if (!selectedRunId) return
      await api.approvePipeline(selectedRunId, agentId, decision, opmerking)
    },
    [selectedRunId],
  )

  const totalCostEur = activeRun?.totalCostEur ?? 0
  const activeEscalations = activeRun?.activeEscalations ?? 0

  return {
    runs,
    activeRun,
    selectedRunId,
    setSelectedRunId,
    selectedAgentId,
    setSelectedAgentId,
    wsConnected,
    startPipeline,
    stopPipeline,
    approvePipeline,
    totalCostEur,
    activeEscalations,
  }
}
