import { useEffect, useState, Fragment } from 'react'
import { RefreshCw, Download, Search, DollarSign, Activity, CheckCircle, XCircle, Clock } from 'lucide-react'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentExecution {
  id: string
  run_id: string
  agent_name: string
  stage: string
  status: 'success' | 'failed' | 'running' | 'skipped'
  input_json?: string
  output_json?: string
  error_message?: string
  cost_usd?: number
  tokens_in?: number
  tokens_out?: number
  duration_ms?: number
  retry_count?: number
  started_at: string
  finished_at?: string
}

interface CostByRun {
  run_id: string
  total_cost_usd: number
  total_tokens_in: number
  total_tokens_out: number
  calls: number
  started_at: string
}

interface CostByAgent {
  agent_name: string
  total_cost_usd: number
  avg_duration_ms: number
  calls: number
  successes: number
  failures: number
}

type Tab = 'logs' | 'costs'

// ── Main component ────────────────────────────────────────────────────────────

export function ObservabilityView() {
  const [tab, setTab] = useState<Tab>('logs')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.07]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">Observability</h1>
            <p className="text-xs text-zinc-600 mt-0.5">Agent logs &amp; cost tracking</p>
          </div>
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
            {(['logs', 'costs'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                  tab === t ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'logs'  && <LogsTab />}
      {tab === 'costs' && <CostsTab />}
    </div>
  )
}

// ── Logs tab ──────────────────────────────────────────────────────────────────

