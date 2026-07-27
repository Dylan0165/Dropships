import { useEffect, useState } from 'react'
import { Store, Plus, Trash2, Eye, EyeOff, ExternalLink, RefreshCw, GripVertical } from 'lucide-react'
import clsx from 'clsx'

// Beheer van het publieke kopers-dashboard op clynado.com. De etalage zelf is
// voor iedereen zichtbaar; dit scherm zit achter de 2FA-gate en is de enige plek
// waar de "Uitgelicht"-strip aangepast wordt.

interface Deal {
  id: number
  storeId: string
  title: string
  subtitle: string
  label: string
  url: string
  active: boolean
  sortOrder: number
  startsAt: string | null
  endsAt: string | null
}

interface StoreRef { storeId: string; brand: string; url: string }

const EMPTY: Omit<Deal, 'id'> = {
  storeId: '', title: '', subtitle: '', label: '', url: '',
  active: true, sortOrder: 0, startsAt: null, endsAt: null,
}

export function MarketplaceView() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [stores, setStores] = useState<StoreRef[]>([])
  const [draft, setDraft] = useState<Omit<Deal, 'id'> & { id?: number }>({ ...EMPTY })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/deals')
      const j = await r.json()
      setDeals(j.deals ?? [])
      setStores(j.stores ?? [])
    } catch {
      setMsg({ text: 'Ophalen mislukt', ok: false })
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000) }

  const save = async () => {
    if (!draft.title.trim()) { flash('Titel is verplicht', false); return }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/deals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'mislukt')
      setDraft({ ...EMPTY })
      await load()
      flash(draft.id ? 'Deal bijgewerkt' : 'Deal toegevoegd')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Opslaan mislukt', false)
    } finally { setBusy(false) }
  }

  const toggle = async (d: Deal) => {
    await fetch('/api/admin/deals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...d, active: !d.active }),
    })
    await load()
  }

  const remove = async (d: Deal) => {
    if (!confirm(`"${d.title}" verwijderen van het kopers-dashboard?`)) return
    await fetch(`/api/admin/deals/${d.id}`, { method: 'DELETE' })
    await load()
    flash('Deal verwijderd')
  }

  const field = 'w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/25'
  const label = 'block text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5'

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2.5">
              <Store size={19} className="text-zinc-400" /> Kopers-dashboard
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl">
              De publieke etalage op clynado.com toont automatisch elke live store. Hier beheer je
              alleen de <span className="text-zinc-300">Uitgelicht</span>-strip bovenaan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/market" target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-3 py-2 transition-colors">
              <ExternalLink size={13} /> Bekijk etalage
            </a>
            <button onClick={() => void load()}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-3 py-2 transition-colors">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Ververs
            </button>
          </div>
        </header>

        {msg && (
          <div className={clsx('mb-5 rounded-lg px-4 py-2.5 text-sm border',
            msg.ok ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                   : 'bg-red-500/10 border-red-500/25 text-red-300')}>
            {msg.text}
          </div>
        )}

        {/* ── Formulier ── */}
        <section className="bg-white/[0.02] border border-white/[0.07] rounded-xl p-5 mb-8">
          <h2 className="text-sm font-medium mb-4">{draft.id ? 'Deal bewerken' : 'Nieuwe deal'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Titel</label>
              <input className={field} value={draft.title} placeholder="Winterkorting op alle matten"
                onChange={e => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div>
              <label className={label}>Ondertitel</label>
              <input className={field} value={draft.subtitle} placeholder="Deze week, zolang de voorraad strekt"
                onChange={e => setDraft({ ...draft, subtitle: e.target.value })} />
            </div>
            <div>
              <label className={label}>Labeltekst</label>
              <input className={field} value={draft.label} placeholder="-20%"
                onChange={e => setDraft({ ...draft, label: e.target.value })} />
            </div>
            <div>
              <label className={label}>Winkel</label>
              <select className={field} value={draft.storeId}
                onChange={e => setDraft({ ...draft, storeId: e.target.value })}>
                <option value="">— geen specifieke winkel —</option>
                {stores.map(s => <option key={s.storeId} value={s.storeId}>{s.brand}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={label}>Link (leeg = link naar de gekozen winkel)</label>
              <input className={field} value={draft.url} placeholder="https://…"
                onChange={e => setDraft({ ...draft, url: e.target.value })} />
            </div>
            <div>
              <label className={label}>Zichtbaar vanaf (optioneel)</label>
              <input type="date" className={field} value={draft.startsAt?.slice(0, 10) ?? ''}
                onChange={e => setDraft({ ...draft, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </div>
            <div>
              <label className={label}>Zichtbaar tot (optioneel)</label>
              <input type="date" className={field} value={draft.endsAt?.slice(0, 10) ?? ''}
                onChange={e => setDraft({ ...draft, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button onClick={() => void save()} disabled={busy}
              className="flex items-center gap-1.5 bg-white text-black text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 hover:bg-zinc-200 transition-colors">
              <Plus size={15} /> {draft.id ? 'Wijzigingen opslaan' : 'Toevoegen'}
            </button>
            {draft.id && (
              <button onClick={() => setDraft({ ...EMPTY })}
                className="text-sm text-zinc-400 hover:text-white transition-colors">Annuleren</button>
            )}
          </div>
        </section>

        {/* ── Lijst ── */}
        <section>
          <h2 className="text-sm font-medium mb-3">
            Deals <span className="text-zinc-600">({deals.length})</span>
          </h2>
          {loading ? (
            <p className="text-sm text-zinc-500">Laden…</p>
          ) : deals.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-xl p-10 text-center text-sm text-zinc-500">
              Nog geen deals. De etalage toont dan alleen de winkels — dat is een prima uitgangssituatie.
            </div>
          ) : (
            <div className="space-y-2">
              {deals.map(d => (
                <div key={d.id}
                  className={clsx('flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors',
                    d.active ? 'bg-white/[0.02] border-white/[0.07]' : 'bg-transparent border-white/[0.04] opacity-55')}>
                  <GripVertical size={15} className="text-zinc-700 flex-shrink-0" />
                  {d.label && (
                    <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-300 rounded px-1.5 py-0.5">
                      {d.label}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    {d.subtitle && <p className="text-xs text-zinc-500 truncate">{d.subtitle}</p>}
                  </div>
                  <span className="text-xs text-zinc-600 flex-shrink-0 hidden sm:block">
                    {stores.find(s => s.storeId === d.storeId)?.brand ?? 'geen winkel'}
                  </span>
                  <button onClick={() => void toggle(d)} title={d.active ? 'Verbergen' : 'Tonen'}
                    className="text-zinc-500 hover:text-white p-1.5 transition-colors">
                    {d.active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button onClick={() => setDraft({ ...d })} title="Bewerken"
                    className="text-xs text-zinc-500 hover:text-white px-2 transition-colors">Bewerk</button>
                  <button onClick={() => void remove(d)} title="Verwijderen"
                    className="text-zinc-600 hover:text-red-400 p-1.5 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
