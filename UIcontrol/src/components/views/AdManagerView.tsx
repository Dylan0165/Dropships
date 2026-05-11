import { useEffect, useState, useCallback } from 'react'
import {
  RefreshCw, Megaphone, ExternalLink, Play, TrendingUp, TrendingDown,
  Clock, Image, Video, AlertCircle, CheckCircle, Loader2, Sparkles, Palette,
} from 'lucide-react'
import clsx from 'clsx'
import { getStores } from '@/lib/api'
import type { StoreInfo } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdRecord {
  id: number
  storeId: string
  platform: 'meta' | 'tiktok' | 'both'
  format: string
  phase: 'static' | 'animated'
  status: 'queued' | 'generating' | 'ready' | 'published' | 'killed'
  hook: string
  primaryText: string
  headline?: string
  creativeUrl?: string
  performanceScore?: number
  createdAt: string
}

interface StoreBranding {
  brandName:     string
  slogan:        string
  niche:         string
  primary:       string
  secondary:     string
  accent:        string
  productImages: string[]
}

interface StoreWithAds extends StoreInfo {
  port?: number
  ads: AdRecord[]
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchAds(storeId: string): Promise<AdRecord[]> {
  try {
    const r = await fetch(`/api/stores/${storeId}/ads`)
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

async function fetchAllAds(): Promise<AdRecord[]> {
  try {
    const r = await fetch('/api/ads')
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

async function fetchBranding(storeId: string): Promise<StoreBranding | null> {
  try {
    const r = await fetch(`/api/stores/${storeId}/branding`)
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

async function apiGenerateAds(storeId: string): Promise<{ created: number } | null> {
  try {
    const r = await fetch(`/api/stores/${storeId}/ads/generate`, { method: 'POST' })
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

async function apiAnimateAd(adId: number): Promise<void> {
  await fetch(`/api/ads/${adId}/animate`, { method: 'POST' })
}

async function apiKillAd(adId: number): Promise<void> {
  await fetch(`/api/ads/${adId}/kill`, { method: 'POST' })
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AdRecord['status'], { label: string; color: string; bg: string; border: string }> = {
  queued:     { label: 'In wachtrij', color: 'text-zinc-400',    bg: 'bg-white/[0.03]',      border: 'border-white/[0.07]' },
  generating: { label: 'Genereren',   color: 'text-amber-400',   bg: 'bg-amber-500/[0.06]',  border: 'border-amber-500/20' },
  ready:      { label: 'Klaar',       color: 'text-white',       bg: 'bg-white/[0.04]',      border: 'border-white/[0.1]' },
  published:  { label: 'Live',        color: 'text-emerald-400', bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20' },
  killed:     { label: 'Gestopt',     color: 'text-red-400',     bg: 'bg-red-500/[0.04]',    border: 'border-red-500/20' },
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function AdManagerView() {
  const [storesWithAds, setStoresWithAds] = useState<StoreWithAds[]>([])
  const [loading, setLoading]             = useState(true)
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [branding, setBranding]           = useState<StoreBranding | null>(null)
  const [generating, setGenerating]       = useState(false)
  const [generateMsg, setGenerateMsg]     = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [storesRaw, ads] = await Promise.all([getStores(), fetchAllAds()])
      const stores = storesRaw as StoreWithAds[]
      const combined: StoreWithAds[] = stores.map(s => ({
        ...s,
        ads: ads.filter(a => a.storeId === s.storeId),
      }))
      setStoresWithAds(combined)
      if (combined.length > 0 && !selectedStore) {
        setSelectedStore(combined[0].storeId)
      }
    } finally {
      setLoading(false)
    }
  }, [selectedStore])

  // Load branding when selected store changes
  useEffect(() => {
    if (!selectedStore) return
    setBranding(null)
    fetchBranding(selectedStore).then(setBranding)
  }, [selectedStore])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 10_000)
    return () => clearInterval(iv)
  }, [fetchAll])

  const handleGenerate = async () => {
    if (!selectedStore || generating) return
    setGenerating(true)
    setGenerateMsg(null)
    try {
      const result = await apiGenerateAds(selectedStore)
      if (result) {
        setGenerateMsg(`${result.created} ads gegenereerd`)
        await fetchAll()
      } else {
        setGenerateMsg('Generatie mislukt')
      }
    } finally {
      setGenerating(false)
      setTimeout(() => setGenerateMsg(null), 4000)
    }
  }

  const handleKill = async (adId: number) => {
    await apiKillAd(adId)
    await fetchAll()
  }

  const handleAnimate = async (adId: number) => {
    await apiAnimateAd(adId)
    await fetchAll()
  }

  const totalAds      = storesWithAds.reduce((s, st) => s + st.ads.length, 0)
  const liveAds       = storesWithAds.reduce((s, st) => s + st.ads.filter(a => a.status === 'published').length, 0)
  const killedAds     = storesWithAds.reduce((s, st) => s + st.ads.filter(a => a.status === 'killed').length, 0)
  const generatingAds = storesWithAds.reduce((s, st) => s + st.ads.filter(a => a.status === 'generating').length, 0)
  const selected      = storesWithAds.find(s => s.storeId === selectedStore)

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── Left panel — store list ── */}
      <div className="w-[220px] flex-shrink-0 border-r border-white/[0.07] flex flex-col bg-[#0a0a0a]">
        <div className="px-4 py-4 border-b border-white/[0.07]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Ad Manager</h2>
            <button onClick={fetchAll} disabled={loading} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 transition-all">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: 'Totaal',  value: totalAds },
              { label: 'Live',    value: liveAds,       color: liveAds > 0 ? 'text-emerald-400' : undefined },
              { label: 'Gestopt', value: killedAds,     color: killedAds > 0 ? 'text-red-400' : undefined },
              { label: 'Bezig',   value: generatingAds, color: generatingAds > 0 ? 'text-amber-400' : undefined },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.03] rounded-lg p-2 text-center">
                <div className={clsx('text-sm font-bold font-mono', s.color ?? 'text-white')}>{s.value}</div>
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {storesWithAds.length === 0 && !loading && (
            <div className="flex flex-col items-center mt-8 gap-2 text-zinc-700 px-4 text-center">
              <Megaphone size={22} className="opacity-30" />
              <p className="text-xs">Nog geen stores.</p>
            </div>
          )}
          {storesWithAds.map(store => {
            const live   = store.ads.filter(a => a.status === 'published').length
            const killed = store.ads.filter(a => a.status === 'killed').length
            const isLive = store.status === 'live' || store.status === 'local'
            return (
              <button
                key={store.storeId}
                onClick={() => setSelectedStore(store.storeId)}
                className={clsx(
                  'w-full text-left px-3.5 py-2.5 transition-all border-l-2',
                  selectedStore === store.storeId
                    ? 'bg-white/[0.05] border-white text-white'
                    : 'border-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200',
                )}
              >
                <div className="flex items-center gap-1.5">
                  {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
                  <span className="text-[13px] font-medium truncate">{store.subdomein}</span>
                </div>
                <div className="text-[11px] text-zinc-600 truncate mt-0.5">{store.niche}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-zinc-600">{store.ads.length} ads</span>
                  {live > 0 && <span className="text-[10px] text-emerald-400">{live} live</span>}
                  {killed > 0 && <span className="text-[10px] text-red-400">{killed} gestopt</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right panel ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-zinc-700">
          <div className="text-center">
            <Megaphone size={36} className="opacity-20 mx-auto mb-3" />
            <p className="text-sm">Selecteer een store</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Store header */}
          <div className="px-6 py-4 border-b border-white/[0.07]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-white font-semibold">{selected.subdomein}</h2>
                  {selected.status === 'live' && (
                    <span className="text-[10px] text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">Live</span>
                  )}
                </div>
                <p className="text-zinc-600 text-xs mt-0.5">{selected.niche}</p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {selected.previewUrl && (
                  <a
                    href={selected.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-600 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/[0.04]"
                    title="Bekijk store"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
                {generateMsg && (
                  <span className="text-emerald-400 text-xs">{generateMsg}</span>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 text-xs bg-white text-black px-3 py-1.5 rounded-lg font-semibold hover:bg-zinc-200 transition-all disabled:opacity-50"
                >
                  {generating
                    ? <><Loader2 size={11} className="animate-spin" /> Genereren...</>
                    : <><Sparkles size={11} /> Genereer ads</>}
                </button>
              </div>
            </div>

            {/* Branding strip */}
            {branding && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Palette size={11} className="text-zinc-600" />
                  <span className="text-[11px] text-zinc-500">Branding</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0"
                    style={{ background: branding.primary }}
                    title={`Primary: ${branding.primary}`}
                  />
                  <span
                    className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0"
                    style={{ background: branding.secondary }}
                    title={`Secondary: ${branding.secondary}`}
                  />
                  <span
                    className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0"
                    style={{ background: branding.accent }}
                    title={`Accent: ${branding.accent}`}
                  />
                </div>
                <span className="text-[11px] text-zinc-400 font-medium">{branding.brandName}</span>
                {branding.slogan && (
                  <span className="text-[11px] text-zinc-600 italic truncate max-w-[260px]">"{branding.slogan}"</span>
                )}
                {branding.productImages.length > 0 && (
                  <div className="flex items-center gap-1">
                    {branding.productImages.slice(0, 3).map((url, i) => (
                      <img key={i} src={url} alt="" className="w-6 h-6 rounded object-cover border border-white/10" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ad content */}
          <div className="flex-1 overflow-y-auto p-4">
            {selected.ads.length === 0 ? (
              <EmptyAds onGenerate={handleGenerate} generating={generating} />
            ) : (
              <div className="space-y-4">
                <AdSection
                  title="Fase 1 — Foto ads"
                  icon={<Image size={13} />}
                  ads={selected.ads.filter(a => a.phase === 'static')}
                  onKill={handleKill}
                  onAnimate={handleAnimate}
                />
                <AdSection
                  title="Fase 2 — Video ads (Higgsfield)"
                  icon={<Video size={13} />}
                  ads={selected.ads.filter(a => a.phase === 'animated')}
                  onKill={handleKill}
                  onAnimate={handleAnimate}
                  comingSoon={
                    selected.ads.filter(a => a.phase === 'animated').length === 0 &&
                    selected.ads.filter(a => a.phase === 'static' && a.status === 'ready').length === 0
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AdSection({ title, icon, ads, comingSoon = false, onKill, onAnimate }: {
  title: string
  icon: React.ReactNode
  ads: AdRecord[]
  comingSoon?: boolean
  onKill: (id: number) => void
  onAnimate: (id: number) => void
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
          <Video size={18} className="text-zinc-700 mx-auto mb-2 opacity-50" />
          <p className="text-zinc-600 text-xs">
            Fase 2 beschikbaar nadat fase 1 ads klaar zijn. Klik "Animeer" op een foto-ad om te starten.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        {ads.map(ad => (
          <AdCard key={ad.id} ad={ad} onKill={onKill} onAnimate={onAnimate} />
        ))}
      </div>
    </div>
  )
}

function AdCard({ ad, onKill, onAnimate }: {
  ad: AdRecord
  onKill: (id: number) => void
  onAnimate: (id: number) => void
}) {
  const sc       = STATUS_CFG[ad.status] ?? STATUS_CFG.queued
  const hasScore = ad.performanceScore != null
  const isVideo  = ad.format === 'video_animated' || ad.creativeUrl?.endsWith('.mp4')

  return (
    <div className={clsx('rounded-xl border overflow-hidden', sc.bg, sc.border)}>
      {/* Creative preview */}
      {ad.creativeUrl && (
        <div className="relative bg-black aspect-video w-full overflow-hidden">
          {isVideo ? (
            <video
              src={ad.creativeUrl}
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <img
              src={ad.creativeUrl}
              alt={ad.headline ?? 'Ad creative'}
              className="w-full h-full object-cover"
            />
          )}
          {isVideo && (
            <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <Video size={9} /> Video
            </span>
          )}
        </div>
      )}

      <div className="p-3.5">
        {/* Badges */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={ad.status} />
            <span className="text-[10px] text-zinc-500 border border-white/[0.07] px-1.5 py-0.5 rounded-full">Meta</span>
            <span className="text-[10px] text-zinc-500 border border-white/[0.07] px-1.5 py-0.5 rounded-full">
              {ad.format === 'video_animated' ? 'Video' : 'Foto'}
            </span>
          </div>
          {hasScore && <ScoreIndicator score={ad.performanceScore!} />}
        </div>

        {/* Hook */}
        {ad.hook && (
          <div className="mb-1.5">
            <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Hook</span>
            <p className="text-zinc-200 text-[12px] mt-0.5 leading-5">{ad.hook}</p>
          </div>
        )}

        {/* Primary text */}
        {ad.primaryText && (
          <div className="mb-2">
            <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Tekst</span>
            <p className="text-zinc-500 text-[11px] mt-0.5 leading-4">{ad.primaryText.slice(0, 90)}{ad.primaryText.length > 90 ? '…' : ''}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-zinc-700 flex items-center gap-1">
            <Clock size={9} />
            {new Date(ad.createdAt).toLocaleString('nl', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
          <ActionButtons ad={ad} onKill={onKill} onAnimate={onAnimate} />
        </div>
      </div>
    </div>
  )
}

function ActionButtons({ ad, onKill, onAnimate }: {
  ad: AdRecord
  onKill: (id: number) => void
  onAnimate: (id: number) => void
}) {
  if (ad.status === 'killed') {
    return <span className="text-red-400/50 text-[10px]">Gestopt</span>
  }
  if (ad.status === 'generating') {
    return (
      <span className="flex items-center gap-1 text-amber-400 text-[10px]">
        <Loader2 size={9} className="animate-spin" /> Bezig…
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Animate button — only for static ready ads */}
      {ad.phase === 'static' && ad.status === 'ready' && (
        <button
          onClick={() => onAnimate(ad.id)}
          className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 border border-violet-500/20 rounded-md px-2 py-0.5 transition-all"
          title="Animeer via Higgsfield"
        >
          <Sparkles size={9} /> Animeer
        </button>
      )}

      {/* Scale button — only for published ads */}
      {ad.status === 'published' && (
        <button
          onClick={() => onAnimate(ad.id)}
          className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-md px-2 py-0.5 transition-all"
        >
          <TrendingUp size={9} /> Scale
        </button>
      )}

      {/* Kill — available for ready and published */}
      {(ad.status === 'ready' || ad.status === 'published') && (
        <button
          onClick={() => onKill(ad.id)}
          className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 border border-red-500/20 rounded-md px-2 py-0.5 transition-all"
        >
          <TrendingDown size={9} /> Kill
        </button>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: AdRecord['status'] }) {
  const sc = STATUS_CFG[status]
  const Icon = status === 'generating' ? Loader2
    : status === 'published' ? CheckCircle
    : status === 'killed' ? TrendingDown
    : status === 'ready' ? CheckCircle
    : AlertCircle
  return (
    <span className={clsx('flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border', sc.color, sc.bg, sc.border)}>
      <Icon size={9} className={status === 'generating' ? 'animate-spin' : ''} />
      {sc.label}
    </span>
  )
}

function ScoreIndicator({ score }: { score: number }) {
  const color = score >= 7 ? 'text-emerald-400' : score >= 4 ? 'text-amber-400' : 'text-red-400'
  const Icon  = score >= 7 ? CheckCircle : score >= 4 ? AlertCircle : TrendingDown
  return (
    <div className={clsx('flex items-center gap-1 text-[11px] font-bold', color)}>
      <Icon size={10} />
      {score.toFixed(1)}
    </div>
  )
}

function EmptyAds({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center mt-16 gap-3 text-center">
      <Megaphone size={32} className="text-zinc-700 opacity-40" />
      <div>
        <p className="text-zinc-400 text-sm font-medium">Nog geen ads voor deze store</p>
        <p className="text-zinc-600 text-xs mt-1 max-w-xs">
          Klik op "Genereer ads" om fase 1 (foto ads) te starten. Fase 2 (Higgsfield video) volgt daarna automatisch bij goede performance.
        </p>
      </div>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="flex items-center gap-2 text-xs bg-white text-black px-4 py-2 rounded-lg font-semibold hover:bg-zinc-200 transition-all disabled:opacity-50 mt-1"
      >
        {generating ? <><Loader2 size={11} className="animate-spin" /> Bezig…</> : <><Play size={11} /> Genereer eerste ads</>}
      </button>
    </div>
  )
}
