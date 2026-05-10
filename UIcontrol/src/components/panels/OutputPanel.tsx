import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { AgentId } from '@/types'

interface Props {
  outputJson: Record<string, unknown> | null
  agentId?: AgentId
}

// ── Smart renderers per agent type ────────────────────────────────────────────

function renderNiches(data: Record<string, unknown>) {
  const niches = (data.niches ?? []) as { name: string; trend_score?: number; trending_score?: number; reasoning?: string }[]
  return (
    <div className="space-y-2">
      <SectionLabel>Trending niches</SectionLabel>
      {niches.map((n, i) => (
        <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white text-sm font-medium">{n.name}</span>
            <ScoreBadge score={n.trend_score ?? n.trending_score ?? 0} />
          </div>
          {n.reasoning && <p className="text-zinc-500 text-[11px] leading-4">{n.reasoning}</p>}
        </div>
      ))}
    </div>
  )
}

function renderProducts(data: Record<string, unknown>) {
  const products = ((data.products ?? data.top_3 ?? []) as { name?: string; product_name?: string; buy_price?: number; purchase_price?: number; margin_percent?: number; description?: string }[])
  return (
    <div className="space-y-2">
      <SectionLabel>Geselecteerde producten</SectionLabel>
      {products.map((p, i) => {
        const name = p.name ?? p.product_name ?? `Product ${i + 1}`
        const buy = p.buy_price ?? p.purchase_price
        const margin = p.margin_percent
        return (
          <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-white text-sm font-medium">{name}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {buy != null && <span className="text-zinc-400 text-[11px] font-mono">€{Number(buy).toFixed(2)}</span>}
                {margin != null && <ScoreBadge score={Number(margin)} suffix="%" />}
              </div>
            </div>
            {p.description && <p className="text-zinc-500 text-[11px] leading-4">{String(p.description).slice(0, 120)}</p>}
          </div>
        )
      })}
    </div>
  )
}