function LogsTab() {
  const [rows, setRows] = useState<AgentExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (statusFilter) params.set('status', statusFilter)
      if (search.startsWith('run:')) params.set('run_id', search.slice(4).trim())
      else if (search) params.set('agent', search.trim())
      const res = await fetch(`/api/obs/logs?${params}`)
      setRows(await res.json() as AgentExecution[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [statusFilter])

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `logs-${Date.now()}.json` })
    a.click()
  }

  const filtered = search
    ? rows.filter(r =>
        r.agent_name.toLowerCase().includes(search.toLowerCase()) ||
        r.run_id.startsWith(search.replace('run:', '').trim()) ||
        r.stage?.toLowerCase().includes(search.toLowerCase()),
      )
    : rows

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchLogs()}
            placeholder="Agent naam, run:abc123, of stage..."
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-white/[0.15]"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['', 'success', 'failed', 'running'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-2 py-1.5 rounded-lg text-[11px] border transition-all capitalize',
                statusFilter === s
                  ? 'bg-white/[0.1] border-white/[0.15] text-white'
                  : 'border-white/[0.06] text-zinc-600 hover:text-zinc-300',
              )}
            >
              {s || 'Alles'}
            </button>
          ))}
        </div>
        <button onClick={fetchLogs} disabled={loading} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 p-1.5 rounded-lg hover:bg-white/[0.04]">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={exportJson} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white border border-white/[0.08] px-2.5 py-1.5 rounded-lg transition-all">
          <Download size={12} />
          JSON
        </button>
      </div>

      {/* Log rows */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px]">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#0c0c0c] border-b border-white/[0.05] text-[10px] text-zinc-600 uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 w-[120px]">Agent</th>
              <th className="text-left px-3 py-2 w-[80px]">Status</th>
              <th className="text-left px-3 py-2 w-[120px]">Run ID</th>
              <th className="text-right px-3 py-2 w-[70px]">Tokens</th>
              <th className="text-right px-3 py-2 w-[70px]">Cost</th>
              <th className="text-right px-3 py-2 w-[70px]">Duur</th>
              <th className="text-left px-3 py-2">Gestart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filtered.map(row => (
              <Fragment key={row.id}>
                <tr
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2 text-zinc-300 truncate max-w-[120px]">{row.agent_name}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-zinc-600 truncate">{row.run_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-right text-zinc-600">
                    {row.tokens_in != null ? `${((row.tokens_in ?? 0) + (row.tokens_out ?? 0)).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-400">
                    {row.cost_usd != null ? `$${row.cost_usd.toFixed(4)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600">
                    {row.duration_ms != null ? formatDuration(row.duration_ms) : '—'}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {new Date(row.started_at).toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                </tr>
                {expanded === row.id && (
                  <tr className="bg-white/[0.015]">
                    <td colSpan={7} className="px-4 py-3 space-y-2">
                      {row.error_message && (
                        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2.5">
                          <p className="text-red-400 text-[11px] font-medium mb-1">Fout</p>
                          <p className="text-red-300/80 text-[11px] break-all whitespace-pre-wrap">{row.error_message}</p>
                        </div>
                      )}
                      {row.output_json && (
                        <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-2.5 max-h-48 overflow-y-auto">
                          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Output</p>
                          <pre className="text-zinc-400 text-[10px] whitespace-pre-wrap break-all">{
                            (() => { try { return JSON.stringify(JSON.parse(row.output_json!), null, 2) } catch { return row.output_json } })()
                          }</pre>
                        </div>
                      )}
                      <div className="flex gap-4 text-[10px] text-zinc-600">
                        <span>Stage: <span className="text-zinc-400">{row.stage}</span></span>
                        {row.retry_count != null && row.retry_count > 0 && <span>Retries: <span className="text-amber-400">{row.retry_count}</span></span>}
                        <span>Run: <span className="text-zinc-400">{row.run_id}</span></span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !loading && (
          <div className="flex items-center justify-center py-20 text-zinc-700 text-sm">
            Geen logs gevonden
          </div>
        )}
      </div>
    </div>
  )
}

// ── Costs tab ─────────────────────────────────────────────────────────────────

function CostsTab() {
  const [data, setData] = useState<{ byRun: CostByRun[]; byAgent: CostByAgent[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/obs/costs')
      setData(await res.json() as { byRun: CostByRun[]; byAgent: CostByAgent[] })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch_() }, [])

  const totalCost = data?.byRun.reduce((a, r) => a + (r.total_cost_usd ?? 0), 0) ?? 0
  const totalCalls = data?.byRun.reduce((a, r) => a + r.calls, 0) ?? 0

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Totale kosten', value: `$${totalCost.toFixed(4)}`, icon: <DollarSign size={14} /> },
          { label: 'API calls',     value: totalCalls.toString(),       icon: <Activity size={14} /> },
          { label: 'Runs',          value: (data?.byRun.length ?? 0).toString(), icon: <Clock size={14} /> },
        ].map(c => (
          <div key={c.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-2">{c.icon}<span className="text-[10px] uppercase tracking-wider">{c.label}</span></div>
            <div className="text-lg font-bold text-white font-mono">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Cost per agent */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Kosten per agent</h2>
          <button onClick={fetch_} disabled={loading} className="text-zinc-600 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-white/[0.04]">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="space-y-2">
          {data?.byAgent.map(agent => {
            const maxCost = Math.max(...(data?.byAgent.map(a => a.total_cost_usd ?? 0) ?? [1]))
            const pct = maxCost > 0 ? ((agent.total_cost_usd ?? 0) / maxCost) * 100 : 0
            const successRate = agent.calls > 0 ? (agent.successes / agent.calls) * 100 : 0
            return (
              <div key={agent.agent_name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-mono">{agent.agent_name}</span>
                  <div className="flex items-center gap-3 text-zinc-600">
                    <span>{agent.calls}× calls</span>
                    <span className={clsx('font-medium', successRate >= 80 ? 'text-emerald-400' : successRate >= 50 ? 'text-amber-400' : 'text-red-400')}>
                      {successRate.toFixed(0)}% ok
                    </span>
                    <span className="text-zinc-400 font-mono">${(agent.total_cost_usd ?? 0).toFixed(4)}</span>
                  </div>
                </div>
                <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
          {(!data?.byAgent.length) && !loading && (
            <p className="text-zinc-700 text-xs text-center py-4">Nog geen agent executions gelogd</p>
          )}
        </div>
      </div>

      {/* Cost per run */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Kosten per run</h2>
        <div className="space-y-1 font-mono text-[11px]">
          {data?.byRun.map(run => (
            <div key={run.run_id} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04]">
              <span className="text-zinc-600 flex-shrink-0">{new Date(run.started_at).toLocaleDateString('nl', { day: 'numeric', month: 'short' })}</span>
              <span className="text-zinc-400 flex-1 truncate">{run.run_id.slice(0, 16)}</span>
              <span className="text-zinc-600 flex-shrink-0">{run.calls} calls</span>
              <span className="text-zinc-300 flex-shrink-0">${(run.total_cost_usd ?? 0).toFixed(4)}</span>
            </div>
          ))}
          {(!data?.byRun.length) && !loading && (
            <p className="text-zinc-700 text-xs text-center py-4">Geen run data beschikbaar</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentExecution['status'] }) {
  if (status === 'success') return <span className="flex items-center gap-1 text-emerald-400"><CheckCircle size={11} />ok</span>
  if (status === 'failed')  return <span className="flex items-center gap-1 text-red-400"><XCircle size={11} />fail</span>
  if (status === 'running') return <span className="flex items-center gap-1 text-amber-400"><Activity size={11} className="animate-pulse" />run</span>
  return <span className="text-zinc-600">skip</span>
}

function formatDuration(ms: number): string {
  if (ms < 1000)  return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}
