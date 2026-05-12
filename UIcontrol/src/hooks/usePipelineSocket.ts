import { useEffect, useRef, useState, useCallback } from 'react'

const STAGES = [
  'trend-discovery',
  'niche-review',
  'product-research',
  'product-review',
  'brand-creation',
  'content-generation',
  'store-build',
  'build-validate',
  'deploy',
  'health-check',
  'growth',
] as const

export type Stage = typeof STAGES[number]
export type StageStatus = 'pending' | 'running' | 'approved' | 'rejected' | 'failed' | 'skipped' | 'uncertain'

export interface StageState {
  status: StageStatus
  startedAt?: string
  finishedAt?: string
  output?: unknown
  error?: string
  retries: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
  verdict?: 'APPROVED' | 'REJECTED' | 'UNCERTAIN'
  reason?: string
}

export interface PipelineState {
  runId: string
  niche: string
  currentStage: Stage
  stages: Record<Stage, StageState>
  storeId?: string
  storeUrl?: string
  paused: boolean
  cancelled: boolean
  startedAt: string
  finishedAt?: string
}

export interface PipelineEvent {
  type: string
  runId: string
  stage?: Stage
  state?: StageState
  data?: Record<string, unknown>
  error?: string
  fullState?: PipelineState
  storeUrl?: string
  timestamp: string
}

const HEARTBEAT_MS = 25_000
const MAX_RECONNECT_ATTEMPTS = 5

function emptyStageState(): StageState {
  return { status: 'pending', retries: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: 0 }
}

function emptyState(runId: string): PipelineState {
  const stages = {} as Record<Stage, StageState>
  for (const s of STAGES) stages[s] = emptyStageState()
  return {
    runId, niche: '', currentStage: STAGES[0],
    stages, paused: false, cancelled: false, startedAt: '',
  }
}

interface UsePipelineSocketOpts {
  runId: string | null
  url?: string
}

export function usePipelineSocket({ runId, url }: UsePipelineSocketOpts) {
  const [state, setState] = useState<PipelineState | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<PipelineEvent | null>(null)
  const [logs, setLogs] = useState<Array<{ stage?: Stage; message: string; ts: string }>>([])

  const wsRef         = useRef<WebSocket | null>(null)
  const heartbeatRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const runIdRef = useRef<string | null>(runId)
  useEffect(() => { runIdRef.current = runId }, [runId])

  const wsUrl = url ?? (() => {
    if (typeof window === 'undefined') return ''
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const port = import.meta.env.VITE_WS_PORT ?? '3001'
    return `${proto}//${host}:${port}/ws`
  })()

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, HEARTBEAT_MS)
  }, [])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!wsUrl) return
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        reconnectAttempts.current = 0
        startHeartbeat()
      }

      ws.onmessage = (e) => {
        let event: PipelineEvent | { type: 'pong' }
        try { event = JSON.parse(e.data) } catch { return }
        if (event.type === 'pong') return

        const ev = event as PipelineEvent
        // Filter to current runId if set
        if (runIdRef.current && ev.runId && ev.runId !== runIdRef.current) return

        setLastEvent(ev)
        if (ev.fullState) {
          setState(ev.fullState)
        }
        if (ev.type === 'stage:progress' && ev.data?.message) {
          setLogs(prev => [...prev.slice(-499), {
            stage: ev.stage,
            message: ev.data!.message as string,
            ts: ev.timestamp,
          }])
        }
      }

      ws.onclose = (e) => {
        setIsConnected(false)
        stopHeartbeat()
        if (e.code !== 1000 && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++
          reconnectRef.current = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => { /* close will fire next */ }
    } catch {
      setIsConnected(false)
    }
  }, [wsUrl, startHeartbeat, stopHeartbeat])

  // Fetch initial state when runId set
  useEffect(() => {
    if (!runId) { setState(null); setLogs([]); return }
    fetch(`/api/pipeline/${runId}/state`)
      .then(r => r.ok ? r.json() : null)
      .then((s: PipelineState | null) => { if (s) setState(s); else setState(emptyState(runId)) })
      .catch(() => setState(emptyState(runId)))
  }, [runId])

  useEffect(() => {
    connect()
    return () => {
      stopHeartbeat()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'unmount')
      }
    }
  }, [connect, stopHeartbeat])

  return { state, isConnected, lastEvent, logs, STAGES }
}
