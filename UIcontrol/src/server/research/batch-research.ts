// ═══════ Offline batch-onderzoek over de CJ-catalogus ═══════
//
// Ploegt categorie voor categorie door de catalogus en legt per levensvatbare
// categorie een compleet assortiment vast als herbruikbare PRESET.
//
// Waarom offline: de wizard stelt nu bij élke run live een assortiment samen —
// onder tijdsdruk, tegen de rate limit aan, met LLM-calls in het kritieke pad.
// Hier is er geen haast, dus mag het grondig: élk producttype wordt doorzocht,
// inclusief de alternatieve zoekterm, zonder vroegtijdig stoppen.
//
// Drie dingen die dit proces anders maken dan een wizard-run:
//   1. RUSTIG. Een batch raakt tientallen keren meer calls dan één wizard-run.
//      De tussenruimte tussen CJ-calls gaat omhoog (default 2.5s) en er is een
//      harde call-begroting. Liever een uur langer dan een dag geblokkeerd.
//   2. HERVATBAAR. Elke categorie wordt apart weggeschreven (preset óf skip met
//      reden), dus een afgebroken run hoeft niet overnieuw.
//   3. EERLIJK. Levert een categorie na grondig zoeken geen 7 goede producten
//      op, dan komt er GEEN preset — er wordt niets opgevuld om het aantal te
//      halen. De reden wordt vastgelegd.

import { getSupplier } from '../suppliers/index.js'
import type { CJAdapter } from '../suppliers/cj-adapter.js'
import { setBaseSpacing, restoreBaseSpacing, getCjSearchStats, resetCjSearchStats } from '../suppliers/cj-adapter.js'
import { scanCatalog, type CategoryStats } from '../niche-discovery.js'
import { generateProductTypes, type ProductType } from '../suppliers/product-types.js'
import { buildAssortment, type AssortmentPick } from '../suppliers/assortment.js'
import { priceAssortment, applyPricing } from '../suppliers/pricing.js'
import { hardDisqualification } from '../suppliers/product-relevance.js'
import { savePreset, recordSkip, alreadyHandled, type PresetProduct } from './preset-store.js'

const LLM_BASE = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1'

/** Onder dit aantal producten wereldwijd is een categorie te schraal. */
const MIN_CATEGORY_TOTAL = 25

export interface BatchOptions {
  /** Hoeveel level-2 categorieën deze run bekijkt. */
  maxCategories?: number
  minProducts?: number
  maxProducts?: number
  /** Kandidaten per producttype. Offline mag dit ruimer dan live. */
  perTypeCandidates?: number
  /** Tussenruimte tussen CJ-calls in ms. Default 2500 — bewust traag. */
  spacingMs?: number
  /** Harde bovengrens op CJ-calls voor deze run. */
  maxCalls?: number
  /** Categorieën die al een preset/skip hebben tóch opnieuw doen. */
  refresh?: boolean
  onLog?: (m: string) => void
  /** Zet `.aborted` op true om netjes te stoppen na de huidige categorie. */
  signal?: { aborted: boolean }
}

export interface BatchEntry {
  categoryId: string
  categoryName: string
  status: 'preset' | 'skipped' | 'failed' | 'overgeslagen'
  niche?: string
  products?: number
  distinctTypes?: number
  reason?: string
}

export interface BatchResult {
  startedAt: string
  durationMs: number
  scanned: number
  presets: number
  skipped: number
  failed: number
  cjCalls: number
  /** true = gedraaid tegen mock-data; die presets zijn niet productiewaardig. */
  isMock: boolean
  budgetExhausted: boolean
  aborted: boolean
  entries: BatchEntry[]
}

// ── LLM-helper (zelfde patroon als wizard.ts/niche-discovery.ts) ──────────────

