// ═══════ Marketing-concepten per winkel ═══════
//
// Toont wat de marketing-agent na de store-build heeft gegenereerd: caption-
// varianten per platform en per product een "wat te filmen"-suggestie.
//
// Bewust GEEN publicatieknop. Deze fase is bekijken, bijschaven, kopiëren en
// zelf plaatsen. De status (concept / bewerkt / gebruikt) is er om te zien wat
// er al de deur uit is, zodat je niet twee keer hetzelfde post.

import { useCallback, useEffect, useState } from 'react'
import { Copy, Check, RefreshCw, Loader2, Save } from 'lucide-react'

interface MarketingItem {
  id: string
  storeId: string
  platform: 'tiktok' | 'instagram' | 'shot-idea'
  kind: 'caption' | 'shot'
  contentText: string
  hashtags: string[]
  productTitle?: string
  status: 'draft' | 'edited' | 'used'
  createdAt: string
  updatedAt?: string
}

const PLATFORM_LABEL: Record<MarketingItem['platform'], string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  'shot-idea': 'Wat te filmen',
}

const STATUS_LABEL: Record<MarketingItem['status'], string> = {
  draft: 'concept',
  edited: 'bewerkt',
  used: 'gebruikt',
}

const STATUS_COLOR: Record<MarketingItem['status'], string> = {
  draft: '#555',
  edited: '#d29922',
  used: '#2ea043',
}

export function MarketingPanel({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<MarketingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/stores/${storeId}/marketing`)
      .then(r => r.json())
      .then((d: { items?: MarketingItem[]; error?: string }) => {
        if (d.error) throw new Error(d.error)
        setItems(d.items ?? [])
        setError(null)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'laden mislukt'))
      .finally(() => setLoading(false))
  }, [storeId])

  useEffect(load, [load])

  const generate = async () => {
    setGenerating(true)
    setError(null)
    setNote(null)
    try {
      const r = await fetch(`/api/stores/${storeId}/marketing/generate`, { method: 'POST' })
      const d = await r.json() as {
        ok?: boolean; captions?: number; shots?: number
        rejected?: Array<{ issues: string[] }>; emojiStripped?: number; error?: string
      }
      if (!r.ok || !d.ok) throw new Error(d.error ?? 'genereren mislukt')
      const parts = [`${d.captions} captions, ${d.shots} film-suggesties`]
      if (d.rejected?.length) parts.push(`${d.rejected.length} geweigerd op verzonnen claims`)
      if (d.emojiStripped) parts.push(`${d.emojiStripped} veld(en) ontdaan van emoji`)
      setNote(parts.join(' · '))
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'genereren mislukt')
    } finally {
      setGenerating(false)
    }
  }

  const groups: Array<MarketingItem['platform']> = ['tiktok', 'instagram', 'shot-idea']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#666', lineHeight: 1.5 }}>
          Concepten. Er wordt niets automatisch geplaatst — kopieer wat je wilt gebruiken.
        </p>
        <button
          onClick={generate}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.7rem',
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
            color: generating ? '#555' : '#ddd', fontSize: '0.72rem', cursor: generating ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}>
          {generating ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
          {items.length ? 'Opnieuw' : 'Genereren'}
        </button>
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#f85149', background: 'rgba(248,81,73,.08)', border: '1px solid rgba(248,81,73,.3)', borderRadius: 6, padding: '0.5rem 0.7rem' }}>
          {error}
        </p>
      )}
      {note && (
        <p style={{ margin: 0, fontSize: '0.72rem', color: '#2ea043' }}>{note}</p>
      )}

      {loading && <p style={{ color: '#555', fontSize: '0.85rem' }}>Laden…</p>}

      {!loading && items.length === 0 && !error && (
        <p style={{ color: '#555', fontSize: '0.8rem', lineHeight: 1.6 }}>
          Nog geen content. Die wordt normaal automatisch aangemaakt na een build of rebuild;
          met de knop hierboven doe je het handmatig.
        </p>
      )}

      {groups.map(platform => {
        const rows = items.filter(i => i.platform === platform)
        if (rows.length === 0) return null
        return (
          <div key={platform} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#666' }}>
              {PLATFORM_LABEL[platform]} <span style={{ color: '#3a3a3a' }}>({rows.length})</span>
            </h3>
            {rows.map(item => (
              <ContentCard key={item.id} item={item} onSaved={updated => {
                setItems(list => list.map(x => (x.id === updated.id ? updated : x)))
              }} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ContentCard({ item, onSaved }: { item: MarketingItem; onSaved: (i: MarketingItem) => void }) {
  const [text, setText] = useState(item.contentText)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { setText(item.contentText) }, [item.contentText])

  const dirty = text !== item.contentText
  const full = item.hashtags.length ? `${text}\n\n${item.hashtags.join(' ')}` : text

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/marketing/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json() as MarketingItem & { error?: string }
      if (r.ok && !d.error) onSaved(d)
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard geweigerd — de tekst staat er nog gewoon */ }
  }

  return (
    <div style={{ border: '1px solid #222', borderRadius: 8, padding: '0.7rem', background: '#0d0d0d' }}>
      {item.productTitle && (
        <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', color: '#666' }}>{item.productTitle}</p>
      )}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={Math.min(6, Math.max(2, Math.ceil(text.length / 60)))}
        style={{
          width: '100%', background: '#111', border: '1px solid #222', borderRadius: 6,
          color: '#ddd', fontSize: '0.78rem', lineHeight: 1.55, padding: '0.5rem',
          fontFamily: 'inherit', resize: 'vertical',
        }}
      />
      {item.hashtags.length > 0 && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', color: '#4a7dbd', wordBreak: 'break-word' }}>
          {item.hashtags.join(' ')}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.55rem' }}>
        <span style={{ fontSize: '0.66rem', color: STATUS_COLOR[item.status], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {STATUS_LABEL[item.status]}
        </span>
        <div style={{ flex: 1 }} />
        {dirty && (
          <button onClick={() => patch({ contentText: text })} disabled={saving}
            style={btn('#1f6feb')}>
            {saving ? <Loader2 size={11} className="spin" /> : <Save size={11} />} Opslaan
          </button>
        )}
        <button onClick={copy} style={btn()}>
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Gekopieerd' : 'Kopieer'}
        </button>
        <button
          onClick={() => patch({ status: item.status === 'used' ? 'edited' : 'used' })}
          disabled={saving}
          style={btn(item.status === 'used' ? '#2ea043' : undefined)}>
          {item.status === 'used' ? 'Weer beschikbaar' : 'Gebruikt'}
        </button>
      </div>
    </div>
  )
}

function btn(accent?: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.3rem 0.55rem', borderRadius: 5, cursor: 'pointer',
    background: accent ? `${accent}22` : '#1a1a1a',
    border: `1px solid ${accent ?? '#2a2a2a'}`,
    color: accent ?? '#aaa', fontSize: '0.68rem',
  }
}
