import { useCallback, useEffect, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { StatusBar } from '@/components/trendscraper/StatusBar'
import { StatsCards } from '@/components/trendscraper/StatsCards'
import { NicheCard } from '@/components/trendscraper/NicheCard'
import { ProductsTable } from '@/components/trendscraper/ProductsTable'
import { RunHistory } from '@/components/trendscraper/RunHistory'
import {
  getHealth,
  getStatus,
  getNiches,
  approveNiche,
  rejectNiche,
} from '@/lib/trendscraper-api'
import type { NicheRecord, StatusResponse } from '@/lib/trendscraper-api'

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all'

export function TrendScraperView() {
  const [online, setOnline] = useState(false)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [niches, setNiches] = useState<NicheRecord[]>([])
  const [filter, setFilter] = useState<FilterTab>('pending')
  const [selectedNicheId, setSelectedNicheId] = useState<number | null>(null)

  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nichesIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      await getHealth()
      setOnline(true)
      const s = await getStatus()
      setStatus(s)
    } catch {
      setOnline(false)
    }
  }, [])

  const fetchNiches = useCallback(async () => {
    try {
      const data = await getNiches(filter === 'all' ? undefined : filter)
      setNiches(data)
    } catch {
      // scraper offline — keep stale data
    }
  }, [filter])

  // ── Initial load + polling ─────────────────────────────────────────────────

  useEffect(() => {
    fetchStatus()
    statusIntervalRef.current = setInterval(fetchStatus, 30_000)
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current)
    }
  }, [fetchStatus])

  useEffect(() => {
    fetchNiches()
    nichesIntervalRef.current = setInterval(fetchNiches, 10_000)
    return () => {
      if (nichesIntervalRef.current) clearInterval(nichesIntervalRef.current)
    }
  }, [fetchNiches])

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (id: number) => {
    // optimistic remove from pending list
    setNiches(prev => prev.filter(n => n.id !== id))
    setSelectedNicheId(null)
    try {
      await approveNiche(id)
      await fetchStatus()
    } catch {
      // re-fetch to restore
      await fetchNiches()
    }
  }, [fetchNiches, fetchStatus])

  const handleReject = useCallback(async (id: number) => {
    setNiches(prev => prev.filter(n => n.id !== id))
    setSelectedNicheId(null)
    try {
      await rejectNiche(id)
      await fetchStatus()
    } catch {
      await fetchNiches()
    }
  }, [fetchNiches, fetchStatus])

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'pending', label: 'Te reviewen' },
    { key: 'approved', label: 'Goedgekeurd' },
    { key: 'rejected', label: 'Afgewezen' },
    { key: 'all', label: 'Alles' },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-[#0f0f0f] p-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <TrendingUp size={18} className="text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Trendscraper</h1>
          <p className="text-xs text-slate-500">AI-powered niche discovery</p>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar online={online} status={status} onRunTriggered={fetchNiches} />

      {/* Stats */}
      <StatsCards counts={status?.niche_counts ?? null} />

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Niche cards */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          {/* Filter tabs */}
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 self-start">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={[
                  'px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
                  filter === tab.key
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Niche grid */}
          {niches.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-slate-500 text-sm">
              {online
                ? 'Geen niches gevonden. Start een run om data te laden.'
                : 'Scraper offline — start de Python service (python main.py).'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {niches.map(niche => (
                <div
                  key={niche.id}
                  onClick={() => setSelectedNicheId(prev => prev === niche.id ? null : niche.id)}
                  className="cursor-pointer"
                >
                  <NicheCard
                    niche={niche}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                  {selectedNicheId === niche.id && (
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      <ProductsTable nicheId={niche.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Run history */}
        <div className="xl:col-span-1">
          <RunHistory />
        </div>
      </div>
    </div>
  )
}
