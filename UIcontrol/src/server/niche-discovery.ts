// ═══════ CJ-catalogus verkenning → niche-suggesties ═══════
// Alternatief startpunt voor de wizard: i.p.v. blind een idee typen kiest de
// gebruiker een niche waarvan de CJ-voorraad al gemeten is.
//
// Flow: scanCatalog() meet per CJ-(sub)categorie de voorraad-kwaliteit in EU
// warehouses → LLM clustert de goed-voorradige categorieën tot 5-8 samenhangende
// webshop-niches (met persona) → cache in settings-tabel (24h TTL).
//
// Gebruikte CJ-signalen (zie rapport):
//   - `total` uit de product/list paginatie — GLOBAAL (alle warehouses) én per
//     EU-warehouse → breedte + verzendprofiel (EU-snel vs overwegend-CN)
//   - `sellPrice` van een sample → marge-potentie (onze 2.8× markup-heuristiek)
//   - `listedNum` (hoe vaak door andere dropshippers gelist) → populariteit/bewezen vraag
//   - tweede EU-warehouse-probe (FR) voor de top-categorieën → EU-spreiding
// EU is een VOORKEUR/label, geen harde filter: de scan meet wereldwijd en de
// LLM-onderbouwing vermeldt per niche of hij EU-snel of vnl. uit CN levert.
// Bewust NIET gebruikt: varianten-tellingen (kost 1 request per product bij
// 1 req/s rate limit) en "trending" (geen publiek CJ v2 endpoint voor).

import db from './db.js'
import { getSupplier } from './suppliers/index.js'
import { CJAdapter, type CatalogProbe } from './suppliers/cj-adapter.js'
import type { WizardPersona } from './wizard.js'

const LLM_BASE = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1'
const USD_TO_EUR = 0.92
const MARKUP = 2.8

const CACHE_KEY = 'niche_discovery_cache'
const CACHE_TTL_MS = 24 * 3600_000
const MAX_CATEGORIES = parseInt(process.env.NICHE_SCAN_MAX_CATEGORIES ?? '24', 10)
const SPREAD_PROBES = 8            // top-N categorieën krijgen een 2e EU-warehouse check
const PRIMARY_EU_WAREHOUSE = 'DE'  // grootste EU-voorraad bij CJ
const SPREAD_WAREHOUSE = 'FR'
const MIN_TOTAL_FOR_NICHE = 25     // minder dan dit (wereldwijd!) = "schaars", niet voorstellen

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShippingProfile = 'eu-fast' | 'mixed' | 'mostly-cn'

export interface CategoryStats {
  categoryId: string
  name: string
  parentName: string
  totalAll: number                 // breedte over ALLE warehouses wereldwijd
  totalEU: number                  // breedte in primair EU warehouse (DE)
  totalSpread?: number             // breedte in 2e EU warehouse (alleen top-N)
  shippingProfile: ShippingProfile // afgeleid van totalEU/totalAll
  avgCostUsd: number
  avgMarginPct: number             // bij onze 2.8× markup-heuristiek
  avgListedNum?: number            // populariteit bij andere dropshippers
  sampleTitles: string[]
}

export interface NicheSuggestion {
  id: string
  title: string                    // Engels — wordt de niche/idea voor de pipeline
  rationale: string                // Nederlands — onderbouwing voor de gebruiker
  estimatedProducts: number
  exampleKeywords: string[]        // Engelse zoektermen voor stap 2
  categories: string[]
  persona: WizardPersona           // klaar-voor-gebruik → wizard kan direct naar stap 2
}

export interface NicheDiscoveryCache {
  scannedAt: string
  source: 'cj' | 'mock'
  categories: CategoryStats[]
  suggestions: NicheSuggestion[]
}

// ── Settings cache helpers ─────────────────────────────────────────────────────

function cacheGet(): NicheDiscoveryCache | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(CACHE_KEY) as { value: string } | undefined
    return row?.value ? JSON.parse(row.value) as NicheDiscoveryCache : null
  } catch { return null }
}

function cacheSet(data: NicheDiscoveryCache): void {
  const v = JSON.stringify(data)
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(CACHE_KEY, v, v)
}

// ── Scan ──────────────────────────────────────────────────────────────────────

function cj(): CJAdapter {
  return getSupplier('cj') as CJAdapter
}

/** Level-2 categorieën round-robin over de level-1 takken → diverse selectie. */
function selectCategories(tree: Awaited<ReturnType<CJAdapter['getCategoryTree']>>): Array<{ id: string; name: string; parentName: string }> {
  const buckets = tree.map(l1 => l1.children.map(l2 => ({ id: l2.id, name: l2.name, parentName: l1.name })))
  const out: Array<{ id: string; name: string; parentName: string }> = []
  for (let i = 0; out.length < MAX_CATEGORIES; i++) {
    let added = false
    for (const bucket of buckets) {
      if (bucket[i]) { out.push(bucket[i]); added = true }
      if (out.length >= MAX_CATEGORIES) break
    }
    if (!added) break
  }
  return out
}

