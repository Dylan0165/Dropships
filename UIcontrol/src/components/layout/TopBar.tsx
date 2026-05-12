import clsx from 'clsx'
import { Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

export function TopBar() {
  const [wsConnected, setWsConnected] = useState(false)
  const [totalEur, setTotalEur] = useState(0)

  useEffect(() => {
    let cancelled = false

    function probe() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.hostname
      const port = import.meta.env.VITE_WS_PORT ?? '3001'
      const ws = new WebSocket(`${proto}//${host}:${port}/ws`)
      ws.onopen  = () => !cancelled && setWsConnected(true)
      ws.onclose = () => {
        if (cancelled) return
        setWsConnected(false)
        setTimeout(probe, 3000)
      }
      ws.onerror = () => { /* close fires next */ }
    }
    probe()

    function loadCosts() {
      fetch('/api/obs/costs')
        .then(r => r.ok ? r.json() : null)
        .then((data: { byRun: Array<{ totalUsd: number }> } | null) => {
          if (cancelled || !data) return
          const sum = data.byRun.reduce((a, x) => a + x.totalUsd, 0)
          setTotalEur(sum * 0.92)
        })
        .catch(() => { /* ignore */ })
    }
    loadCosts()
    const interval = setInterval(loadCosts, 30_000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <header className="h-[52px] flex-shrink-0 bg-[#0a0a0a] border-b border-white/[0.07] px-5 flex items-center justify-between z-50">
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-white tracking-tight text-sm">Dropship</span>
        <span className="text-[10px] border border-white/[0.1] text-zinc-500 px-1.5 py-0.5 rounded-full font-mono">v0.1</span>
      </div>

      <div className="flex items-center gap-4">
        {totalEur > 0 && (
          <span className="text-white font-semibold font-mono text-sm">€{totalEur.toFixed(3)}</span>
        )}
        <div
          title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
          className={clsx(
            'flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border',
            wsConnected
              ? 'text-zinc-400 border-white/[0.08]'
              : 'text-red-400 border-red-500/20 bg-red-500/5',
          )}
        >
          {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span>{wsConnected ? 'Live' : 'Off'}</span>
        </div>
      </div>
    </header>
  )
}
