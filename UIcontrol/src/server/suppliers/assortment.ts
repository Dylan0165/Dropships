// ═══════ Assortiment samenstellen ═══════
// Doorzoekt ELK producttype uit product-types.ts en bouwt daarmee een collectie
// van 7-15 VERSCHILLENDE producten.
//
// Wat hier bewust NIET gebeurt: aanvullen tot een quotum. Levert het assortiment
// er maar vijf op, dan zijn het er vijf en zegt `shortfall` waarom. De oude
// aanpak — dezelfde producten dupliceren met een `--v1`-suffix, of doorzoeken
// stoppen na het eerste type — gaf winkels die er vol uitzagen maar het niet
// waren.
//
// Efficiëntie is hier een ontwerp-eis, geen bijzaak: 12 types × 8 warehouse-calls
// zou ruim anderhalve minuut aan CJ-rate-limit kosten. Daarom per type een kleine
// `maxResults` (de adapter stopt dan al na de eerste pass) en één gedeelde
// scoring-call over alle kandidaten in plaats van één per type.

import type { SupplierProduct } from './types.js'
import { scoreRelevance, type RelevanceVerdict, type RelevanceContext } from './product-relevance.js'
import {
  generateProductTypes, expandProductTypes,
  type ProductType, type PriceTier, type TypeJudge, type TypeContext,
} from './product-types.js'

export const ASSORTMENT_MIN = 7
export const ASSORTMENT_MAX = 15

export interface AssortmentPick {
  product: SupplierProduct
  typeId: string
  typeName: string
  tier: PriceTier
  /** Semantische score uit product-relevance.ts (leeg als die stap oversloeg). */
  score?: number
  reason?: string
}

/** Wat één producttype opleverde — de basis van de log en van eerlijke feedback. */
export interface TypeAttempt {
  typeId: string
  name: string
  /** Zoektermen die daadwerkelijk naar de leverancier gingen. */
  terms: string[]
  candidates: number
  chosen?: { productId: string; title: string; score?: number }
  note?: string
}

export interface AssortmentResult {
  picks: AssortmentPick[]
  /** Alle types die geprobeerd zijn, inclusief de uitbreidingsronde. */
  types: ProductType[]
  attempts: TypeAttempt[]
  verdicts: RelevanceVerdict[]
  /** Aantal zoekopdrachten richting de leverancier (1 term = 1 zoekopdracht). */
  searchCalls: number
  /** Eerlijke melding als er minder dan `min` distincte producten zijn. */
  shortfall?: string
  relevanceSkipped?: string
  typesFallback?: string
}

export type SearchFn = (term: string, maxResults: number) => Promise<SupplierProduct[]>

export interface AssortmentOptions {
  niche: string
  persona: TypeContext & RelevanceContext
  search: SearchFn
  judge: TypeJudge
  min?: number
  max?: number
  /** Kandidaten die één zoekterm mag opleveren. Klein = minder API-calls. */
  perTypeCandidates?: number
  /** Vooraf bepaalde types (test/hergebruik); leeg = via de LLM. */
  types?: ProductType[]
  onLog?: (m: string) => void
}

/** EU-voorraad eerst bij gelijke score — sneller bij de klant. */
const EU = new Set(['DE', 'NL', 'FR', 'IT', 'ES', 'PL', 'CZ'])
function euFirst(a: SupplierProduct, b: SupplierProduct): number {
  const ea = EU.has((a.warehouse ?? '').toUpperCase()) ? 0 : 1
  const eb = EU.has((b.warehouse ?? '').toUpperCase()) ? 0 : 1
  return ea - eb
}