function statsFromProbe(probe: CatalogProbe): { avgCostUsd: number; avgMarginPct: number; avgListedNum?: number } {
  const costs = probe.sample.map(s => s.costPrice).filter(c => c > 0)
  const avgCostUsd = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0
  // marge bij onze standaard prijszetting: verkoop = cost×0.92×2.8 (EUR)
  const avgMarginPct = avgCostUsd > 0 ? Math.round((1 - 1 / MARKUP) * 100) : 0
  const listed = probe.sample.map(s => s.listedNum).filter((n): n is number => n != null)
  return {
    avgCostUsd: Math.round(avgCostUsd * 100) / 100,
    avgMarginPct,
    avgListedNum: listed.length ? Math.round(listed.reduce((a, b) => a + b, 0) / listed.length) : undefined,
  }
}

/** Volledige catalogus-scan. Duurt ~30-60s door de 1 req/s CJ rate limit. */
export async function scanCatalog(onLog: (m: string) => void = m => console.log(`[niche-scan] ${m}`)): Promise<CategoryStats[]> {
  const adapter = cj()
  const tree = await adapter.getCategoryTree()
  const selected = selectCategories(tree)
  onLog(`categorie-boom: ${tree.length} hoofdcategorieën, ${selected.length} subcategorieën geselecteerd voor de scan`)

  const stats: CategoryStats[] = []
  for (const cat of selected) {
    try {
      const probe = await adapter.probeCategory({ categoryId: cat.id, countryCode: PRIMARY_WAREHOUSE })
      stats.push({
        categoryId: cat.id,
        name: cat.name,
        parentName: cat.parentName,
        totalDE: probe.total,
        ...statsFromProbe(probe),
        sampleTitles: probe.sample.slice(0, 5).map(s => s.title.slice(0, 70)),
      })
      onLog(`"${cat.parentName} › ${cat.name}": ${probe.total} producten (${PRIMARY_WAREHOUSE})`)
    } catch (err) {
      onLog(`probe "${cat.name}" mislukt: ${err instanceof Error ? err.message : err}`)
    }
  }

  // EU-spreiding: top-N breedste categorieën ook in een 2e warehouse meten
  const top = [...stats].sort((a, b) => b.totalDE - a.totalDE).slice(0, SPREAD_PROBES)
  for (const cat of top) {
    try {
      const probe = await adapter.probeCategory({ categoryId: cat.categoryId, countryCode: SPREAD_WAREHOUSE, pageSize: 1 })
      cat.totalSpread = probe.total
    } catch { /* spreiding is een bonus-signaal */ }
  }

  return stats
}

// ── LLM clustering → niche-suggesties ─────────────────────────────────────────

async function chatJson<T>(system: string, user: string, maxTokens = 3072): Promise<T> {
  const apiKey = process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('LLM_API_KEY niet geconfigureerd')
  const resp = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-chat',
      messages: [
        { role: 'system', content: `${system}\nAntwoord UITSLUITEND met geldige JSON.` },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!resp.ok) throw new Error(`LLM error ${resp.status}: ${(await resp.text()).slice(0, 160)}`)
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const match = (data.choices[0]?.message?.content ?? '').match(/[{[][\s\S]*[}\]]/)
  if (!match) throw new Error('LLM gaf geen JSON')
  return JSON.parse(match[0]) as T
}

function existingStoreNiches(): string[] {
  try {
    const rows = db.prepare(`SELECT DISTINCT niche FROM stores WHERE status IN ('local','live') AND niche IS NOT NULL`).all() as { niche: string }[]
    return rows.map(r => r.niche).filter(Boolean).slice(0, 20)
  } catch { return [] }
}

export async function generateNicheSuggestions(categories: CategoryStats[]): Promise<NicheSuggestion[]> {
  const usable = categories.filter(c => c.totalDE >= MIN_TOTAL_FOR_NICHE)
  const existing = existingStoreNiches()

  const compact = usable.map(c => ({
    category: `${c.parentName} › ${c.name}`,
    products: c.totalDE,
    alsoInFR: c.totalSpread,
    avgCostUsd: c.avgCostUsd,
    marginPct: c.avgMarginPct,
    avgListedByDropshippers: c.avgListedNum,
    examples: c.sampleTitles.slice(0, 3),
  }))

  const result = await chatJson<{ suggestions: Array<Omit<NicheSuggestion, 'id'>> }>(
    'Je bent een EU dropshipping strateeg. Je clustert supplier-categorieën met BEVESTIGDE voorraad tot samenhangende webshop-niches.',
    `CJ Dropshipping categorieën met gemeten EU-voorraad (DE warehouse, deels ook FR):
${JSON.stringify(compact, null, 1)}

${existing.length ? `Bestaande live stores (vermijd overlap): ${JSON.stringify(existing)}` : ''}

Maak 5-8 samenhangende NICHE-voorstellen voor een eigen webshop. Geen losse categorieën,
maar thema's die logisch bij elkaar horen (bv. "Home organization essentials",
"Pet travel accessories", "Desk & cable management"). Gebruik ALLEEN categorieën met
ruime voorraad hierboven. Per voorstel:
- "title": Engels, 2-5 woorden (wordt de store-niche)
- "rationale": 2-3 zinnen NEDERLANDS — waarom kansrijk (voorraad-breedte, marge, doelgroep, geen overlap)
- "estimatedProducts": som van de relevante categorie-aantallen (realistisch, geen fantasie)
- "exampleKeywords": 3-4 korte ENGELSE productzoektermen (concrete productnamen)
- "categories": welke input-categorieën dit thema dekken
- "persona": {"label","ageRange","interests":[],"buyingMotivation","problem","priceRange":{"min","max"},"tone"} — Nederlands, realistisch voor EU

JSON: {"suggestions":[{...}]}`,
  )

  return (result.suggestions ?? [])
    .filter(s => s.title && s.persona)
    .slice(0, 8)
    .map((s, i) => ({ ...s, id: `niche-${Date.now().toString(36)}-${i}`, exampleKeywords: s.exampleKeywords ?? [], categories: s.categories ?? [] }))
}

