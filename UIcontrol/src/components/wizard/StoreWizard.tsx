import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Loader2, Package, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import clsx from 'clsx'

// ═══════ Store-wizard ═══════
// Vervangt de simpele "niche invoeren → start" flow. Vier stappen waarin de AI
// actief meedenkt; pas bij de finale bevestiging wordt de pipeline gestart met
// de volledige config (persona + producten + site-structuur).

interface WizardQuestion { id: string; question: string; suggestions: string[] }

interface Persona {
  label: string
  ageRange?: string
  interests?: string[]
  buyingMotivation?: string
  problem?: string
  priceRange?: { min: number; max: number }
  tone?: string
}

interface Direction { id: string; title: string; rationale: string; persona: Persona }

interface NicheSuggestion {
  id: string
  title: string
  rationale: string
  estimatedProducts: number
  exampleKeywords: string[]
  categories: string[]
  persona: Persona & { label: string }
}

interface NicheDiscoveryResponse {
  status: 'ready' | 'scanning' | 'stale-refreshing'
  scannedAt?: string
  source?: 'cj' | 'mock'
  suggestions: NicheSuggestion[]
}

interface ShortlistProduct {
  supplier: string
  productId: string
  variantId?: string
  title: string
  image: string
  costPrice: number
  currency: string
  warehouse?: string
  inventory?: number
  rating?: number
  shippingDays?: { min: number; max: number }
  reason?: string
  suggestedPriceEur?: number
  marginEur?: number
  marginPct?: number
}

interface SitePage { id: string; title: string; purpose?: string; optional?: boolean }

interface StructureProposal { nicheType: string; rationale: string; pages: SitePage[]; extras: SitePage[] }

interface Props {
  onClose: () => void
  onStarted: (runId: string) => void
}

const STEPS = ['Idee & doelgroep', 'Producten (CJ)', 'Site-structuur', 'Bevestigen'] as const

// Max aantal selecteerbare producten — afgestemd op de collectie-grootte (6-15).
const MAX_SELECT = 15
const MIN_ADVISED = 6

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json() as T & { error?: string }
  if (!r.ok) throw new Error(data.error ?? `${r.status}`)
  return data
}

