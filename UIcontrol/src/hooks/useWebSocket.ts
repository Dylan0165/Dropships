import { useEffect, useRef, useState, useCallback } from 'react'
import type { WsEvent } from '@/types'

const MAX_RETRIES = 10
const BASE_DELAY = 2000
const MAX_DELAY = 30000

export function useWebSocket(onEvent: (event: WsEvent) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retriesRef.current = 0
    }

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as WsEvent
        onEventRef.current(event)
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      if (retriesRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY * Math.pow(2, retriesRef.current), MAX_DELAY)
        retriesRef.current++
        setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  return { connected }
}
