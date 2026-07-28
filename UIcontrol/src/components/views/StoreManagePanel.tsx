'use client'
/**
 * Beheer-paneel binnen de StoreEditor.
 *
 * Drie dingen die je aan een live winkel wilt kunnen doen zonder de pipeline
 * opnieuw te draaien: tekst laten herschrijven, prijzen in bulk aanpassen, en
 * producten bijzetten uit CJ.
 *
 * Alles schrijft overrides weg in de database; live gaat het pas na een rebuild
 * via het Deploy-tabblad. Bewust twee stappen — zo kun je meerdere bewerkingen
 * stapelen voor één build van 2-3 minuten.
 */
import { useState } from 'react'

interface Diff { id: string; field: string; from: string; to: string }
interface PriceRow { id: string; title: string; from: number; to: number }
interface Suggestion { productId: string; title: string; image: string; costPrice: number; warehouse?: string }

const card: React.CSSProperties = { background: '#141414', border: '1px solid #242424', borderRadius: 10, padding: '1.1rem' }
const heading: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 600, margin: '0 0 0.2rem' }
const sub: React.CSSProperties = { fontSize: '0.72rem', color: '#666', margin: '0 0 0.9rem', lineHeight: 1.55 }
const btn: React.CSSProperties = { background: '#fff', color: '#000', border: 'none', borderRadius: 6, padding: '0.5rem 0.9rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: '0.68rem', color: '#555', marginBottom: '0.3rem' }

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '0.55rem 0.7rem', color: '#fff', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
  )
}