export function StoreWizard({ onClose, onStarted }: Props) {
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Stap 1 — idee & doelgroep
  const [idea, setIdea] = useState('')
  const [questions, setQuestions] = useState<WizardQuestion[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [directions, setDirections] = useState<Direction[] | null>(null)
  const [chosenDirection, setChosenDirection] = useState<Direction | null>(null)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [loadingDirections, setLoadingDirections] = useState(false)

  // Stap 2 — producten
  const [shortlist, setShortlist] = useState<ShortlistProduct[]>([])
  const [supplierIsMock, setSupplierIsMock] = useState(false)
  const [searchTermUsed, setSearchTermUsed] = useState<string | null>(null)
  const [productSource, setProductSource] = useState<'mcp' | 'rest' | 'mock' | null>(null)
  const [cjError, setCjError] = useState<string | null>(null)   // state (b): key gezet maar CJ faalt
  const [maxHint, setMaxHint] = useState(false)                  // feedback bij max bereikt
  const [selectedProducts, setSelectedProducts] = useState<Map<string, ShortlistProduct>>(new Map())
  const [loadingShortlist, setLoadingShortlist] = useState(false)
  const [manualQuery, setManualQuery] = useState('')
  const [manualResults, setManualResults] = useState<ShortlistProduct[]>([])
  const [searching, setSearching] = useState(false)

  // Stap 3 — structuur
  const [structure, setStructure] = useState<StructureProposal | null>(null)
  const [enabledExtras, setEnabledExtras] = useState<Set<string>>(new Set())
  const [loadingStructure, setLoadingStructure] = useState(false)

  // Stap 4
  const [starting, setStarting] = useState(false)

  // ── Stap 1 handlers ──────────────────────────────────────────────────────────

  const fetchQuestions = useCallback(async () => {
    if (!idea.trim()) return
    setLoadingQuestions(true)
    setError(null)
    try {
      const data = await postJson<{ questions: WizardQuestion[] }>('/api/wizard/questions', { idea })
      setQuestions(data.questions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI vragen genereren mislukt')
    } finally {
      setLoadingQuestions(false)
    }
  }, [idea])

  const fetchDirections = useCallback(async () => {
    setLoadingDirections(true)
    setError(null)
    try {
      const data = await postJson<{ directions: Direction[] }>('/api/wizard/directions', { idea, answers })
      setDirections(data.directions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI richtingen genereren mislukt')
    } finally {
      setLoadingDirections(false)
    }
  }, [idea, answers])

  // ── Stap 2: shortlist automatisch laden bij binnenkomst ─────────────────────
  // Ref-guard: React StrictMode (dev) draait mount-effects DUBBEL en state-guards
  // (loadingShortlist) zijn dan nog niet gecommit — dus zonder ref vuurden er
  // twee identieke /api/wizard/shortlist calls af en betaalde CJ's rate limit
  // de rekening. De ref overleeft de dubbele invocatie wél.

  const shortlistRequestedRef = useRef(false)

  const loadShortlist = useCallback(() => {
    if (!chosenDirection) return
    shortlistRequestedRef.current = true
    setLoadingShortlist(true)
    setError(null)
    setCjError(null)
    postJson<{ shortlist: ShortlistProduct[]; supplierIsMock: boolean; searchTermUsed?: string | null; source?: 'mcp' | 'rest' | 'mock' }>('/api/wizard/shortlist', {
      niche: idea,
      persona: chosenDirection.persona,
    })
      .then(data => {
        setShortlist(data.shortlist ?? [])
        setSupplierIsMock(data.supplierIsMock)
        setSearchTermUsed(data.searchTermUsed ?? null)
        setProductSource(data.source ?? null)
        // Pre-selecteer de top 8 (of minder) — de store toont 6-15 producten
        const pre = new Map<string, ShortlistProduct>()
        for (const p of (data.shortlist ?? []).slice(0, Math.min(8, MAX_SELECT))) pre.set(p.productId, p)
        setSelectedProducts(pre)
      })
      // CJ-fout (auth/rate-limit/netwerk) → toon de reden, val NIET stil terug op mock
      .catch(err => setCjError(err instanceof Error ? err.message : 'Shortlist laden mislukt'))
      .finally(() => setLoadingShortlist(false))
  }, [chosenDirection, idea])

  useEffect(() => {
    if (step !== 1 || !chosenDirection || shortlistRequestedRef.current) return
    loadShortlist()
  }, [step, chosenDirection, loadShortlist])

  // ── CJ-status pollen tijdens het laden: 429-backoffs zichtbaar maken ─────────
  // i.p.v. een generieke spinner toont de UI "opnieuw proberen over Xs".

  const [cjRetry, setCjRetry] = useState<{ attempt: number; maxAttempts: number; seconds: number } | null>(null)

  useEffect(() => {
    if (!loadingShortlist && !searching) { setCjRetry(null); return }
    let alive = true
    const poll = async () => {
      try {
        const r = await fetch('/api/suppliers/cj/status')
        const data = await r.json() as { retry: { attempt: number; maxAttempts: number; resumeInMs: number } | null }
        if (!alive) return
        setCjRetry(data.retry
          ? { attempt: data.retry.attempt, maxAttempts: data.retry.maxAttempts, seconds: Math.max(1, Math.ceil(data.retry.resumeInMs / 1000)) }
          : null)
      } catch { /* status is nice-to-have — nooit de wizard breken */ }
    }
    poll()
    const timer = setInterval(poll, 1000)
    return () => { alive = false; clearInterval(timer) }
  }, [loadingShortlist, searching])

  const manualSearch = useCallback(async () => {
    if (!manualQuery.trim()) return
    setSearching(true)
    setCjError(null)
    try {
      const r = await fetch(`/api/suppliers/cj/search?q=${encodeURIComponent(manualQuery.trim())}&limit=12`)
      const data = await r.json() as { products?: ShortlistProduct[]; isMock?: boolean; error?: string }
      if (!r.ok) throw new Error(data.error ?? `${r.status}`)
      if (typeof data.isMock === 'boolean') setSupplierIsMock(data.isMock)
      setManualResults((data.products ?? []).map(p => ({
        ...p,
        suggestedPriceEur: p.suggestedPriceEur ?? Math.max(9.95, Math.floor(p.costPrice * 0.92 * 2.8) + 0.95),
      })))
    } catch (err) {
      setCjError(err instanceof Error ? err.message : 'Handmatig zoeken mislukt')
    } finally {
      setSearching(false)
    }
  }, [manualQuery])

  // Selectie-toggle met max-constraint (zelfde logica voor shortlist én handmatig zoeken)
  const toggleProduct = (p: ShortlistProduct) => {
    setSelectedProducts(prev => {
      const next = new Map(prev)
      if (next.has(p.productId)) {
        next.delete(p.productId)
        setMaxHint(false)
        return next
      }
      if (next.size >= MAX_SELECT) {
        setMaxHint(true)          // max bereikt → blokkeer + toon feedback
        return prev
      }
      next.set(p.productId, p)
      if (next.size < MAX_SELECT) setMaxHint(false)
      return next
    })
  }

  // ── Stap 3: structuur automatisch laden ──────────────────────────────────────

  useEffect(() => {
    if (step !== 2 || !chosenDirection || structure || loadingStructure) return
    setLoadingStructure(true)
    setError(null)
    postJson<StructureProposal>('/api/wizard/structure', {
      idea,
      persona: chosenDirection.persona,
      productCount: selectedProducts.size,
    })
      .then(setStructure)
      .catch(err => setError(err instanceof Error ? err.message : 'Structuur-voorstel mislukt'))
      .finally(() => setLoadingStructure(false))
  }, [step, chosenDirection, idea, selectedProducts.size, structure, loadingStructure])

  // ── Stap 4: pipeline starten ─────────────────────────────────────────────────

  const products = useMemo(() => Array.from(selectedProducts.values()), [selectedProducts])
  const totalMargin = useMemo(() => products.reduce((a, p) => a + (p.marginEur ?? 0), 0), [products])

  const startPipeline = useCallback(async () => {
    if (!chosenDirection || products.length === 0) return
    setStarting(true)
    setError(null)
    try {
      const wizardConfig = {
        idea,
        persona: chosenDirection.persona,
        products: products.map(p => ({
          productId: p.productId,
          variantId: p.variantId,
          supplier: p.supplier ?? 'cj',
          title: p.title,
          image: p.image,
          costPriceUsd: p.costPrice,
          priceEur: p.suggestedPriceEur ?? Math.round(p.costPrice * 0.92 * 2.8 * 100) / 100,
          reason: p.reason,
        })),
        siteStructure: structure ? {
          nicheType: structure.nicheType,
          pages: structure.pages,
          extras: structure.extras.filter(e => enabledExtras.has(e.id)),
          rationale: structure.rationale,
        } : undefined,
      }
      const data = await postJson<{ runId: string }>('/api/pipeline/start', { niche: idea.trim(), wizardConfig })
      onStarted(data.runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline starten mislukt')
      setStarting(false)
    }
  }, [chosenDirection, products, idea, structure, enabledExtras, onStarted])

  // ── Navigatie ────────────────────────────────────────────────────────────────

  const canNext =
    (step === 0 && !!chosenDirection) ||
    (step === 1 && selectedProducts.size > 0) ||
    (step === 2 && !!structure)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0c0c0e] border border-white/[0.1] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header + stappen */}
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.07]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              <Sparkles size={15} className="text-blue-400" /> Nieuwe store
            </h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 rounded transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className={clsx(
                  'flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap',
                  i === step ? 'text-white' : i < step ? 'text-emerald-400' : 'text-zinc-600',
                )}>
                  <span className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] border',
                    i === step ? 'border-blue-500 text-blue-400' : i < step ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-zinc-700',
                  )}>
                    {i < step ? <Check size={10} /> : i + 1}
                  </span>
                  {label}
                </div>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-white/[0.07]" />}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg text-xs bg-red-900/40 border border-red-700/40 text-red-300">
              {error}
            </div>
          )}

          {/* ─── STAP 1: Idee & doelgroep ─── */}
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <label className="text-xs text-zinc-400 block mb-2">Waar wil je een store omheen bouwen?</label>
                <div className="flex gap-2">
                  <input
                    value={idea}
                    onChange={e => setIdea(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchQuestions()}
                    placeholder='Los idee, bv. "portable blender bottles"'
                    className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-white"
                  />
                  <button
                    onClick={fetchQuestions}
                    disabled={!idea.trim() || loadingQuestions}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs rounded-lg font-medium flex items-center gap-1.5"
                  >
                    {loadingQuestions ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    Verken
                  </button>
                </div>
              </div>

              {loadingQuestions && <AiThinking label="AI analyseert je idee en bedenkt verdiepende vragen…" />}

              {questions && !directions && (
                <div className="space-y-4">
                  {questions.map(q => (
                    <div key={q.id}>
                      <p className="text-xs text-zinc-300 mb-2">{q.question}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {q.suggestions.map(s => (
                          <button
                            key={s}
                            onClick={() => setAnswers(a => ({ ...a, [q.id]: s }))}
                            className={clsx(
                              'px-2.5 py-1 rounded-full text-[11px] border transition-all',
                              answers[q.id] === s
                                ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                                : 'bg-white/[0.03] border-white/[0.1] text-zinc-400 hover:border-white/[0.25]',
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <input
                        value={answers[q.id] ?? ''}
                        onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                        placeholder="Of typ je eigen antwoord…"
                        className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs focus:outline-none focus:border-blue-500 text-white"
                      />
                    </div>
                  ))}
                  <button
                    onClick={fetchDirections}
                    disabled={loadingDirections || Object.keys(answers).length === 0}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs rounded-lg font-medium flex items-center gap-1.5"
                  >
                    {loadingDirections ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                    Genereer richtingen
                  </button>
                </div>
              )}

              {loadingDirections && <AiThinking label="AI werkt 3 doelgroep-richtingen uit…" />}

              {directions && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Kies de richting die het beste past (of pas hem straks aan):</p>
                  {directions.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setChosenDirection(d)}
                      className={clsx(
                        'w-full text-left p-3.5 rounded-xl border transition-all',
                        chosenDirection?.id === d.id
                          ? 'border-blue-500/70 bg-blue-500/[0.07]'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.2]',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm font-semibold">{d.title}</span>
                        {d.persona.priceRange && (
                          <span className="text-[11px] text-emerald-400 font-mono">
                            €{d.persona.priceRange.min}–{d.persona.priceRange.max}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">{d.rationale}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Chip>{d.persona.label}</Chip>
                        {d.persona.ageRange && <Chip>{d.persona.ageRange} jr</Chip>}
                        {(d.persona.interests ?? []).slice(0, 3).map(i => <Chip key={i}>{i}</Chip>)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── STAP 2: Producten ─── */}
          {step === 1 && (
            <div className="space-y-4">
              {/* State (b): key gezet maar CJ faalt → duidelijke fout, GEEN stille mock */}
              {cjError && (
                <div className="px-3 py-2.5 rounded-lg text-[11px] bg-red-900/40 border border-red-700/50 text-red-200">
                  <span className="font-semibold">CJ API-fout:</span> {cjError}
                  <span className="block text-red-300/70 mt-0.5">Controleer je CJ_API_KEY/CJ_EMAIL, rate-limits of netwerk. Er wordt bewust NIET teruggevallen op mock-data.</span>
                  <button
                    onClick={loadShortlist}
                    disabled={loadingShortlist}
                    className="mt-2 px-3 py-1.5 bg-red-700/40 hover:bg-red-700/70 disabled:opacity-40 text-red-100 text-[11px] rounded-lg font-medium flex items-center gap-1.5 transition-colors"
                  >
                    {loadingShortlist ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    Opnieuw proberen
                  </button>
                </div>
              )}
              {/* State (a): geen key → bewuste mock-fallback met waarschuwing */}
              {!cjError && supplierIsMock && (
                <div className="px-3 py-2 rounded-lg text-[11px] bg-amber-900/30 border border-amber-700/40 text-amber-300">
                  CJ_API_KEY niet geconfigureerd — dit zijn <b>mock-producten</b> (pid begint met "mock-"). Vul CJ_EMAIL + CJ_API_KEY in .env in voor echte CJ data.
                </div>
              )}
              {/* State (c): echte CJ data */}
              {!cjError && !supplierIsMock && shortlist.length > 0 && (
                <div className="px-3 py-2 rounded-lg text-[11px] bg-emerald-900/25 border border-emerald-700/40 text-emerald-300">
                  Verbonden met CJ — echte producten met echte CJ product-ID's (pid/vid).
                  {productSource === 'mcp'
                    ? <span className="ml-1 text-emerald-400">Via CJ MCP-server (AI-gestuurde discovery).</span>
                    : productSource === 'rest'
                      ? <span className="ml-1 text-emerald-400/70">Via directe CJ REST-search.</span>
                      : null}
                </div>
              )}

              {loadingShortlist && (cjRetry
                ? <AiThinking warn label={`CJ rate limit bereikt — opnieuw proberen over ${cjRetry.seconds}s (poging ${cjRetry.attempt}/${cjRetry.maxAttempts})…`} />
                : <AiThinking label="CJ doorzoeken (EU warehouses) en AI selecteert een shortlist…" />)}

              {!loadingShortlist && shortlist.length > 0 && (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <p className="text-xs text-zinc-400">
                      AI-shortlist voor <span className="text-white">{chosenDirection?.persona.label}</span>
                      {searchTermUsed && <> (CJ-zoekterm: <span className="text-zinc-300 font-mono">"{searchTermUsed}"</span>)</>} —
                      geselecteerd: <span className={clsx('font-semibold', selectedProducts.size >= MIN_ADVISED ? 'text-emerald-400' : 'text-amber-400')}>{selectedProducts.size}</span> / {MAX_SELECT}
                    </p>
                    {maxHint
                      ? <span className="text-[11px] text-amber-400">Max {MAX_SELECT} producten bereikt — deselecteer er eerst een.</span>
                      : selectedProducts.size < MIN_ADVISED
                        ? <span className="text-[11px] text-zinc-600">Tip: kies er minstens {MIN_ADVISED} voor een volle collectie.</span>
                        : null}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {shortlist.map(p => (
                      <ProductCard
                        key={p.productId}
                        p={p}
                        selected={selectedProducts.has(p.productId)}
                        disabled={!selectedProducts.has(p.productId) && selectedProducts.size >= MAX_SELECT}
                        onToggle={() => toggleProduct(p)}
                      />
                    ))}
                  </div>
                </>
              )}

              {!loadingShortlist && !cjError && shortlist.length === 0 && (
                <p className="text-xs text-zinc-500">Geen producten gevonden in EU warehouses voor dit idee. Probeer hieronder handmatig te zoeken.</p>
              )}

              {/* Handmatig zoeken */}
              <div className="border-t border-white/[0.07] pt-4">
                <label className="text-xs text-zinc-400 block mb-2">Zelf zoeken in CJ (EU warehouse)</label>
                <div className="flex gap-2">
                  <input
                    value={manualQuery}
                    onChange={e => setManualQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && manualSearch()}
                    placeholder="Zoekterm…"
                    className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs focus:outline-none focus:border-blue-500 text-white"
                  />
                  <button
                    onClick={manualSearch}
                    disabled={searching || !manualQuery.trim()}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs rounded flex items-center gap-1.5"
                  >
                    {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    Zoek
                  </button>
                </div>
                {searching && cjRetry && (
                  <p className="text-[11px] text-amber-400 mt-2">
                    CJ rate limit bereikt — opnieuw proberen over {cjRetry.seconds}s (poging {cjRetry.attempt}/{cjRetry.maxAttempts})…
                  </p>
                )}
                {manualResults.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                    {manualResults.map(p => (
                      <ProductCard
                        key={p.productId}
                        p={p}
                        selected={selectedProducts.has(p.productId)}
                        disabled={!selectedProducts.has(p.productId) && selectedProducts.size >= MAX_SELECT}
                        onToggle={() => toggleProduct(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── STAP 3: Site-structuur ─── */}
          {step === 2 && (
            <div className="space-y-4">
              {loadingStructure && <AiThinking label="AI bepaalt de optimale site-omvang voor deze doelgroep…" />}

              {structure && (
                <>
                  <div className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                    <p className="text-[11px] text-zinc-300">
                      <span className={clsx('font-semibold', structure.nicheType === 'impulse' ? 'text-amber-400' : 'text-blue-400')}>
                        {structure.nicheType === 'impulse' ? 'Impulsaankoop' : 'Overwogen aankoop'}
                      </span>
                      {' — '}{structure.rationale}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-zinc-400 mb-2">Voorgestelde structuur ({structure.pages.length} kernpagina's + standaard checkout/bedankt/info):</p>
                    <div className="space-y-1.5">
                      {structure.pages.map(pg => (
                        <div key={pg.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.07]">
                          <Check size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="text-white text-xs font-medium">{pg.title}</span>
                            {pg.purpose && <p className="text-[11px] text-zinc-500 mt-0.5">{pg.purpose}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {structure.extras.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-400 mb-2">Optionele extra's (aanklikken om toe te voegen):</p>
                      <div className="space-y-1.5">
                        {structure.extras.map(ex => (
                          <button
                            key={ex.id}
                            onClick={() => setEnabledExtras(prev => {
                              const next = new Set(prev)
                              if (next.has(ex.id)) next.delete(ex.id); else next.add(ex.id)
                              return next
                            })}
                            className={clsx(
                              'w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-all',
                              enabledExtras.has(ex.id)
                                ? 'bg-blue-500/[0.07] border-blue-500/50'
                                : 'bg-white/[0.02] border-white/[0.07] hover:border-white/[0.2]',
                            )}
                          >
                            <span className={clsx(
                              'w-3.5 h-3.5 rounded border mt-0.5 flex items-center justify-center flex-shrink-0',
                              enabledExtras.has(ex.id) ? 'bg-blue-600 border-blue-500' : 'border-zinc-600',
                            )}>
                              {enabledExtras.has(ex.id) && <Check size={9} className="text-white" />}
                            </span>
                            <div>
                              <span className="text-white text-xs font-medium">{ex.title}</span>
                              {ex.purpose && <p className="text-[11px] text-zinc-500 mt-0.5">{ex.purpose}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─── STAP 4: Samenvatting ─── */}
          {step === 3 && chosenDirection && (
            <div className="space-y-4">
              <SummaryBlock title="Doelgroep">
                <p className="text-xs text-white font-medium">{chosenDirection.title} — {chosenDirection.persona.label}</p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {chosenDirection.persona.problem}
                  {chosenDirection.persona.priceRange && ` · prijsklasse €${chosenDirection.persona.priceRange.min}–${chosenDirection.persona.priceRange.max}`}
                </p>
              </SummaryBlock>

              <SummaryBlock title={`Producten (${products.length})`}>
                <div className="space-y-1.5">
                  {products.map(p => (
                    <div key={p.productId} className="flex items-center gap-2.5">
                      {p.image && <img src={p.image} alt="" className="w-8 h-8 rounded object-cover bg-zinc-800" />}
                      <span className="text-xs text-white flex-1 truncate">{p.title}</span>
                      <span className="text-[11px] font-mono text-zinc-400">€{(p.suggestedPriceEur ?? 0).toFixed(2)}</span>
                      {p.marginEur != null && <span className="text-[11px] font-mono text-emerald-400">+€{p.marginEur.toFixed(2)}</span>}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500 mt-2 pt-2 border-t border-white/[0.06]">
                  Geschatte marge per volledige verkoop: <span className="text-emerald-400 font-mono">€{totalMargin.toFixed(2)}</span>
                </p>
              </SummaryBlock>

              {structure && (
                <SummaryBlock title="Site-structuur">
                  <p className="text-[11px] text-zinc-300">
                    {structure.pages.map(p => p.title).join(' · ')}
                    {enabledExtras.size > 0 && (
                      <span className="text-blue-300"> + {structure.extras.filter(e => enabledExtras.has(e.id)).map(e => e.title).join(', ')}</span>
                    )}
                  </p>
                </SummaryBlock>
              )}

              <p className="text-[11px] text-zinc-500">
                Na bevestiging draait de pipeline verder vanaf brand-creation: merknaam, copy, store-build en deploy.
                De research-stappen worden overgeslagen — jouw keuzes zijn leidend.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.07] flex items-center justify-between">
          <button
            onClick={() => step === 0 ? onClose() : setStep(s => s - 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-400 hover:text-white text-xs rounded-lg transition-colors"
          >
            <ArrowLeft size={13} /> {step === 0 ? 'Annuleren' : 'Terug'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs rounded-lg font-medium"
            >
              Volgende <ArrowRight size={13} />
            </button>
          ) : (
            <button
              onClick={startPipeline}
              disabled={starting || products.length === 0}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs rounded-lg font-semibold"
            >
              {starting ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
              {starting ? 'Store wordt gestart…' : 'Genereer store'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Kleine subcomponenten ───────────────────────────────────────────────────────

function AiThinking({ label, warn = false }: { label: string; warn?: boolean }) {
  return (
    <div className={clsx(
      'flex items-center gap-2.5 px-3 py-3 rounded-lg border',
      warn ? 'bg-amber-500/[0.06] border-amber-500/25' : 'bg-blue-500/[0.05] border-blue-500/20',
    )}>
      <Loader2 size={14} className={clsx('animate-spin flex-shrink-0', warn ? 'text-amber-400' : 'text-blue-400')} />
      <span className={clsx('text-xs', warn ? 'text-amber-300' : 'text-blue-300')}>{label}</span>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/[0.05] border border-white/[0.1] text-zinc-400">
      {children}
    </span>
  )
}

function SummaryBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3 rounded-xl bg-white/[0.02] border border-white/[0.08]">
      <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">{title}</p>
      {children}
    </div>
  )
}

function ProductCard({ p, selected, onToggle, disabled = false }: { p: ShortlistProduct; selected: boolean; onToggle: () => void; disabled?: boolean }) {
  const costEur = p.costPrice * 0.92
  const price = p.suggestedPriceEur ?? costEur * 2.8
  const margin = p.marginEur ?? price - costEur
  const isMock = p.productId.startsWith('mock-')
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={disabled ? `Max ${MAX_SELECT} producten geselecteerd` : undefined}
      className={clsx(
        'text-left p-3 rounded-xl border transition-all',
        selected
          ? 'border-emerald-500/60 bg-emerald-500/[0.05]'
          : disabled
            ? 'border-white/[0.05] bg-white/[0.01] opacity-40 cursor-not-allowed'
            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.2]',
      )}
    >
      <div className="flex gap-2.5">
        {p.image && <img src={p.image} alt="" className="w-14 h-14 rounded-lg object-cover bg-zinc-800 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-white font-medium leading-snug line-clamp-2">{p.title}</p>
            <span className={clsx(
              'w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0',
              selected ? 'bg-emerald-600 border-emerald-500' : 'border-zinc-600',
            )}>
              {selected && <Check size={10} className="text-white" />}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] font-mono">
            {isMock
              ? <span className="text-amber-500/80 not-italic">mock</span>
              : <span className="text-emerald-500/70 not-italic" title={`CJ pid ${p.productId}`}>CJ ✓</span>}
            <span className="text-zinc-400">verkoop €{price.toFixed(2)}</span>
            <span className="text-emerald-400">marge €{margin.toFixed(2)}{p.marginPct != null && ` (${p.marginPct}%)`}</span>
            {p.shippingDays && <span className="text-zinc-500">{p.shippingDays.min}-{p.shippingDays.max}d</span>}
            {p.warehouse && <span className="text-zinc-500">WH {p.warehouse}</span>}
            {p.inventory != null && <span className="text-zinc-500">stock {p.inventory}</span>}
            {p.rating != null && <span className="text-amber-400">★ {p.rating.toFixed(1)}</span>}
          </div>
          {p.reason && <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">{p.reason}</p>}
        </div>
      </div>
    </button>
  )
}