/** Deterministische fallback zonder LLM (mock-modus of LLM-storing). */
function fallbackSuggestions(categories: CategoryStats[]): NicheSuggestion[] {
  return categories
    .filter(c => c.totalDE >= MIN_TOTAL_FOR_NICHE)
    .sort((a, b) => b.totalDE - a.totalDE)
    .slice(0, 6)
    .map((c, i) => ({
      id: `niche-fb-${i}`,
      title: c.name,
      rationale: `${c.totalDE} producten op voorraad in het DE-warehouse (${c.parentName}), gem. marge ~${c.avgMarginPct}% bij standaard prijszetting.${c.totalSpread ? ` Ook ${c.totalSpread} in FR.` : ''}`,
      estimatedProducts: c.totalDE,
      exampleKeywords: [c.name.toLowerCase()],
      categories: [`${c.parentName} › ${c.name}`],
      persona: {
        label: `${c.name} kopers`, ageRange: '25-45', interests: [c.name.toLowerCase()],
        buyingMotivation: 'gemak en kwaliteit', problem: `zoekt betaalbare ${c.name.toLowerCase()} producten`,
        priceRange: { min: Math.max(10, Math.round(c.avgCostUsd * USD_TO_EUR * MARKUP * 0.7)), max: Math.max(25, Math.round(c.avgCostUsd * USD_TO_EUR * MARKUP * 1.4)) },
        tone: 'praktisch en direct',
      },
    }))
}

// ── Publieke API met cache + in-flight dedupe ──────────────────────────────────

let scanInFlight: Promise<NicheDiscoveryCache> | null = null

async function runFullScan(): Promise<NicheDiscoveryCache> {
  const adapter = cj()
  const source: 'cj' | 'mock' = adapter.isMock ? 'mock' : 'cj'
  const categories = await scanCatalog()
  let suggestions: NicheSuggestion[]
  try {
    suggestions = source === 'mock'
      ? fallbackSuggestions(categories)     // mock-data + LLM = schijnprecisie; deterministisch is eerlijker
      : await generateNicheSuggestions(categories)
    if (suggestions.length === 0) suggestions = fallbackSuggestions(categories)
  } catch (err) {
    console.warn('[niche-scan] LLM-clustering mislukt, deterministische fallback:', err instanceof Error ? err.message : err)
    suggestions = fallbackSuggestions(categories)
  }
  const cache: NicheDiscoveryCache = { scannedAt: new Date().toISOString(), source, categories, suggestions }
  cacheSet(cache)
  console.log(`[niche-scan] klaar: ${categories.length} categorieën gemeten, ${suggestions.length} niche-suggesties (bron: ${source})`)
  return cache
}

export interface NicheDiscoveryStatus {
  status: 'ready' | 'scanning' | 'stale-refreshing'
  scannedAt?: string
  source?: 'cj' | 'mock'
  suggestions: NicheSuggestion[]
}

/**
 * Suggesties ophalen. Cache < 24h → direct. Anders (of bij refresh=true) start
 * async een nieuwe scan; zolang die loopt krijg je de oude data (indien aanwezig)
 * met status 'stale-refreshing', of 'scanning' zonder data.
 */
export function getNicheSuggestions(opts: { refresh?: boolean } = {}): NicheDiscoveryStatus {
  const cached = cacheGet()
  const fresh = cached && (Date.now() - new Date(cached.scannedAt).getTime()) < CACHE_TTL_MS
    && cached.source === (cj().isMock ? 'mock' : 'cj')   // key gewijzigd? → mock-cache niet hergebruiken

  if (fresh && !opts.refresh) {
    return { status: 'ready', scannedAt: cached.scannedAt, source: cached.source, suggestions: cached.suggestions }
  }

  if (!scanInFlight) {
    scanInFlight = runFullScan().finally(() => { scanInFlight = null })
    scanInFlight.catch(err => console.error('[niche-scan] scan mislukt:', err))
  }

  if (cached) {
    return { status: 'stale-refreshing', scannedAt: cached.scannedAt, source: cached.source, suggestions: cached.suggestions }
  }
  return { status: 'scanning', suggestions: [] }
}
