'use client'
/**
 * StoreEditor — Slide-over CMS panel voor het aanpassen van een store.
 * Tabs: Content | Producten | Design | Deploy
 */
import { useState, useEffect } from 'react'
import { X, Save, RefreshCw, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react'

const STORE_HOST = (import.meta.env.VITE_STORE_SERVER_HOST as string) ?? '192.168.121.11'

interface Product {
  id: string
  title: string
  image: string
  price: number
  compareAtPrice?: number
  badge?: string
}

interface StoreData {
  brand_name: string
  niche: string
  slogan: string
  primary_color?: string
  products: Product[]
}

interface CmsResponse {
  merged: StoreData
  base: Partial<StoreData>
  overrides: Partial<StoreData>
  hasStoreData: boolean
}

interface StoreEditorProps {
  storeId: string
  subdomain: string
  niche: string
  onClose: () => void
  onSaved?: () => void
}

const LAYOUT_NAMES = ['NOIR — Dark editorial', 'BLANC — White luxury', 'BOLT — Brand color bold', 'DUSK — Warm organic', 'GRID — Tech dark']

export default function StoreEditor({ storeId, subdomain, niche, onClose, onSaved }: StoreEditorProps) {
  const [tab, setTab] = useState<'content' | 'products' | 'design' | 'deploy'>('content')
  const [data, setData] = useState<StoreData | null>(null)
  const [overrides, setOverrides] = useState<Partial<StoreData & { layout?: number }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [hasStoreData, setHasStoreData] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetch(`/api/stores/${storeId}/cms-data`)
      .then(r => r.json())
      .then((d: CmsResponse) => {
        setData(d.merged)
        setOverrides(d.overrides as Partial<StoreData & { layout?: number }> ?? {})
        setHasStoreData(d.hasStoreData)
        setLoading(false)
      })
      .catch(() => {
        setMsg({ type: 'err', text: 'Kon store data niet laden' })
        setLoading(false)
      })
  }, [storeId])

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/stores/${storeId}/cms-data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides),
      })
      if (!r.ok) throw new Error('Save mislukt')
      flash('ok', 'Opgeslagen')
      onSaved?.()
    } catch (e) {
      flash('err', String(e))
    } finally {
      setSaving(false)
    }
  }

  const rebuild = async () => {
    // Save first, then rebuild
    setSaving(true)
    try {
      await fetch(`/api/stores/${storeId}/cms-data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides),
      })
    } catch { /* ignore */ }
    setSaving(false)

    setRebuilding(true)
    try {
      const r = await fetch(`/api/stores/${storeId}/rebuild`, { method: 'POST' })
      const d = await r.json() as { message?: string; error?: string }
      if (!r.ok) throw new Error(d.error ?? 'Rebuild mislukt')
      flash('ok', d.message ?? 'Rebuild gestart!')
      onSaved?.()
    } catch (e) {
      flash('err', String(e))
    } finally {
      setRebuilding(false)
    }
  }

  const updateProduct = (id: string, field: keyof Product, value: string | number) => {
    const products = data?.products.map(p =>
      p.id === id ? { ...p, [field]: field === 'price' || field === 'compareAtPrice' ? parseFloat(value as string) || 0 : value } : p
    ) ?? []
    setOverrides(o => ({ ...o, products }))
    setData(d => d ? { ...d, products } : d)
  }

  const tabs = [
    { id: 'content', label: 'Content' },
    { id: 'products', label: 'Producten' },
    { id: 'design', label: 'Design' },
    { id: 'deploy', label: 'Deploy' },
  ] as const

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />

      {/* Panel */}
      <div style={{ width: '520px', background: '#111', borderLeft: '1px solid #222', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{subdomain}</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#555' }}>{niche}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <a href={`http://${STORE_HOST}:4001`} target="_blank" rel="noopener" style={{ color: '#555', display: 'flex', alignItems: 'center' }}>
              <ExternalLink size={14} />
            </a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #222' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: '0.75rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? '#fff' : '#555', borderBottom: tab === t.id ? '2px solid #fff' : '2px solid transparent', transition: 'all 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          {loading && <p style={{ color: '#555', fontSize: '0.85rem' }}>Laden...</p>}

          {!loading && data && tab === 'content' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <Field label="Merknaam">
                <Input value={overrides.brand_name ?? data.brand_name} onChange={v => setOverrides(o => ({ ...o, brand_name: v }))} />
              </Field>
              <Field label="Slogan">
                <Input value={overrides.slogan ?? data.slogan} onChange={v => setOverrides(o => ({ ...o, slogan: v }))} />
              </Field>
              <Field label="Niche">
                <Input value={overrides.niche ?? data.niche} onChange={v => setOverrides(o => ({ ...o, niche: v }))} />
              </Field>
            </div>
          )}

          {!loading && data && tab === 'products' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {data.products.map((p, i) => (
                <div key={p.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
                    {p.image && <img src={p.image} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', background: '#222' }} />}
                    <span style={{ color: '#888', fontSize: '0.7rem' }}>Product {i + 1}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Field label="Naam">
                      <Input value={p.title} onChange={v => updateProduct(p.id, 'title', v)} />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <Field label="Prijs (€)">
                        <Input type="number" value={String(p.price)} onChange={v => updateProduct(p.id, 'price', v)} />
                      </Field>
                      <Field label="Doorgestreept (€)">
                        <Input type="number" value={String(p.compareAtPrice ?? '')} onChange={v => updateProduct(p.id, 'compareAtPrice', v)} placeholder="Optioneel" />
                      </Field>
                    </div>
                    <Field label="Badge (bijv. SALE, NIEUW)">
                      <Input value={p.badge ?? ''} onChange={v => updateProduct(p.id, 'badge', v)} placeholder="Leeg = geen badge" />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && data && tab === 'design' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <Field label="Primaire kleur">
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input type="color" value={overrides.primary_color ?? data.primary_color ?? '#2563eb'}
                    onChange={e => setOverrides(o => ({ ...o, primary_color: e.target.value }))}
                    style={{ width: '48px', height: '36px', border: '1px solid #333', borderRadius: '6px', cursor: 'pointer', background: 'none', padding: '2px' }} />
                  <Input value={overrides.primary_color ?? data.primary_color ?? '#2563eb'}
                    onChange={v => setOverrides(o => ({ ...o, primary_color: v }))} placeholder="#2563eb" />
                </div>
              </Field>

              <Field label="Layout variant">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {LAYOUT_NAMES.map((name, i) => (
                    <button key={i} onClick={() => setOverrides(o => ({ ...o, layout: i }))}
                      style={{ textAlign: 'left', padding: '0.75rem 1rem', background: (overrides.layout ?? 0) === i ? '#1e3a5f' : '#1a1a1a', border: `1px solid ${(overrides.layout ?? 0) === i ? '#3b82f6' : '#2a2a2a'}`, borderRadius: '6px', color: (overrides.layout ?? 0) === i ? '#93c5fd' : '#666', fontSize: '0.8rem', cursor: 'pointer' }}>
                      {i} — {name.split(' — ')[1]}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {!loading && tab === 'deploy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {!hasStoreData && (
                <div style={{ background: '#1a1209', border: '1px solid #3a2c0a', borderRadius: '8px', padding: '1rem', display: 'flex', gap: '0.75rem' }}>
                  <AlertCircle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ margin: 0, color: '#f59e0b', fontSize: '0.82rem', fontWeight: 600 }}>Geen originele data</p>
                    <p style={{ margin: '0.25rem 0 0', color: '#92712c', fontSize: '0.78rem' }}>
                      Deze store is niet via de pipeline gebouwd. Start een nieuwe pipeline run om rebuild te kunnen gebruiken.
                    </p>
                  </div>
                </div>
              )}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>Rebuild & Deploy</h3>
                <p style={{ margin: '0 0 1.25rem', color: '#666', fontSize: '0.8rem', lineHeight: 1.5 }}>
                  Slaat je wijzigingen op en bouwt de store opnieuw. Duurt ca. 2-3 minuten. De store blijft bereikbaar tijdens het bouwen.
                </p>
                <button onClick={rebuild} disabled={rebuilding || !hasStoreData}
                  style={{ width: '100%', padding: '0.875rem', background: hasStoreData ? '#16a34a' : '#1a1a1a', border: hasStoreData ? 'none' : '1px solid #2a2a2a', borderRadius: '8px', color: hasStoreData ? '#fff' : '#444', fontWeight: 700, fontSize: '0.85rem', cursor: hasStoreData ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  {rebuilding ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Rebuilding...</> : '→ Opslaan & Deployen'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {tab !== 'deploy' && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #222', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {msg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: msg.type === 'ok' ? '#4ade80' : '#f87171', flex: 1 }}>
                {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {msg.text}
              </div>
            )}
            {!msg && <div style={{ flex: 1 }} />}
            <button onClick={save} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.25rem', background: '#fff', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.8rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
              <Save size={14} />
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        )}

        {tab === 'deploy' && msg && (
          <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: msg.type === 'ok' ? '#4ade80' : '#f87171' }}>
            {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {msg.text}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Kleine helper components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '0.625rem 0.75rem', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
      onFocus={e => (e.target.style.borderColor = '#444')}
      onBlur={e => (e.target.style.borderColor = '#2a2a2a')} />
  )
}