export default function StoreManagePanel({ storeId, onChanged }: { storeId: string; onChanged: () => void }) {
  const [instruction, setInstruction] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  const [aiError, setAiError] = useState(false)
  const [diff, setDiff] = useState<Diff[]>([])

  const [percent, setPercent] = useState('10')
  const [roundTo, setRoundTo] = useState('0.95')
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceMsg, setPriceMsg] = useState<string | null>(null)
  const [priceRows, setPriceRows] = useState<PriceRow[]>([])

  const [query, setQuery] = useState('')
  const [sugBusy, setSugBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [addMsg, setAddMsg] = useState<string | null>(null)

  const runAi = async () => {
    if (!instruction.trim()) return
    setAiBusy(true); setAiMsg(null); setAiError(false); setDiff([])
    try {
      const r = await fetch(`/api/stores/${storeId}/ai-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      })
      const d = await r.json() as { error?: string; summary?: string; diff?: Diff[] }
      if (!r.ok || d.error) { setAiError(true); setAiMsg(d.error ?? 'Bewerking mislukt'); return }
      setAiMsg(d.summary ?? 'Klaar')
      setDiff(d.diff ?? [])
      if (!d.diff?.length) setAiMsg((d.summary ?? '') + ' (geen wijzigingen toegepast)')
      onChanged()
    } catch (e) {
      setAiError(true)
      setAiMsg(e instanceof Error ? e.message : 'Netwerkfout')
    } finally { setAiBusy(false) }
  }

  const runPrices = async () => {
    setPriceBusy(true); setPriceRows([]); setPriceMsg(null)
    try {
      const body: Record<string, number> = {}
      if (percent.trim() && !Number.isNaN(Number(percent))) body.percent = Number(percent)
      if (roundTo.trim() && !Number.isNaN(Number(roundTo))) body.roundTo = Number(roundTo)
      const r = await fetch(`/api/stores/${storeId}/prices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json() as { error?: string; changes?: PriceRow[] }
      if (!r.ok || d.error) { setPriceMsg(d.error ?? 'Prijswijziging mislukt'); return }
      setPriceRows(d.changes ?? [])
      setPriceMsg(d.changes?.length ? null : 'Geen enkele prijs veranderde hierdoor.')
      onChanged()
    } catch (e) {
      setPriceMsg(e instanceof Error ? e.message : 'Netwerkfout')
    } finally { setPriceBusy(false) }
  }

  const search = async () => {
    setSugBusy(true); setSuggestions([]); setPicked(new Set()); setAddMsg(null)
    try {
      const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
      const r = await fetch(`/api/stores/${storeId}/product-suggestions${qs}`)
      const d = await r.json() as { error?: string; results?: Suggestion[] }
      if (!r.ok || d.error) { setAddMsg(d.error ?? 'Zoeken mislukt'); return }
      setSuggestions(d.results ?? [])
      if (!d.results?.length) setAddMsg('Geen producten gevonden voor deze zoekterm.')
    } catch (e) {
      setAddMsg(e instanceof Error ? e.message : 'Netwerkfout')
    } finally { setSugBusy(false) }
  }

  const togglePick = (id: string) => setPicked(p => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const addPicked = async () => {
    if (!picked.size) return
    setSugBusy(true)
    try {
      const r = await fetch(`/api/stores/${storeId}/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierProductIds: [...picked] }),
      })
      const d = await r.json() as {
        error?: string; total?: number
        added?: Array<{ title: string }>; skipped?: Array<{ id: string; reason: string }>
      }
      if (!r.ok || d.error) { setAddMsg(d.error ?? 'Toevoegen mislukt'); return }
      const skipNote = d.skipped?.length ? `, ${d.skipped.length} overgeslagen (${d.skipped[0].reason})` : ''
      setAddMsg(`${d.added?.length ?? 0} toegevoegd${skipNote} — deze winkel heeft nu ${d.total} producten`)
      setPicked(new Set()); setSuggestions([])
      onChanged()
    } catch (e) {
      setAddMsg(e instanceof Error ? e.message : 'Netwerkfout')
    } finally { setSugBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── AI-bewerking ── */}
      <section style={card}>
        <p style={heading}>Laat de AI iets aanpassen</p>
        <p style={sub}>
          Bijvoorbeeld &ldquo;herschrijf de hero-tekst korter&rdquo; of &ldquo;maak de beschrijvingen zakelijker&rdquo;.
          Producten toevoegen of verwijderen kan hier niet — alleen bestaande teksten en prijzen.
        </p>
        <textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={2}
          placeholder="Wat moet er veranderen?"
          style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '0.6rem 0.75rem', color: '#fff', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '0.7rem' }} />
        <button onClick={() => void runAi()} disabled={aiBusy || !instruction.trim()}
          style={{ ...btn, opacity: aiBusy || !instruction.trim() ? 0.5 : 1 }}>
          {aiBusy ? 'Bezig…' : 'Toepassen'}
        </button>
        {aiMsg && <p style={{ fontSize: '0.76rem', color: aiError ? '#ffb4bc' : '#8ff0b4', margin: '0.7rem 0 0' }}>{aiMsg}</p>}
        {diff.length > 0 && (
          <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {diff.map((d, i) => (
              <div key={i} style={{ fontSize: '0.72rem', color: '#888', borderLeft: '2px solid #333', paddingLeft: '0.6rem' }}>
                <b style={{ color: '#aaa' }}>{d.id}.{d.field}</b>
                <div style={{ textDecoration: 'line-through', opacity: 0.55 }}>{d.from.slice(0, 110)}</div>
                <div style={{ color: '#cfcfcf' }}>{d.to.slice(0, 110)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Bulk-prijzen ── */}
      <section style={card}>
        <p style={heading}>Prijzen in bulk</p>
        <p style={sub}>Rekent op de huidige prijzen. Er wordt niets onder EUR 1 gezet.</p>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 110px' }}>
            <label style={fieldLabel}>Percentage</label>
            <TextInput value={percent} onChange={setPercent} placeholder="10" />
          </div>
          <div style={{ flex: '1 1 110px' }}>
            <label style={fieldLabel}>Afronden op</label>
            <TextInput value={roundTo} onChange={setRoundTo} placeholder="0.95" />
          </div>
          <button onClick={() => void runPrices()} disabled={priceBusy} style={{ ...btn, opacity: priceBusy ? 0.5 : 1 }}>
            {priceBusy ? 'Bezig…' : 'Herbereken'}
          </button>
        </div>
        {priceMsg && <p style={{ fontSize: '0.74rem', color: '#999', margin: '0.7rem 0 0' }}>{priceMsg}</p>}
        {priceRows.length > 0 && (
          <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {priceRows.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.75rem', color: '#999' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ opacity: 0.5 }}>&euro;{r.from.toFixed(2)}</span>
                  {' → '}
                  <b style={{ color: '#fff' }}>&euro;{r.to.toFixed(2)}</b>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Producten bijzetten ── */}
      <section style={card}>
        <p style={heading}>Producten toevoegen uit CJ</p>
        <p style={sub}>Prijs en supplier-gegevens komen van CJ, niet uit dit scherm — dat is wat er straks besteld wordt.</p>
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
          <div style={{ flex: 1 }}>
            <TextInput value={query} onChange={setQuery} placeholder="Zoekterm (leeg = de niche van deze winkel)" />
          </div>
          <button onClick={() => void search()} disabled={sugBusy} style={{ ...btn, opacity: sugBusy ? 0.5 : 1 }}>
            {sugBusy ? '…' : 'Zoek'}
          </button>
        </div>
        {suggestions.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 280, overflow: 'auto', marginBottom: '0.8rem' }}>
              {suggestions.map(s => {
                const on = picked.has(s.productId)
                return (
                  <button key={s.productId} type="button" onClick={() => togglePick(s.productId)}
                    style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', textAlign: 'left', background: on ? '#1e2a1e' : '#1a1a1a', border: `1px solid ${on ? '#3d6b3d' : '#2a2a2a'}`, borderRadius: 6, padding: '0.5rem', cursor: 'pointer' }}>
                    {s.image
                      ? <img src={s.image} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, background: '#222' }} />
                      : <span style={{ width: 36, height: 36, borderRadius: 4, background: '#222', flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.76rem', color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                    <span style={{ fontSize: '0.72rem', color: '#777', whiteSpace: 'nowrap' }}>
                      {s.warehouse ?? '—'} · ${Number(s.costPrice ?? 0).toFixed(2)}
                    </span>
                  </button>
                )
              })}
            </div>
            <button onClick={() => void addPicked()} disabled={!picked.size || sugBusy}
              style={{ ...btn, opacity: !picked.size || sugBusy ? 0.5 : 1 }}>
              {picked.size ? `${picked.size} toevoegen` : 'Selecteer producten'}
            </button>
          </>
        )}
        {addMsg && <p style={{ fontSize: '0.76rem', color: '#8ff0b4', margin: '0.7rem 0 0' }}>{addMsg}</p>}
      </section>

      <p style={{ fontSize: '0.72rem', color: '#666', lineHeight: 1.6, margin: 0 }}>
        Wijzigingen staan nu als overrides in de database; de originele pipeline-output blijft bewaard.
        Ga naar <b style={{ color: '#999' }}>Deploy</b> om de winkel opnieuw te bouwen en live te zetten.
      </p>
    </div>
  )
}