function renderBrand(data: Record<string, unknown>) {
  const b = (data.brand ?? data) as { name?: string; brand_name?: string; slogan?: string; colors?: Record<string, string>; tone?: string }
  const name = b.name ?? b.brand_name ?? '—'
  const colors = b.colors ?? {}
  return (
    <div className="space-y-3">
      <SectionLabel>Merkidentiteit</SectionLabel>
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-2">
        <div>
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider">Naam</span>
          <p className="text-white text-base font-bold mt-0.5">{name}</p>
        </div>
        {b.slogan && (
          <div>
            <span className="text-zinc-600 text-[10px] uppercase tracking-wider">Slogan</span>
            <p className="text-zinc-300 text-sm italic mt-0.5">"{b.slogan}"</p>
          </div>
        )}
        {b.tone && (
          <div>
            <span className="text-zinc-600 text-[10px] uppercase tracking-wider">Tone</span>
            <p className="text-zinc-400 text-xs mt-0.5">{b.tone}</p>
          </div>
        )}
        {Object.keys(colors).length > 0 && (
          <div>
            <span className="text-zinc-600 text-[10px] uppercase tracking-wider">Kleuren</span>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {Object.entries(colors).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full border border-white/10 flex-shrink-0"
                       style={{ backgroundColor: String(v) }} />
                  <span className="text-zinc-500 text-[10px]">{k}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function renderAds(data: Record<string, unknown>) {
  const hooks = (data.hooks ?? []) as (string | { text?: string; hook?: string })[]
  const primaryText = (data.primary_text ?? '') as string
  const variants = (data.ad_copy_variants ?? []) as { primary_text?: string; headline?: string }[]
  return (
    <div className="space-y-3">
      <SectionLabel>Ad Copy</SectionLabel>
      {hooks.length > 0 && (
        <div>
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider mb-1.5 block">Hooks ({hooks.length})</span>
          <div className="space-y-1.5">
            {hooks.map((h, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-zinc-300 text-[12px]">
                {typeof h === 'string' ? h : (h.text ?? h.hook ?? JSON.stringify(h))}
              </div>
            ))}
          </div>
        </div>
      )}
      {primaryText && (
        <div>
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider mb-1.5 block">Primary Text</span>
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-zinc-300 text-[12px] leading-5">
            {primaryText}
          </div>
        </div>
      )}
      {variants.length > 0 && (
        <div>
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider mb-1.5 block">Varianten ({variants.length})</span>
          <div className="space-y-1.5">
            {variants.map((v, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2">
                {v.headline && <p className="text-white text-[11px] font-medium mb-0.5">{v.headline}</p>}
                {v.primary_text && <p className="text-zinc-400 text-[11px]">{v.primary_text}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function renderReviewer(data: Record<string, unknown>) {
  const decision = (data.decision ?? data.overall ?? data.verdict ?? '') as string
  const score = (data.score ?? data.quality_score) as number | undefined
  const reasoning = (data.reasoning ?? data.feedback ?? '') as string
  const isApproved = /^(APPROVED|PASS|GO|YES)/i.test(String(decision))
  const isRejected = /^(REJECTED|FAIL|NO|KILL)/i.test(String(decision))

  return (
    <div className="space-y-3">
      <SectionLabel>Reviewer Uitslag</SectionLabel>
      <div className={`rounded-xl border p-4 ${isApproved ? 'bg-emerald-500/[0.06] border-emerald-500/20' : isRejected ? 'bg-red-500/[0.06] border-red-500/20' : 'bg-amber-500/[0.06] border-amber-500/20'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-bold ${isApproved ? 'text-emerald-400' : isRejected ? 'text-red-400' : 'text-amber-400'}`}>
            {String(decision) || 'Geen besluit'}
          </span>
          {score != null && <ScoreBadge score={Number(score)} suffix="/10" />}
        </div>
        {reasoning && <p className="text-zinc-400 text-[12px] leading-5">{String(reasoning).slice(0, 300)}</p>}
      </div>
    </div>
  )
}

// ── Helper UI bits ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-zinc-600 text-[10px] uppercase tracking-wider font-medium">{children}</p>
}

function ScoreBadge({ score, suffix = '' }: { score: number; suffix?: string }) {
  const pct = Math.min(Math.max(score, 0), 100)
  const color = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
  return (
    <span className={`text-[11px] font-semibold font-mono ${color}`}>{score.toFixed(0)}{suffix}</span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OutputPanel({ outputJson, agentId }: Props) {
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  if (!outputJson) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-700">
        <span className="text-sm">Geen output</span>
        <span className="text-xs mt-1">Agent is nog niet gerund</span>
      </div>
    )
  }

  const raw = JSON.stringify(outputJson, null, 2)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Smart render by agent type
  let smartView: React.ReactNode = null
  if (agentId === 'trend-agent')        smartView = renderNiches(outputJson)
  else if (agentId === 'product-agent') smartView = renderProducts(outputJson)
  else if (agentId === 'brand-agent')   smartView = renderBrand(outputJson)
  else if (agentId === 'ads-agent')     smartView = renderAds(outputJson)
  else if (agentId?.includes('reviewer')) smartView = renderReviewer(outputJson)

  return (
    <div className="space-y-3">
      {/* Smart view */}
      {smartView && (
        <div className="space-y-3">
          {smartView}
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400 text-[11px] transition-colors"
          >
            {showRaw ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {showRaw ? 'Verberg' : 'Toon'} raw JSON
          </button>
        </div>
      )}

      {/* Raw JSON */}
      {(!smartView || showRaw) && (
        <div className="relative">
          <div className="absolute top-0 right-0 flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-400 hover:text-zinc-200 transition-all"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              {copied ? 'Gekopieerd' : 'Copy'}
            </button>
          </div>
          <pre className="text-[11px] leading-5 whitespace-pre-wrap break-all mt-9 font-mono text-zinc-400">
            {highlightJson(raw)}
          </pre>
        </div>
      )}
    </div>
  )
}

function highlightJson(json: string): JSX.Element[] {
  return json.split('\n').map((line, i) => {
    const highlighted = line
      .replace(/"([^"]+)"(?=\s*:)/g, '<span class="text-zinc-300">"$1"</span>')
      .replace(/:\s*"([^"]*)"(,?)/g, ': <span class="text-white">"$1"</span>$2')
      .replace(/:\s*(\d+\.?\d*)(,?)/g, ': <span class="text-zinc-200">$1</span>$2')
      .replace(/:\s*(true|false)(,?)/g, ': <span class="text-zinc-200">$1</span>$2')
      .replace(/:\s*(null)(,?)/g, ': <span class="text-zinc-600">$1</span>$2')
    return (
      <div key={i} dangerouslySetInnerHTML={{ __html: highlighted }} />
    )
  })
}
