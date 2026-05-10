import { useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, Store, Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import clsx from 'clsx'
import { getStores } from '@/lib/api'
import type { StoreInfo } from '@/types'

// Uitgebreide StoreInfo met health data
interface StoreInfoEx extends StoreInfo {
  port?: number
  healthStatus?: string
  healthError?: string
  healthCheckedAt?: string
  healthResponseMs?: number
}

export function StoresView() {
  const [stores, setStores] = useState<StoreInfoEx[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const fetchStores = async () => {
    setLoading(true)
    try {
      const data = await getStores() as StoreInfoEx[]
      setStores(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
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
          <button
            onClick={fetchStores}
            disabled={loading}
            className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 p-2 rounded-lg hover:bg-white/[0.04] transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

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
          <div className="flex flex-col items-center justify-center mt-24 gap-2 text-zinc-700">
            <Store size={32} className="opacity-30" />
            <p className="text-sm">Nog geen stores</p>
            <p className="text-xs">Draai een pipeline om je eerste store te deployen</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {stores.map((store) => (
              <StoreCard
                key={store.storeId}
                store={store}
                expanded={selected === store.storeId}
                onToggle={() => setSelected(selected === store.storeId ? null : store.storeId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StoreCard({ store, expanded, onToggle }: {
  store: StoreInfoEx
  expanded: boolean
  onToggle: () => void
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
              {portUrl && (
                <a
                  href={portUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-zinc-600 hover:text-white transition-colors flex-shrink-0"
                >
                  <ExternalLink size={12} />
                </a>
              )}
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
