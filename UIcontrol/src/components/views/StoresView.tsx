import { useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, Store, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { getStores } from '@/lib/api'
import type { StoreInfo } from '@/types'

export function StoresView() {
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStores = async () => {
    setLoading(true)
    try {
      const data = await getStores()
      setStores(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStores()
    const interval = setInterval(fetchStores, 5000)
    return () => clearInterval(interval)
  }, [])

  const roasStyle = (roas: number | undefined) => {
    if (roas == null) return { color: 'text-slate-400', bg: 'bg-slate-800/40', border: 'border-slate-700/40' }
    if (roas >= 3) return { color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-700/30' }
    if (roas >= 2) return { color: 'text-amber-400',   bg: 'bg-amber-900/20',   border: 'border-amber-700/30' }
    return           { color: 'text-red-400',     bg: 'bg-red-900/20',     border: 'border-red-700/30' }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Stores</h1>
          <p className="text-xs text-slate-500 mt-0.5">{stores.length} deployed stores</p>
        </div>
        <button
          onClick={fetchStores}
          disabled={loading}
          className="text-slate-500 hover:text-slate-300 disabled:opacity-40 p-2 rounded-lg hover:bg-white/[0.04] transition-all"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {stores.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center mt-24 gap-2 text-slate-600">
          <Store size={32} className="opacity-30" />
          <p className="text-sm">No stores yet</p>
          <p className="text-xs">Run a pipeline to deploy your first store</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store) => {
            const rs = roasStyle(store.roas ?? undefined)
            return (
              <div
                key={store.storeId}
                className="bg-[#0d1117] border border-white/[0.08] rounded-xl p-4 hover:border-white/[0.14] transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-sm truncate">{store.subdomein}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{store.niche}</p>
                  </div>
                  {store.previewUrl && (
                    <a
                      href={store.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-600 hover:text-violet-400 transition-colors p-1 rounded-md hover:bg-white/[0.04] ml-2"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>

                <div className="h-px bg-white/[0.06] mb-3" />

                <div className="grid grid-cols-2 gap-3">
                  <div className={clsx('rounded-lg border p-2.5 text-center', rs.bg, rs.border)}>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp size={10} className={rs.color} />
                      <span className={clsx('text-[10px] font-medium uppercase tracking-wider', rs.color)}>ROAS</span>
                    </div>
                    <div className={clsx('text-base font-bold', rs.color)}>
                      {store.roas != null ? store.roas.toFixed(1) : '\u2014'}
                    </div>
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Status</div>
                    <div className="text-white text-sm font-medium capitalize">{store.status}</div>
                  </div>
                </div>

                {store.createdAt && (
                  <div className="text-[10px] text-slate-600 mt-3">
                    Created {new Date(store.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
