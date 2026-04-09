import { useEffect, useState, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Users, ShoppingCart, RefreshCw,
  BarChart2, Globe, Euro, Percent, ArrowUpRight, ArrowDownRight,
  Receipt, ChevronUp, ChevronDown,
} from 'lucide-react'
import clsx from 'clsx'
import * as api from '@/lib/api'
import type { DashboardData, DashboardStoreRow } from '@/lib/api'

// ─── Formatters ──────────────────────────────────────────────────────────────
const eur = (n: number) => `€${n.toFixed(2)}`
const pct = (n: number) => `${n.toFixed(2)}%`
const num = (n: number) => n.toLocaleString('nl-NL')
const fmtDate = (d: string) => d.slice(5) // MM-DD

// ─── KPI Card ────────────────────────────────────────────────────────────────
interface KpiProps {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  color: string   // tailwind text color class
  border: string  // tailwind border color class
}

function KpiCard({ label, value, sub, icon, trend, color, border }: KpiProps) {
  return (
    <div className={clsx('bg-[#0d1117] rounded-xl border p-4 flex flex-col gap-3', border)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium tracking-wide uppercase">{label}</span>
        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04]', color)}>
          {icon}
        </div>
      </div>
      <div>
        <div className={clsx('text-2xl font-bold tabular-nums tracking-tight', color)}>{value}</div>
        {sub && (
          <div className="flex items-center gap-1 mt-1">
            {trend === 'up' && <ArrowUpRight size={11} className="text-emerald-400" />}
            {trend === 'down' && <ArrowDownRight size={11} className="text-red-400" />}
            <span className="text-xs text-slate-500">{sub}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Revenue Bar Chart ────────────────────────────────────────────────────────
function RevenueChart({ days }: { days: { date: string; revenue: number; costs: number }[] }) {
  const maxVal = Math.max(...days.flatMap(d => [d.revenue, d.costs]), 1)

  return (
    <div className="bg-[#0d1117] rounded-xl border border-white/[0.07] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Omzet vs Kosten</h3>
          <p className="text-xs text-slate-500 mt-0.5">Afgelopen 14 dagen</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70 inline-block" />
            Omzet
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500/60 inline-block" />
            Kosten
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1 h-36">
        {days.map((d) => {
          const revH = Math.round((d.revenue / maxVal) * 100)
          const cosH = Math.round((d.costs / maxVal) * 100)
          return (
            <div
              key={d.date}
              className="flex-1 flex items-end gap-px group cursor-default"
              title={`${fmtDate(d.date)}\nOmzet: ${eur(d.revenue)}\nKosten: ${eur(d.costs)}\nWinst: ${eur(d.revenue - d.costs)}`}
            >
              <div
                className="flex-1 bg-emerald-500/50 group-hover:bg-emerald-500/75 rounded-t-[2px] transition-colors"
                style={{ height: `${revH}%`, minHeight: revH > 0 ? 2 : 0 }}
              />
              <div
                className="flex-1 bg-red-500/45 group-hover:bg-red-500/70 rounded-t-[2px] transition-colors"
                style={{ height: `${cosH}%`, minHeight: cosH > 0 ? 2 : 0 }}
              />
            </div>
          )
        })}
      </div>

      {/* X-axis labels — show every 2nd */}
      <div className="flex gap-1 mt-1.5">
        {days.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {i % 2 === 0 && (
              <span className="text-[9px] text-slate-600">{fmtDate(d.date).replace('-', '/')}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sort state ───────────────────────────────────────────────────────────────
type SortKey = keyof Pick<DashboardStoreRow, 'revenue' | 'costs' | 'profit' | 'taxEstimate' | 'visitors' | 'orders' | 'conversionRate' | 'roas'>

// ─── Stores Table ─────────────────────────────────────────────────────────────
function StoresTable({ stores }: { stores: DashboardStoreRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const sorted = useMemo(() => {
    return [...stores].sort((a, b) =>
      sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey],
    )
  }, [stores, sortKey, sortDir])

  const toggle = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (k !== sortKey) return <span className="opacity-0 group-hover:opacity-30 text-slate-500"><ChevronDown size={11} /></span>
    return sortDir === 'desc' ? <ChevronDown size={11} className="text-sky-400" /> : <ChevronUp size={11} className="text-sky-400" />
  }

  const statusBadge = (s: string) => {
    const cfg: Record<string, string> = {
      live:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      building: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      paused:   'bg-slate-500/10 text-slate-400 border-slate-500/20',
      killed:   'bg-red-500/10 text-red-400 border-red-500/20',
    }
    return cfg[s] ?? cfg.paused
  }

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none group hover:text-slate-300 transition-colors whitespace-nowrap"
      onClick={() => toggle(k)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon k={k} />
      </span>
    </th>
  )

  if (stores.length === 0) {
    return (
      <div className="bg-[#0d1117] rounded-xl border border-white/[0.07] p-8 flex flex-col items-center gap-2 text-slate-600">
        <Globe size={28} className="opacity-30" />
        <p className="text-sm">Geen stores beschikbaar</p>
      </div>
    )
  }

  return (
    <div className="bg-[#0d1117] rounded-xl border border-white/[0.07] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-slate-200">Stores Overzicht</h3>
        <p className="text-xs text-slate-500 mt-0.5">{stores.length} store{stores.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Store</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <Th label="Omzet" k="revenue" />
              <Th label="Kosten" k="costs" />
              <Th label="Winst" k="profit" />
              <Th label="BTW (21%)" k="taxEstimate" />
              <Th label="Bezoekers" k="visitors" />
              <Th label="Orders" k="orders" />
              <Th label="Conv." k="conversionRate" />
              <Th label="ROAS" k="roas" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {sorted.map((s) => (
              <tr key={s.storeId} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-3">
                  <div className="text-slate-200 text-xs font-medium">{s.subdomein}</div>
                  <div className="text-slate-600 text-[10px]">{s.niche}</div>
                </td>
                <td className="px-3 py-3">
                  <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize', statusBadge(s.status))}>
                    {s.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-emerald-400 font-mono text-xs">{eur(s.revenue)}</td>
                <td className="px-3 py-3 text-red-400 font-mono text-xs">{eur(s.costs)}</td>
                <td className={clsx('px-3 py-3 font-mono text-xs font-semibold', s.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {s.profit >= 0 ? '+' : ''}{eur(s.profit)}
                </td>
                <td className="px-3 py-3 text-amber-400 font-mono text-xs">{eur(s.taxEstimate)}</td>
                <td className="px-3 py-3 text-sky-400 font-mono text-xs">{num(s.visitors)}</td>
                <td className="px-3 py-3 text-blue-400 font-mono text-xs">{num(s.orders)}</td>
                <td className="px-3 py-3 text-slate-300 font-mono text-xs">{pct(s.conversionRate)}</td>
                <td className="px-3 py-3">
                  <span className={clsx(
                    'font-mono text-xs font-semibold',
                    s.roas >= 3 ? 'text-emerald-400' : s.roas >= 2 ? 'text-sky-400' : 'text-red-400',
                  )}>
                    {s.roas.toFixed(2)}x
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const d = await api.getDashboard()
      setData(d)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!data) return null
    if (selectedStore === 'all') return data
    const store = data.stores.find(s => s.storeId === selectedStore)
    if (!store) return data
    return {
      ...data,
      summary: {
        revenueTotal: store.revenue,
        costsTotal: store.costs,
        profitNet: store.profit,
        taxEstimate: store.taxEstimate,
        visitorsTotal: store.visitors,
        ordersTotal: store.orders,
        conversionRate: store.conversionRate,
        avgOrderValue: store.avgOrderValue,
        roasAvg: store.roas,
      },
      stores: [store],
    }
  }, [data, selectedStore])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-slate-600">
          <BarChart2 size={16} className="animate-pulse" />
          <span className="text-sm">Dashboard laden...</span>
        </div>
      </div>
    )
  }

  if (!filtered) return null

  const s = filtered.summary
  const profit = s.profitNet
  const roasColor = s.roasAvg >= 3 ? 'text-emerald-400' : s.roasAvg >= 2 ? 'text-sky-400' : 'text-red-400'
  const roasBorder = s.roasAvg >= 3 ? 'border-emerald-500/15' : s.roasAvg >= 2 ? 'border-sky-500/15' : 'border-red-500/15'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">Dashboard</h2>
            <p className="text-xs text-slate-500 mt-0.5">Financieel overzicht & analytics</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Store filter */}
            <select
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
              className="text-xs bg-[#0d1117] border border-white/[0.08] text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 cursor-pointer"
            >
              <option value="all">Alle stores ({data?.stores.length ?? 0})</option>
              {data?.stores.map(st => (
                <option key={st.storeId} value={st.storeId}>{st.subdomein} — {st.niche}</option>
              ))}
            </select>

            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] px-3 py-2 rounded-lg transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Vernieuwen
            </button>
          </div>
        </div>

        {/* KPI Grid — Row 1: Financial */}
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-2.5">Financieel</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Totale Omzet"
              value={eur(s.revenueTotal)}
              sub="Bruto inkomsten"
              icon={<TrendingUp size={14} />}
              trend="up"
              color="text-emerald-400"
              border="border-emerald-500/15"
            />
            <KpiCard
              label="Totale Kosten"
              value={eur(s.costsTotal)}
              sub="AI & advertentie"
              icon={<TrendingDown size={14} />}
              trend="down"
              color="text-red-400"
              border="border-red-500/15"
            />
            <KpiCard
              label="Nettowinst"
              value={eur(profit)}
              sub={profit >= 0 ? 'Positieve marge' : 'Verliesgevend'}
              icon={<Euro size={14} />}
              trend={profit >= 0 ? 'up' : 'down'}
              color={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
              border={profit >= 0 ? 'border-emerald-500/15' : 'border-red-500/15'}
            />
            <KpiCard
              label="BTW Schatting (21%)"
              value={eur(s.taxEstimate)}
              sub="Op nettowinst"
              icon={<Receipt size={14} />}
              color="text-amber-400"
              border="border-amber-500/15"
            />
          </div>
        </div>

        {/* KPI Grid — Row 2: Performance */}
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-2.5">Performance</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard
              label="Bezoekers"
              value={num(s.visitorsTotal)}
              sub="Website traffic"
              icon={<Users size={14} />}
              color="text-sky-400"
              border="border-sky-500/15"
            />
            <KpiCard
              label="Orders"
              value={num(s.ordersTotal)}
              sub="Totaal aankopen"
              icon={<ShoppingCart size={14} />}
              color="text-blue-400"
              border="border-blue-500/15"
            />
            <KpiCard
              label="Conversie"
              value={pct(s.conversionRate)}
              sub="Bezoeker → koper"
              icon={<Percent size={14} />}
              color="text-slate-300"
              border="border-slate-500/15"
            />
            <KpiCard
              label="Gem. Orderwaarde"
              value={eur(s.avgOrderValue)}
              sub="Per aankoop"
              icon={<Euro size={14} />}
              color="text-teal-400"
              border="border-teal-500/15"
            />
            <KpiCard
              label="ROAS"
              value={`${s.roasAvg.toFixed(2)}x`}
              sub="Return on Ad Spend"
              icon={<BarChart2 size={14} />}
              color={roasColor}
              border={roasBorder}
            />
          </div>
        </div>

        {/* Revenue Chart */}
        {selectedStore === 'all' && <RevenueChart days={filtered.revenueByDay} />}

        {/* Stores Table */}
        <StoresTable stores={filtered.stores} />

        {/* BTW breakdown note */}
        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3">
          <Receipt size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="text-amber-400 font-medium">BTW indicatie: </span>
            Schatting op basis van 21% over nettowinst. Raadpleeg een belastingadviseur voor exacte aangiften. Kosten zijn deels aftrekbaar als bedrijfskosten.
          </p>
        </div>

      </div>
    </div>
  )
}