async function chatJson<T>(system: string, user: string, maxTokens = 2048, temperature = 0.4): Promise<T> {
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
      max_tokens: maxTokens, temperature,
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 160)}`)
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content ?? ''
  const m = content.match(/[{[][\s\S]*[}\]]/)
  if (!m) throw new Error('LLM gaf geen JSON terug')
  return JSON.parse(m[0]) as T
}

// ── Categorie → nichebeschrijving ─────────────────────────────────────────────

export interface CategoryBrief {
  /** Het winkel-label: mag een doelgroep bevatten ("women's baseball caps"). */
  niche: string
  /**
   * Waarmee er bij de leverancier GEZOCHT wordt — het kale productzelfstandig
   * naamwoord, zonder doelgroep-bepaling ("baseball caps").
   *
   * Waarom die splitsing: de eerste VPS-run zocht letterlijk op "women's
   * baseball cap". CJ matcht op de productnaam, en de meeste petten in de
   * catalogus vermelden helemaal geen doelgroep — die vielen dus buiten de
   * zoekopdracht nog vóór er iets beoordeeld kon worden. De doelgroep hoort
   * thuis in de BEOORDELING (en sinds 1 augustus 2026 in de harde poort), niet
   * in de zoekterm. Breed zoeken, streng poorten.
   */
  searchNiche: string
  problem: string
  rationale: string
  keywords: string[]
  persona: {
    label: string
    ageRange: string
    interests: string[]
    buyingMotivation: string
    problem: string
    priceRange: { min: number; max: number }
    tone?: string
  }
}

/**
 * Haalt de doelgroep-bepaling uit een niche-label weg, zodat er breed gezocht
 * kan worden. "women's baseball caps" → "baseball caps".
 *
 * Deterministisch en klein: dit is een vangnet voor als de LLM zelf geen
 * `searchNiche` teruggeeft, geen vervanging van zijn oordeel.
 */
export function stripAudienceQualifier(niche: string): string {
  const stripped = niche
    .replace(/\b(women|woman|women's|womens|ladies|lady|female|girls?|men|man|men's|mens|male|boys?|kids?|children|childrens|children's|unisex|adults?)\b['’]?s?\s+/gi, '')
    .replace(/\bfor (women|men|kids|children|adults|her|him|boys|girls)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // Nooit alles wegstrippen: dan blijft er geen zoekterm over.
  return stripped.length >= 3 ? stripped : niche
}

/** Deterministische terugval als er geen LLM is — bewust mager en herkenbaar. */
export function fallbackBrief(cat: CategoryStats): CategoryBrief {
  const price = Math.max(15, Math.round(cat.avgCostUsd * 0.92 * 2.8))
  return {
    niche: cat.name.toLowerCase(),
    searchNiche: stripAudienceQualifier(cat.name.toLowerCase()),
    problem: `Kopers zoeken betrouwbare ${cat.name.toLowerCase()} zonder wekenlange levertijd.`,
    rationale: `Afgeleid zonder LLM: categorie "${cat.parentName} › ${cat.name}" heeft ${cat.totalAll} producten wereldwijd, waarvan ${cat.totalEU} snel leverbaar uit de EU.`,
    keywords: cat.name.toLowerCase().split(/\s+/).filter(w => w.length > 2),
    persona: {
      label: `${cat.name} koper`,
      ageRange: '25-45',
      interests: [cat.name.toLowerCase(), cat.parentName.toLowerCase()],
      buyingMotivation: 'gemak',
      problem: `Betrouwbare ${cat.name.toLowerCase()} vinden die snel geleverd wordt.`,
      priceRange: { min: Math.max(10, Math.round(price * 0.6)), max: Math.round(price * 1.8) },
    },
  }
}

export async function describeCategory(cat: CategoryStats): Promise<{ brief: CategoryBrief; viaLlm: boolean }> {
  try {
    const raw = await chatJson<CategoryBrief>(
      'Je bent een e-commerce strateeg die een leverancierscategorie vertaalt naar een concrete webwinkel met een echte doelgroep.',
      `Leverancierscategorie: "${cat.parentName} › ${cat.name}"
Aanbod: ${cat.totalAll} producten wereldwijd, ${cat.totalEU} in het Duitse EU-warehouse (${cat.shippingProfile}).
Gemiddelde inkoopprijs: USD ${cat.avgCostUsd}.
Voorbeeldtitels uit deze categorie:
${cat.sampleTitles.map(t => `- ${t}`).join('\n')}

Maak hier één scherpe winkel van. Geen brede "alles voor X"-winkel maar een
afgebakende niche met een herkenbare koper.

- "niche": ENGELS, 2-5 woorden, wat de winkel verkoopt ("dog collars and leashes").
  Een doelgroep mag hierin ("women's baseball caps") als de categorie dat vraagt.
- "searchNiche": hetzelfde, maar ZONDER doelgroep-bepaling — alleen waar het
  product IS ("baseball caps"). Hiermee wordt er bij de leverancier gezocht.
  Leveranciers zetten zelden "women's" in de productnaam, dus zoeken mét die
  bepaling laat het grootste deel van de catalogus links liggen. De doelgroep
  wordt later alsnog streng getoetst; de zoekterm moet juist breed zijn.
