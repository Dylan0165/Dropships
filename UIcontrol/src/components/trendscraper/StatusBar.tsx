import { useEffect, useRef, useState } from 'react'
import { Activity, AlertCircle, Play, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { StatusResponse } from '@/lib/trendscraper-api'
import { getStatus, triggerRun } from '@/lib/trendscraper-api'

/** Format seconds into "X min" or "X uur Y min" */
function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} uur ${m} min` : `${h} uur`
}

/** Return relative time string e.g. "23 minuten geleden" */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'zojuist'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minuten geleden`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} uur geleden`
  return `${Math.floor(hours / 24)} dagen geleden`
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'nu'
  return formatDuration(diff)
}

interface Props {
  online: boolean
  status: StatusResponse | null
  onRunTriggered: () => void
}

export function StatusBar({ online, status, onRunTriggered }: Props) {
  const [triggering, setTriggering] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      await triggerRun()
      showToast('Scraper run gestart!')
      onRunTriggered()
    } catch {
      showToast('Fout bij starten run')
    } finally {
      setTriggering(false)
    }
  }

  const lastRun = status?.last_run
  const nextRun = status?.next_run_time

  return (
    <div className="flex items-center justify-between gap-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 mb-4 transition-all duration-200 hover:border-white/20">
      {/* Status indicator */}
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div
            className={clsx(
              'w-2.5 h-2.5 rounded-full',
              online ? 'bg-emerald-400' : 'bg-red-500',
            )}
          />
          {online && (
            <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
          )}
        </div>
        <span className={clsx('text-sm font-medium', online ? 'text-emerald-300' : 'text-red-400')}>
          {online ? 'Scraper online' : 'Scraper offline'}
        </span>
      </div>

      {/* Run info */}
      <div className="flex items-center gap-6 text-sm text-slate-400">
        {lastRun && (
          <span className="flex items-center gap-1.5">
            <Activity size={13} className="text-slate-500" />
            Laatste run: {timeAgo(lastRun.timestamp)}
          </span>
        )}
        {nextRun && (
          <span className="flex items-center gap-1.5">
            <AlertCircle size={13} className="text-slate-500" />
            Volgende run: over {timeUntil(nextRun)}
          </span>
        )}
      </div>

      {/* Trigger button + toast */}
      <div className="flex items-center gap-3">
        {toast && (
          <span className="text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-1">
            {toast}
          </span>
        )}
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all duration-150"
        >
          {triggering ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          Nu uitvoeren
        </button>
      </div>
    </div>
  )
}
