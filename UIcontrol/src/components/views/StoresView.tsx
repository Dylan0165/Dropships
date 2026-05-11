import { useEffect, useRef, useState } from 'react'
import { RefreshCw, ExternalLink, Store, Activity, AlertCircle, CheckCircle, Clock, DownloadCloud, Pencil, X } from 'lucide-react'
import clsx from 'clsx'
import { getStores } from '@/lib/api'
import type { StoreInfo } from '@/types'
import StoreEditor from './StoreEditor'

// Uitgebreide StoreInfo met health data
interface StoreInfoEx extends StoreInfo {
  port?: number
  healthStatus?: string
  healthError?: string
  healthCheckedAt?: string
  healthResponseMs?: number
  subdomein?: string
}

interface DeployToast {
  id: string
  storeName: string
  subdomain: string
  port?: number
  url: string
}

export function StoresView() {
  const [stores, setStores] = useState<StoreInfoEx[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editingStore, setEditingStore] = useState<StoreInfoEx | null>(null)
  const [toasts, setToasts] = useState<DeployToast[]>([])
  const [hasRemoteMode, setHasRemoteMode] = useState(false)
  const prevStatusRef = useRef<Map<string, string>>(new Map())

  const dismissToast = (id: string) => setToasts(t => t.filter(x => x.id !== id))

  const fetchStores = async () => {
    setLoading(true)
    try {
      const data = await getStores() as StoreInfoEx[]

      // Detect building → live transitions
      const newToasts: DeployToast[] = []
      for (const store of data) {
        const prev = prevStatusRef.current.get(store.storeId)
        const curr = store.status
        if (prev === 'building' && (curr === 'live' || curr === 'local')) {
          const port = store.port
          newToasts.push({
            id: `${store.storeId}-${Date.now()}`,
            storeName: store.subdomein ?? store.storeId,
            subdomain: store.subdomein ?? store.storeId,
            port,
            url: port ? `http://192.168.121.8:${port}` : store.previewUrl,
          })
        }
        prevStatusRef.current.set(store.storeId, curr)
      }
      if (newToasts.length > 0) {
        setToasts(t => [...t, ...newToasts])
        for (const toast of newToasts) {
          setTimeout(() => dismissToast(toast.id), 8000)
        }
      }

      setStores(data)
    } finally {
      setLoading(false)
    }
  }

  const syncStores = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/reconcile-stores', { method: 'POST' })
      const data = await res.json() as { added: number; updated: number; stores: string[]; error?: string }
      if (data.error) {
        const isConnErr = data.error.includes('niet bereikbaar') || data.error.includes('No route') || data.error.includes('Connection')
        setSyncResult(isConnErr
          ? `Store server niet bereikbaar. Zet STORE_SERVER_HOST leeg in .env voor lokale modus, of start de store server op ${data.error.match(/\d+\.\d+\.\d+\.\d+/)?.[0] ?? '192.168.121.8'}.`
          : `Fout: ${data.error}`)
      } else {
        const parts = []
        if (data.added > 0) parts.push(`${data.added} nieuw hersteld`)
        if (data.updated > 0) parts.push(`${data.updated} poorten gecorrigeerd`)
        setSyncResult(parts.length > 0
          ? `${parts.join(', ')}: ${data.stores.join(', ')}`
          : `Alles gesynchroniseerd (${data.stores.length} stores)`)
        await fetchStores()
      }
    } catch {
      setSyncResult('Sync mislukt — check of store-platform online is')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 6000)
    }
  }

  useEffect(() => {
    fetch('/api/server-mode').then(r => r.json()).then((d: { hasRemoteMode: boolean }) => setHasRemoteMode(d.hasRemoteMode)).catch(() => {})
    fetchStores()
    const interval = setInterval(fetchStores, 8000)
    return () => clearInterval(interval)
  }, [])

  const liveCount    = stores.filter(s => s.healthStatus === 'up').length
  const downCount    = stores.filter(s => s.healthStatus === 'down').length
  const buildingCount = stores.filter(s => s.status === 'building').length

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.07]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-base font-semibold text-white">Deployed Stores</h1>
            <p className="text-xs text-zinc-600 mt-0.5">{stores.length} stores totaal</p>
          </div>
          <div className="flex items-center gap-2">
            {hasRemoteMode && (
              <button
                onClick={syncStores}
                disabled={syncing}
                title="Herstel bestaande stores van de store server via SSH"
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white border border-white/[0.08] hover:border-white/[0.2] px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-all"
              >
                <DownloadCloud size={13} className={syncing ? 'animate-pulse' : ''} />
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            )}
            <button
              onClick={fetchStores}
              disabled={loading}
              className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 p-2 rounded-lg hover:bg-white/[0.04] transition-all"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Sync result toast */}
        {syncResult && (
          <div className={clsx(
            'mb-3 px-3 py-2 rounded-lg text-xs border',
            syncResult.startsWith('Fout') || syncResult.startsWith('Sync')
              ? 'bg-red-900/40 border-red-700/40 text-red-300'
              : 'bg-emerald-900/30 border-emerald-700/30 text-emerald-300',
          )}>
            {syncResult}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Online',   value: liveCount,    color: liveCount > 0 ? 'text-emerald-400' : 'text-zinc-500' },
            { label: 'Offline',  value: downCount,    color: downCount > 0 ? 'text-red-400' : 'text-zinc-500' },
            { label: 'Building', value: buildingCount,color: buildingCount > 0 ? 'text-amber-400' : 'text-zinc-500' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-center">
              <div className={clsx('text-sm font-bold', s.color)}>{s.value}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stores grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {stores.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center mt-24 gap-3 text-center">
            <Store size={36} className="text-zinc-700 opacity-30" />
            <div>
              <p className="text-zinc-400 text-sm font-medium">Geen stores gevonden</p>
              <p className="text-zinc-600 text-xs mt-1 max-w-xs">
                Heb je al stores gedeployed? Klik "Sync" om ze te herstellen vanuit de store server.
              </p>
            </div>
            {hasRemoteMode ? (
              <button
                onClick={syncStores}
                disabled={syncing}
                className="flex items-center gap-2 text-sm bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-zinc-200 transition-all disabled:opacity-50 mt-1"
              >
                <DownloadCloud size={14} />
                {syncing ? 'Bezig met synchroniseren...' : 'Herstel stores van server'}
              </button>
            ) : (
              <p className="text-zinc-600 text-xs mt-1">Start een pipeline run om je eerste store te maken.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {stores.map((store) => (
              <StoreCard
                key={store.storeId}
                store={store}
                expanded={selected === store.storeId}
                onToggle={() => setSelected(selected === store.storeId ? null : store.storeId)}
                onEdit={() => setEditingStore(store)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Store Editor panel */}
      {editingStore && (
        <StoreEditor
          storeId={editingStore.storeId}
          subdomain={editingStore.subdomein ?? editingStore.storeId}
          niche={editingStore.niche}
          onClose={() => setEditingStore(null)}
          onSaved={() => fetchStores()}
        />
      )}

      {/* Deploy success toasts */}
      <style>{`
        @keyframes slideInToast {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .deploy-toast { animation: slideInToast 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }
      `}</style>
      <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end', pointerEvents: 'none' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="deploy-toast"
            style={{
              background: '#0f1712',
              border: '1px solid rgba(74,222,128,0.25)',
              borderRadius: '14px',
              padding: '1rem 1.25rem',
              minWidth: '280px',
              maxWidth: '340px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(74,222,128,0.08)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80', flexShrink: 0, display: 'inline-block' }} />
                <span style={{ color: '#4ade80', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Store Live</span>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '0', flexShrink: 0, lineHeight: 1 }}
              >
                <X size={13} />
              </button>
            </div>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 0.25rem', letterSpacing: '-0.01em' }}>{toast.storeName}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', margin: '0 0 0.875rem', fontFamily: 'monospace' }}>
              {toast.subdomain}{toast.port ? ` · :${toast.port}` : ''}
            </p>
            <a
              href={toast.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: '#4ade80',
                color: '#0a0f09',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                textDecoration: 'none',
                letterSpacing: '0.02em',
              }}
            >
              Bekijk store <ExternalLink size={11} />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

function StoreCard({ store, expanded, onToggle, onEdit }: {
  store: StoreInfoEx
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const health = store.healthStatus ?? 'unknown'
  const isUp     = health === 'up'
  const isDown   = health === 'down'
  const isSlow   = health === 'slow'
  const isUnknown = health === 'unknown' || health === ''

  const healthDot = isUp ? 'bg-emerald-400' : isDown ? 'bg-red-400 animate-pulse' : isSlow ? 'bg-amber-400' : 'bg-zinc-600'
  const healthText = isUp ? 'Online' : isDown ? 'Offline' : isSlow ? 'Traag' : 'Onbekend'
  const healthColor = isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : isSlow ? 'text-amber-400' : 'text-zinc-600'

  const portUrl = store.port ? `http://192.168.121.8:${store.port}` : store.previewUrl

  return (
    <div
      className={clsx(
        'bg-[#111] border rounded-xl transition-all',
        isDown ? 'border-red-500/20' : expanded ? 'border-white/[0.14]' : 'border-white/[0.07] hover:border-white/[0.12]',
      )}
    >
      {/* Main card content */}
      <button className="w-full text-left p-4" onClick={onToggle}>
        <div className="flex items-start gap-3">
          {/* Health indicator */}
          <div className="flex-shrink-0 mt-0.5">
            {isDown ? (
              <AlertCircle size={16} className="text-red-400" />
            ) : isUp ? (
              <CheckCircle size={16} className="text-emerald-400" />
            ) : (
              <Activity size={16} className="text-zinc-600" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-white font-semibold text-sm truncate">{store.subdomein}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); onEdit() }}
                  className="text-zinc-600 hover:text-white transition-colors"
                  title="Store bewerken"
                >
                  <Pencil size={12} />
                </button>
                {portUrl && (
                  <a
                    href={portUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-zinc-600 hover:text-white transition-colors"
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{store.niche}</p>

            {/* Health + port row */}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1.5">
                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', healthDot)} />
                <span className={clsx('text-[11px] font-medium', healthColor)}>{healthText}</span>
              </div>
              {store.port && (
                <span className="text-[11px] text-zinc-600 font-mono">:{store.port}</span>
              )}
              {store.healthResponseMs != null && isUp && (
                <span className="text-[11px] text-zinc-600">{store.healthResponseMs}ms</span>
              )}
            </div>
          </div>
        </div>

        {/* Error message preview */}
        {isDown && store.healthError && (
          <div className="mt-2 px-3 py-1.5 bg-red-500/[0.06] border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-[11px] font-mono truncate">{store.healthError}</p>
          </div>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/[0.07] px-4 pb-4 pt-3 space-y-3">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-zinc-600 block uppercase tracking-wider text-[9px]">Status</span>
              <span className="text-white capitalize">{store.status}</span>
            </div>
            {store.roas != null && (
              <div>
                <span className="text-zinc-600 block uppercase tracking-wider text-[9px]">ROAS</span>
                <span className={clsx('font-bold', store.roas >= 3 ? 'text-emerald-400' : store.roas >= 2 ? 'text-amber-400' : 'text-red-400')}>
                  {store.roas.toFixed(1)}×
                </span>
              </div>
            )}
            {store.createdAt && (
              <div>
                <span className="text-zinc-600 block uppercase tracking-wider text-[9px]">Aangemaakt</span>
                <span className="text-zinc-300">
                  {new Date(store.createdAt).toLocaleString('nl', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
            {store.healthCheckedAt && (
              <div>
                <span className="text-zinc-600 block uppercase tracking-wider text-[9px]">Laatste check</span>
                <span className="text-zinc-300 flex items-center gap-1">
                  <Clock size={9} className="text-zinc-600" />
                  {new Date(store.healthCheckedAt).toLocaleTimeString('nl')}
                </span>
              </div>
            )}
          </div>

          {/* Links */}
          <div className="space-y-1.5">
            {portUrl && (
              <a
                href={portUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[12px] text-zinc-400 hover:text-white transition-colors group"
              >
                <ExternalLink size={11} className="group-hover:text-white" />
                {portUrl}
              </a>
            )}
          </div>

          {/* Full error if down */}
          {isDown && store.healthError && (
            <div className="bg-red-500/[0.06] border border-red-500/20 rounded-lg p-2.5">
              <p className="text-red-400 text-[11px] font-medium mb-0.5">Foutmelding</p>
              <p className="text-red-300/80 text-[11px] font-mono break-all">{store.healthError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