- "problem": Nederlands, één zin: welk probleem lost deze winkel op?
- "rationale": Nederlands, 2-3 zinnen: waarom vormen deze producten samen een
  logische winkel, en voor wie? Dit is de onderbouwing die een mens leest.
- "keywords": 5-8 Engelse trefwoorden waarmee iemand deze winkel zou omschrijven.
- "persona": doelgroepprofiel; prijsklasse realistisch bij een inkoop van USD ${cat.avgCostUsd}
  (verkoop ≈ 2.8× inkoop in euro's).

JSON:
{"niche":"...","problem":"...","rationale":"...","keywords":["..."],
 "persona":{"label":"...","ageRange":"25-45","interests":["..."],"buyingMotivation":"...","problem":"...","priceRange":{"min":20,"max":60},"tone":"..."}}`,
      1536, 0.6,
    )
    if (raw?.niche && raw?.persona?.label) {
      return {
        brief: {
          niche: String(raw.niche).trim(),
          problem: String(raw.problem ?? '').trim(),
          rationale: String(raw.rationale ?? '').trim(),
          keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String).slice(0, 8) : [],
          persona: raw.persona,
        },
        viaLlm: true,
      }
    }
  } catch (err) {
    console.warn(`[batch] nichebeschrijving via LLM mislukt voor "${cat.name}":`, err instanceof Error ? err.message : err)
  }
  return { brief: fallbackBrief(cat), viaLlm: false }
}

// ── De run ────────────────────────────────────────────────────────────────────

export async function runBatchResearch(opts: BatchOptions = {}): Promise<BatchResult> {
  const log = opts.onLog ?? (m => console.log(`[batch] ${m}`))
  const min = opts.minProducts ?? 7
  const max = opts.maxProducts ?? 15
  const perType = opts.perTypeCandidates ?? 8
  const maxCalls = opts.maxCalls ?? 2000
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  const adapter = getSupplier('cj') as CJAdapter
  const isMock = adapter.isMock
  if (isMock) {
    log('⚠ CJ draait in MOCK-modus. De presets uit deze run worden gemarkeerd als mock')
    log('  en worden NOOIT aan een echte wizard-run geserveerd. Voor bruikbare presets')
    log('  moet dit op de VPS draaien met een geldige CJ_API_KEY.')
  }

  setBaseSpacing(opts.spacingMs ?? 2500)
  resetCjSearchStats()
  const entries: BatchEntry[] = []
  let presets = 0, skipped = 0, failed = 0
  let budgetExhausted = false

  const judge = (system: string, user: string) => chatJson<unknown>(system, user, 3072, 0.3)

  try {
    log(`catalogus scannen (max ${opts.maxCategories ?? 24} categorieën)…`)
    const cats = await scanCatalog(m => log(`  ${m}`), { maxCategories: opts.maxCategories })
    log(`${cats.length} categorieën gemeten`)

    for (const cat of cats) {
      if (opts.signal?.aborted) { log('afgebroken op verzoek'); break }
      if (getCjSearchStats().listCalls >= maxCalls) {
        log(`call-begroting bereikt (${maxCalls}) — de rest blijft staan voor een volgende run`)
        budgetExhausted = true
        break
      }
      if (!opts.refresh && alreadyHandled(cat.categoryId)) {
        entries.push({ categoryId: cat.categoryId, categoryName: cat.name, status: 'overgeslagen', reason: 'recent al behandeld' })
        continue
      }
      if (cat.totalAll < MIN_CATEGORY_TOTAL) {
        const reason = `te weinig aanbod: ${cat.totalAll} producten wereldwijd (drempel ${MIN_CATEGORY_TOTAL})`
        recordSkip(cat.categoryId, cat.name, reason, 0, isMock)
        entries.push({ categoryId: cat.categoryId, categoryName: cat.name, status: 'skipped', reason })
        skipped++
        continue
      }

      try {
        log(`── ${cat.parentName} › ${cat.name} (${cat.totalAll} producten, ${cat.shippingProfile})`)
        const { brief, viaLlm } = await describeCategory(cat)
        log(`   niche: "${brief.niche}"${viaLlm ? '' : ' (deterministisch afgeleid — geen LLM)'}`)

        let types: ProductType[] = []
        try {
          const gen = await generateProductTypes(brief.niche, brief.persona, judge, { onLog: m => log(`   ${m}`) })
          types = gen.types
        } catch (err) {
          log(`   producttypes mislukt: ${err instanceof Error ? err.message : err}`)
        }
        if (types.length <= 1) {
          const reason = 'geen bruikbare producttype-lijst (LLM niet beschikbaar of te weinig types)'
          recordSkip(cat.categoryId, cat.name, reason, 0, isMock)
          entries.push({ categoryId: cat.categoryId, categoryName: cat.name, status: 'skipped', niche: brief.niche, reason })
          skipped++
          continue
        }

        // Grondig zoeken: geen `minResults`, dus álle warehouse-passes per term.
        const result = await buildAssortment({
          niche: brief.niche,
          persona: brief.persona,
          types,
          min, max,
          perTypeCandidates: perType,
          judge,
          search: (term, maxResults) => adapter.searchProducts(term, { maxResults }),
          onLog: m => log(`   ${m}`),
        })

        // Vangnet: de poorten draaien al in scoreRelevance, maar een preset gaat
        // hierna ongezien naar honderden winkels. Dubbel controleren is goedkoop.
        const personaText = `${brief.persona.label} ${brief.persona.interests.join(' ')} ${brief.persona.problem}`
        const clean: AssortmentPick[] = []
        for (const pick of result.picks) {
          const dq = hardDisqualification(brief.niche, pick.product, { personaText })
          if (dq.rejected) { log(`   ✗ alsnog geweerd: ${pick.product.title.slice(0, 50)} — ${dq.reason}`); continue }
          clean.push(pick)
        }

        if (clean.length < min) {
          const reason = result.shortfall
            ?? `slechts ${clean.length} passende producten (drempel ${min}) — geen preset, niets opgevuld`
          recordSkip(cat.categoryId, cat.name, reason, clean.length, isMock)
          entries.push({ categoryId: cat.categoryId, categoryName: cat.name, status: 'skipped', niche: brief.niche, products: clean.length, reason })
          skipped++
          log(`   → GEEN preset: ${reason}`)
          continue
        }

        const priced = await priceAssortment(brief.niche, brief.persona, clean, judge)
        const products: PresetProduct[] = clean.map(pick => {
          const money = applyPricing(pick, priced)
          const p = pick.product
          return {
            productId: p.productId, variantId: p.variantId, supplier: p.supplier,
            title: p.title, image: p.image, costPrice: p.costPrice, currency: p.currency,
            warehouse: p.warehouse, shippingDays: p.shippingDays, rating: p.rating,
            inventory: p.inventory, url: p.url,
            productType: pick.typeName, productTier: pick.tier, typeRole: pick.typeRole,
            relevanceScore: pick.score, relevanceReason: pick.reason,
            ...money,
          }
        })

        const distinct = new Set(products.map(p => p.productType)).size
        const preset = savePreset({
          niche: brief.niche,
          categoryId: cat.categoryId, categoryName: cat.name, parentName: cat.parentName,
          persona: brief.persona as unknown as Record<string, unknown>,
          products,
          types: result.types.map(t => ({ id: t.id, name: t.name, searchTerm: t.searchTerm, tier: t.tier, role: t.role })),
          rationale: brief.rationale || `Assortiment van ${products.length} producten over ${distinct} producttypes uit "${cat.parentName} › ${cat.name}".`,
          problem: brief.problem,
          keywords: [...new Set([...brief.keywords, ...products.map(p => p.productType)])],
          shippingProfile: cat.shippingProfile,
          source: 'batch',
          isMock,
        })
        presets++
        entries.push({
          categoryId: cat.categoryId, categoryName: cat.name, status: 'preset',
          niche: brief.niche, products: products.length, distinctTypes: distinct,
        })
        log(`   → PRESET "${preset.slug}": ${products.length} producten, ${distinct} types, gem. score ${preset.avgScore ?? '—'}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failed++
        entries.push({ categoryId: cat.categoryId, categoryName: cat.name, status: 'failed', reason: msg })
        log(`   ✗ mislukt: ${msg}`)
      }
    }
  } finally {
    restoreBaseSpacing()
  }

  const res: BatchResult = {
    startedAt,
    durationMs: Date.now() - t0,
    scanned: entries.length,
    presets, skipped, failed,
    cjCalls: getCjSearchStats().listCalls,
    isMock,
    budgetExhausted,
    aborted: !!opts.signal?.aborted,
    entries,
  }
  log(`klaar: ${presets} presets, ${skipped} overgeslagen, ${failed} mislukt, ${res.cjCalls} CJ-calls in ${Math.round(res.durationMs / 1000)}s${isMock ? ' (MOCK)' : ''}`)
  return res
}