export async function buildAssortment(opts: AssortmentOptions): Promise<AssortmentResult> {
  const min = opts.min ?? ASSORTMENT_MIN
  const max = opts.max ?? ASSORTMENT_MAX
  const perType = opts.perTypeCandidates ?? 4
  const log = opts.onLog ?? ((m: string) => console.log(m))

  // ── 1. Producttypes ─────────────────────────────────────────────────────────
  let types: ProductType[] = opts.types ?? []
  let typesFallback: string | undefined
  if (types.length === 0) {
    const gen = await generateProductTypes(opts.niche, opts.persona, opts.judge, { onLog: log })
    types = gen.types
    typesFallback = gen.fallback
  }

  const picks: AssortmentPick[] = []
  const attempts: TypeAttempt[] = []
  const verdicts: RelevanceVerdict[] = []
  const takenProducts = new Set<string>()
  const perTypeCount = new Map<string, number>()
  /** Kandidaten die de poort haalden maar (nog) niet gekozen zijn. */
  const leftovers: Array<{ p: SupplierProduct; t: ProductType; score?: number; reason?: string }> = []
  let searchCalls = 0
  let relevanceSkipped: string | undefined

  // ── 2. Eén ronde: zoeken → scoren → per type de beste kiezen ────────────────
  const runRound = async (batch: ProductType[], roundLabel: string): Promise<void> => {
    if (batch.length === 0) return
    log(`[assortiment] ${roundLabel}: ${batch.length} producttype(s) doorzoeken`)

    // 2a. Zoeken per type. Levert de eerste term iets op, dan gaan we NIET ook
    // de alternatieve term proberen — dat is de goedkoopste besparing die er is.
    const found = new Map<string, SupplierProduct[]>()
    for (const t of batch) {
      if (picks.length >= max) {
        attempts.push({ typeId: t.id, name: t.name, terms: [], candidates: 0, note: 'overgeslagen — collectie al vol' })
        continue
      }
      const terms = [t.searchTerm, t.altTerm].filter((x): x is string => !!x)
      const used: string[] = []
      let hits: SupplierProduct[] = []
      for (const term of terms) {
        used.push(term)
        searchCalls++
        try {
          const res = await opts.search(term, perType)
          hits = res.filter(p => !takenProducts.has(p.productId))
        } catch (err) {
          log(`[assortiment]   ✗ ${t.name}: zoekopdracht "${term}" mislukt — ${err instanceof Error ? err.message : err}`)
          hits = []
        }
        if (hits.length > 0) break
      }
      found.set(t.id, hits)
      attempts.push({
        typeId: t.id, name: t.name, terms: used, candidates: hits.length,
        note: hits.length === 0 ? 'geen kandidaten bij de leverancier' : undefined,
      })
      log(`[assortiment]   ${hits.length > 0 ? '·' : '✗'} ${t.name} [${t.tier}] — ${used.map(x => `"${x}"`).join(' → ')} → ${hits.length} kandidaat(en)`)
    }

    // 2b. Eén scoring-call over alle kandidaten van deze ronde. Per type scoren
    // zou ~12 LLM-calls kosten voor exact dezelfde uitkomst.
    const flat: SupplierProduct[] = []
    const typeOf = new Map<string, ProductType>()
    for (const t of batch) {
      for (const p of found.get(t.id) ?? []) {
        if (typeOf.has(p.productId)) continue
        typeOf.set(p.productId, t)
        flat.push(p)
      }
    }
    if (flat.length === 0) return

    const rel = await scoreRelevance(opts.niche, opts.persona, flat, opts.judge, { onLog: log })
    verdicts.push(...rel.verdicts)
    if (rel.skipped) relevanceSkipped = rel.skipped
    const byId = new Map(rel.verdicts.map(v => [v.productId, v]))
    // Sloeg de beoordeling over (geen key / time-out), dan blijft alles staan.
    const acceptedIds = rel.verdicts.length > 0
      ? new Set(rel.verdicts.filter(v => v.accepted).map(v => v.productId))
      : new Set(flat.map(p => p.productId))

    // 2c. Per type de best scorende kandidaat. Eén product per type: tien bijna
    // identieke blenders is geen assortiment.
    for (const t of batch) {
      if (picks.length >= max) break
      const ranked = (found.get(t.id) ?? [])
        .filter(p => acceptedIds.has(p.productId) && !takenProducts.has(p.productId))
        .sort((a, b) => ((byId.get(b.productId)?.score ?? 0) - (byId.get(a.productId)?.score ?? 0)) || euFirst(a, b))
      const best = ranked[0]
      const attempt = attempts.find(x => x.typeId === t.id)
      if (!best) {
        if (attempt && (found.get(t.id) ?? []).length > 0) attempt.note = 'kandidaten haalden de relevantie-drempel niet'
        continue
      }
      const v = byId.get(best.productId)
      picks.push({ product: best, typeId: t.id, typeName: t.name, tier: t.tier, score: v?.score, reason: v?.reason })
      takenProducts.add(best.productId)
      perTypeCount.set(t.id, 1)
      if (attempt) attempt.chosen = { productId: best.productId, title: best.title, score: v?.score }
      for (const rest of ranked.slice(1)) {
        leftovers.push({ p: rest, t, score: byId.get(rest.productId)?.score, reason: byId.get(rest.productId)?.reason })
      }
    }
  }

  await runRound(types, 'ronde 1')

  // ── 3. Te weinig? Eerst extra TYPES vragen, nooit duplicaten maken ──────────
  if (picks.length < min) {
    const needed = min - picks.length
    log(`[assortiment] ${picks.length}/${min} distincte producten na ronde 1 — extra producttypes opvragen (nooit duplicaten)`)
    const extra = await expandProductTypes(opts.niche, opts.persona, types, opts.judge, needed + 3, { onLog: log })
    if (extra.length > 0) {
      types = [...types, ...extra]
      await runRound(extra, 'ronde 2 (uitbreiding)')
    }
  }

  // ── 4. Nog steeds te weinig? Dan een tweede prijsvariant per type ───────────
  // Dit is geen opvulling met duplicaten: het is een ANDER product uit hetzelfde
  // type, met een duidelijk andere prijs (instap náást premium). Max 2 per type.
  if (picks.length < min && leftovers.length > 0) {
    const ranked = [...leftovers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    for (const l of ranked) {
      if (picks.length >= min) break
      if (takenProducts.has(l.p.productId)) continue
      if ((perTypeCount.get(l.t.id) ?? 0) >= 2) continue
      const first = picks.find(x => x.typeId === l.t.id)?.product
      // Prijsverschil ≥25% → het is echt een instap- of topvariant, geen kloon
      if (first && first.costPrice > 0) {
        const diff = Math.abs(l.p.costPrice - first.costPrice) / first.costPrice
        if (diff < 0.25) continue
      }
      picks.push({ product: l.p, typeId: l.t.id, typeName: l.t.name, tier: l.t.tier, score: l.score, reason: l.reason })
      takenProducts.add(l.p.productId)
      perTypeCount.set(l.t.id, (perTypeCount.get(l.t.id) ?? 0) + 1)
      log(`[assortiment]   + tweede prijsvariant voor ${l.t.name}: ${l.p.title.slice(0, 50)}`)
    }
  }

  // ── 5. Eerlijke uitkomst ────────────────────────────────────────────────────
  const distinctTypes = new Set(picks.map(p => p.typeId)).size
  let shortfall: string | undefined
  if (picks.length < min) {
    const leeg = attempts.filter(a => a.candidates === 0).length
    const afgewezen = attempts.filter(a => a.candidates > 0 && !a.chosen).length
    shortfall = `Slechts ${picks.length} passende producten gevonden (streefgetal ${min}-${max}) over ${types.length} producttypes: ` +
      `${leeg} type(s) zonder kandidaten bij de leverancier, ${afgewezen} type(s) waarvan de kandidaten de relevantie-drempel niet haalden. ` +
      'Er zijn bewust geen duplicaten of half-passende producten toegevoegd om het aantal te halen.'
    log(`[assortiment] ⚠ ${shortfall}`)
  }
  log(`[assortiment] resultaat: ${picks.length} producten over ${distinctTypes} distincte types, ${searchCalls} zoekopdrachten, ${types.length} types geprobeerd`)
  for (const p of picks) {
    log(`[assortiment]   ✓ ${p.typeName.padEnd(22)} ${p.score != null ? `${String(p.score).padStart(2)}/10` : '  —  '}  ${p.product.title.slice(0, 60)}`)
  }

  return {
    picks: picks.slice(0, max), types, attempts, verdicts, searchCalls,
    shortfall, relevanceSkipped, typesFallback,
  }
}
