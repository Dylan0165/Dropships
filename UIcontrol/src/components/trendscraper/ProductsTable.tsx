import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import clsx from 'clsx'
import type { ProductRecord } from '@/lib/trendscraper-api'
import { getProducts } from '@/lib/trendscraper-api'

function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse bg-white/10 rounded', className)} />
}

interface Props {
  nicheId: number | null
}

export function ProductsTable({ nicheId }: Props) {
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (nicheId == null) return
    setLoading(true)
    setError(null)
    getProducts(nicheId)
      .then(data => setProducts([...data].sort((a, b) => b.margin_percent - a.margin_percent)))
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [nicheId])

  if (nicheId == null) return null

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 transition-all duration-200 hover:border-white/20">
      <h4 className="font-bold text-slate-200 mb-4 flex items-center gap-2">
        <Package size={16} className="text-violet-400" />
        Producten
      </h4>

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {!loading && !error && products.length === 0 && (
        <p className="text-sm text-slate-500">Geen producten gevonden voor deze niche.</p>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-3 pr-4 font-medium">Afbeelding</th>
                <th className="pb-3 pr-4 font-medium">Naam</th>
                <th className="pb-3 pr-4 font-medium text-right">Inkoopprijs</th>
                <th className="pb-3 pr-4 font-medium text-right">Verkoopprijs</th>
                <th className="pb-3 pr-4 font-medium text-right">Marge</th>
                <th className="pb-3 font-medium text-right">Levertijd NL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="py-2 pr-4">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-10 h-10 object-cover rounded-lg border border-white/10"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-10 h-10 bg-white/5 rounded-lg border border-white/10" />
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-300 max-w-[200px] truncate">{p.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-300">
                    €{p.buy_price.toFixed(2)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-300">
                    €{p.sell_price_suggested.toFixed(2)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded-full text-xs font-semibold',
                        p.margin_percent >= 60
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : p.margin_percent >= 40
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300',
                      )}
                    >
                      {p.margin_percent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-300">
                    {p.delivery_days_nl}d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
