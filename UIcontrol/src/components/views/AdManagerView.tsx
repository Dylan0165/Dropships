import { useEffect, useState } from 'react'
import { RefreshCw, Megaphone, ExternalLink, Play, Square, TrendingUp, TrendingDown, Clock, Image, Video, AlertCircle, CheckCircle } from 'lucide-react'
import clsx from 'clsx'
import { getStores } from '@/lib/api'
import type { StoreInfo } from '@/types'

interface AdRecord {
  id: number
  storeId: string
  platform: 'meta' | 'tiktok' | 'both'
  format: 'image' | 'video_animated'
  phase: 'static' | 'animated'
  status: 'queued' | 'generating' | 'ready' | 'published' | 'killed'
  hook: string
  primaryText: string
  performanceScore?: number
  createdAt: string
}

interface StoreWithAds extends StoreInfo {
  port?: number
  ads: AdRecord[]
}

async function getAds(): Promise<AdRecord[]> {
  try {
    const res = await fetch('/api/ads')
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

const STATUS_CFG: Record<AdRecord['status'], { label: string; color: string; bg: string; border: string }> = {
  queued:     { label: 'In wachtrij', color: 'text-zinc-400',   bg: 'bg-white/[0.03]',     border: 'border-white/[0.07]' },
  generating: { label: 'Genereren',   color: 'text-amber-400',  bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/20' },
  ready:      { label: 'Klaar',       color: 'text-white',      bg: 'bg-white/[0.04]',     border: 'border-white/[0.1]' },
  published:  { label: 'Live',        color: 'text-emerald-400',bg: 'bg-emerald-500/[0.06]',border:'border-emerald-500/20' },
  killed:     { label: 'Gestopt',     color: 'text-red-400',    bg: 'bg-red-500/[0.04]',   border: 'border-red-500/20' },
}

export function AdManagerView() {
  const [storesWithAds, setStoresWithAds] = useState<StoreWithAds[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<string | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [storesRaw, ads] = await Promise.all([getStores(), getAds()])
      const stores = storesRaw as StoreWithAds[]
      const combined: StoreWithAds[] = stores.map((s) => ({
        ...s,
        ads: ads.filter((a) => a.storeId === s.storeId),
      }))
      setStoresWithAds(combined)
      if (combined.length > 0 && !selectedStore) {
        setSelectedStore(combined[0].storeId)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 10000)
    return () => clearInterval(iv)
  }, [])

  const totalAds      = storesWithAds.reduce((s, st) => s + st.ads.length, 0)
  const liveAds       = storesWithAds.reduce((s, st) => s + st.ads.filter(a => a.status === 'published').length, 0)
  const killedAds     = storesWithAds.reduce((s, st) => s + st.ads.filter(a => a.status === 'killed').length, 0)
  const generatingAds = storesWithAds.reduce((s, st) => s + st.ads.filter(a => a.status === 'generating').length, 0)

  const selected = storesWithAds.find(s => s.storeId === selectedStore)

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel — store list */}
      <div className="w-[240px] flex-shrink-0 border-r border-white/[0.07] flex flex-col bg-[#0a0a0a]">
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/[0.07]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Ad Manager</h2>
            <button onClick={fetchAll} disabled={loading} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 transition-all">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              { label: 'Totaal', value: totalAds },
              { label: 'Live',   value: liveAds,    color: liveAds > 0 ? 'text-emerald-400' : undefined },
              { label: 'Gestopt',value: killedAds,  color: killedAds > 0 ? 'text-red-400' : undefined },
              { label: 'Bezig',  value: generatingAds, color: generatingAds > 0 ? 'text-amber-400' : undefined },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.03] rounded-lg p-2 text-center">
                <div className={clsx('text-sm font-bold font-mono', s.color ?? 'text-white')}>{s.value}</div>
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Store list */}
        <div className="flex-1 overflow-y-auto py-2">
          {storesWithAds.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center mt-8 gap-2 text-zinc-700 px-4 text-center">
              <Megaphone size={24} className="opacity-30" />
              <p className="text-xs">Nog geen stores. Draai eerst een pipeline.</p>
            </div>
          )}
          {storesWithAds.map((store) => {
            const live = store.ads.filter(a => a.status === 'published').length
            const killed = store.ads.filter(a => a.status === 'killed').length
            return (
              <button
                key={store.storeId}
                onClick={() => setSelectedStore(store.storeId)}
                className={clsx(
                  'w-full text-left px-4 py-3 transition-all border-l-2',
                  selectedStore === store.storeId
                    ? 'bg-white/[0.05] border-white text-white'
                    : 'border-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200',
                )}
              >
                <div className="text-[13px] font-medium truncate">{store.subdomein}</div>
                <div className="text-[11px] text-zinc-600 truncate mt-0.5">{store.niche}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-zinc-600">{store.ads.length} ads</span>
                  {live > 0 && <span className="text-[10px] text-emerald-400">{live} live</span>}
                  {killed > 0 && <span className="text-[10px] text-red-400">{killed} gestopt</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right panel — ads for selected store */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-700">
            <div className="text-center">
              <Megaphone size={36} className="opacity-20 mx-auto mb-3" />
              <p className="text-sm">Selecteer een store</p>
            </div>
          </div>
        ) : (
          <>
            {/* Store header */}
            <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
              <div>
                <h2 className="text-white font-semibold">{selected.subdomein}</h2>
                <p className="text-zinc-600 text-xs mt-0.5">{selected.niche}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.previewUrl && (
                  <a
                    href={selected.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-600 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/[0.04]"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
                <button
                  className="flex items-center gap-1.5 text-xs bg-white text-black px-3 py-1.5 rounded-lg font-medium hover:bg-zinc-200 transition-all"
                  onClick={() => alert('Ad generatie komt binnenkort — Higgsfield API koppeling in progress')}
                >
                  <Play size={11} />
                  Genereer ad
                </button>
              </div>
            </div>

            {/* Tabs: Phase 1 / Phase 2 */}
            <div className="flex-1 overflow-y-auto p-4">
              {selected.ads.length === 0 ? (
                <EmptyAds onGenerate={() => alert('Ad generatie komt binnenkort')} />
              ) : (
                <div className="space-y-3">
                  {/* Phase 1 — Static */}
                  <AdSection
                    title="Fase 1 — Statische ads"
                    icon={<Image size={13} />}
                    ads={selected.ads.filter(a => a.phase === 'static')}
                  />
                  {/* Phase 2 — Animated */}
                  <AdSection
                    title="Fase 2 — Geanimeerde video ads"
                    icon={<Video size={13} />}
                    ads={selected.ads.filter(a => a.phase === 'animated')}
                    comingSoon={selected.ads.filter(a => a.phase === 'animated').length === 0}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AdSection({ title, icon, ads, comingSoon = false }: {
  title: string
  icon: React.ReactNode
  ads: AdRecord[]
  comingSoon?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-zinc-500">{icon}</span>
        <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">{title}</span>
        {ads.length > 0 && (
          <span className="text-[10px] text-zinc-700 bg-white/[0.04] px-1.5 py-0.5 rounded-full">{ads.length}</span>
        )}
      </div>

      {comingSoon && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 text-center">
          <Video size={20} className="text-zinc-700 mx-auto mb-2" />
          <p className="text-zinc-600 text-xs">Fase 2 wordt beschikbaar na goede ROAS of performance score &gt; 7.0</p>
        </div>
      )}

      <div className="space-y-2">
        {ads.map((ad) => <AdCard key={ad.id} ad={ad} />)}
      </div>
    </div>
  )
}

function AdCard({ ad }: { ad: AdRecord }) {
  const sc = STATUS_CFG[ad.status] ?? STATUS_CFG.queued
  const hasScore = ad.performanceScore != null

  return (
    <div className={clsx('rounded-xl border p-3.5', sc.bg, sc.border)}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={ad.status} />
          <PlatformBadge platform={ad.platform} />
          <FormatBadge format={ad.format} />
        </div>
        {hasScore && (
          <ScoreIndicator score={ad.performanceScore!} />
        )}
      </div>

      {ad.hook && (
        <div className="mb-1.5">
          <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Hook</span>
          <p className="text-zinc-200 text-[12px] mt-0.5 leading-5">{ad.hook}</p>
        </div>
      )}

      {ad.primaryText && (
        <div>
          <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Primary text</span>
          <p className="text-zinc-400 text-[11px] mt-0.5 leading-4">{ad.primaryText.slice(0, 100)}</p>
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[10px] text-zinc-700 flex items-center gap-1">
          <Clock size={9} />
          {new Date(ad.createdAt).toLocaleString('nl', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
        <KillScaleButtons ad={ad} />
      </div>
    </div>
  )
}

function KillScaleButtons({ ad }: { ad: AdRecord }) {
  if (ad.status === 'killed') return <span className="text-red-400/60 text-[10px]">Gestopt</span>
  if (ad.status === 'published') return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => alert('Scale → Higgsfield fase 2 (binnenkort beschikbaar)')}
        className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-md px-2 py-0.5 transition-all"
      >
        <TrendingUp size={9} />
        Scale
      </button>
      <button
        onClick={() => alert('Kill → Ad wordt gestopt (binnenkort beschikbaar)')}
        className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 border border-red-500/20 rounded-md px-2 py-0.5 transition-all"
      >
        <TrendingDown size={9} />
        Kill
      </button>
    </div>
  )
  return null
}

function StatusBadge({ status }: { status: AdRecord['status'] }) {
  const sc = STATUS_CFG[status]
  return (
    <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', sc.color, sc.bg, sc.border)}>
      {sc.label}
    </span>
  )
}

function PlatformBadge({ platform }: { platform: string }) {
  const map: Record<string, string> = { meta: 'Meta', tiktok: 'TikTok', both: 'Meta + TikTok' }
  return <span className="text-[10px] text-zinc-500 border border-white/[0.07] px-1.5 py-0.5 rounded-full">{map[platform] ?? platform}</span>
}

function FormatBadge({ format }: { format: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode }> = {
    image:          { label: 'Afbeelding', icon: <Image size={9} /> },
    video_animated: { label: 'Video',      icon: <Video size={9} /> },
  }
  const cfg = map[format] ?? { label: format, icon: null }
  return (
    <span className="flex items-center gap-1 text-[10px] text-zinc-500 border border-white/[0.07] px-1.5 py-0.5 rounded-full">
      {cfg.icon}{cfg.label}
    </span>
  )
}

function ScoreIndicator({ score }: { score: number }) {
  const color = score >= 7 ? 'text-emerald-400' : score >= 4 ? 'text-amber-400' : 'text-red-400'
  const Icon = score >= 7 ? CheckCircle : score >= 4 ? AlertCircle : TrendingDown
  return (
    <div className={clsx('flex items-center gap-1 text-[11px] font-bold', color)}>
      <Icon size={11} />
      {score.toFixed(1)}
    </div>
  )
}

function EmptyAds({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center mt-12 gap-3 text-center">
      <Megaphone size={32} className="text-zinc-700 opacity-50" />
      <div>
        <p className="text-zinc-400 text-sm font-medium">Nog geen ads voor deze store</p>
        <p className="text-zinc-600 text-xs mt-1">Ads worden automatisch gegenereerd na een pipeline run, of je kunt ze handmatig starten.</p>
      </div>
      <button
        onClick={onGenerate}
        className="flex items-center gap-2 text-xs bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-zinc-200 transition-all mt-2"
      >
        <Play size={11} />
        Genereer eerste ads
      </button>
    </div>
  )
}
