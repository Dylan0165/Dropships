// ═══════ Semantische relevantie-beoordeling ═══════
// Tweede laag bovenop `isRelevantToQuery` uit cj-adapter.ts. Die eerste laag is
// een woord-filter: hij weet of er een relevant wóórd in de titel staat, niet of
// het product qua uitstraling, prijsklasse en doelgroep bij de niche past.
//
// Deze laag legt elke kandidaat aan de LLM voor en vraagt om een cijfer met een
// reden. Producten onder de drempel gaan er automatisch uit — ze worden niet
// alleen gemarkeerd. Alle scores worden gelogd, ook die van afgewezen producten,
// zodat achteraf te zien is waaróm iets sneuvelde.

import type { SupplierProduct } from './types.js'

export const RELEVANCE_THRESHOLD = 6

export interface RelevanceVerdict {
  productId: string
  title: string
  /** 1-10; hoger is beter passend. */
  score: number
  /** Eén zin Nederlands, voor de operator. */
  reason: string
  accepted: boolean
}

export interface RelevanceResult {
  kept: SupplierProduct[]
  verdicts: RelevanceVerdict[]
  /** Gevuld als de beoordeling niet kon draaien; dan is er niets weggegooid. */
  skipped?: string
}

export interface RelevanceContext {
  label?: string
  interests?: string[]
  problem?: string
  priceRange?: { min: number; max: number }
}

/** De LLM-aanroep; injecteerbaar zodat de logica zonder API-key testbaar is. */
export type RelevanceJudge = (
  system: string,
  user: string,
) => Promise<{ scores?: Array<{ id: string; score: number; reason: string }> }>

const USD_TO_EUR = 0.92

function compact(p: SupplierProduct) {
  return {
    id: p.productId,
    title: p.title.slice(0, 110),
    description: (p.description ?? '').slice(0, 160),
    category: p.category ?? '',
    priceEur: Math.round(p.costPrice * USD_TO_EUR * 2.8 * 100) / 100,
    warehouse: p.warehouse ?? '',
  }
}

/**
 * Beoordeelt alle kandidaten en geeft alleen de passende terug.
 *
 * Faalt de LLM (geen key, time-out, onbruikbaar antwoord), dan wordt er
 * **niets** weggegooid: liever alle kandidaten tonen met een duidelijke melding
 * dan stilzwijgend de halve lijst laten verdwijnen om een reden die niemand kan
 * nakijken. `skipped` vertelt dan waarom.
 */
export async function scoreRelevance(
  niche: string,
  persona: RelevanceContext,
  candidates: SupplierProduct[],
  judge: RelevanceJudge,
  opts: { threshold?: number; onLog?: (m: string) => void } = {},
): Promise<RelevanceResult> {
  const threshold = opts.threshold ?? RELEVANCE_THRESHOLD
  const log = opts.onLog ?? ((m: string) => console.log(m))
  if (candidates.length === 0) return { kept: [], verdicts: [] }

  const priceHint = persona.priceRange
    ? `De doelgroep koopt in de prijsklasse EUR ${persona.priceRange.min}-${persona.priceRange.max}.`
    : ''

  let raw: Awaited<ReturnType<RelevanceJudge>>
  try {
    raw = await judge(
      'Je beoordeelt of producten passen bij een webshop-niche. Je bent streng: een product dat toevallig een woord deelt met de niche past nog niet.',
      `Niche: "${niche}"
Doelgroep: ${JSON.stringify({ label: persona.label, interests: persona.interests, problem: persona.problem })}
${priceHint}

Geef ELK product hieronder een score van 1 tot 10 voor hoe goed het bij deze niche past.
Weeg mee: is dit werkelijk een product uit deze productcategorie, past de uitstraling
bij de doelgroep, en zit de prijs in de juiste klasse?

Richtlijn:
  9-10 = precies waarvoor de klant komt
  7-8  = past goed, logische aanvulling op het assortiment
  6    = randgeval, verdedigbaar
  3-5  = zelfde thema maar een ander soort product
  1-2  = hoort hier niet, deelt hooguit een woord met de niche

Wees streng bij 6 en lager. Een ventilator in een blender-winkel is een 1, ook al
zijn beide "portable".

Producten:
${JSON.stringify(candidates.map(compact))}

JSON formaat:
{"scores":[{"id":"<product id>","score":8,"reason":"1 korte zin Nederlands"}]}`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`[relevance] beoordeling overgeslagen (${msg}) — alle ${candidates.length} kandidaten blijven staan`)
    return { kept: candidates, verdicts: [], skipped: msg }
  }

  const byId = new Map((raw.scores ?? []).map(s => [String(s.id), s]))
  if (byId.size === 0) {
    log(`[relevance] LLM gaf geen bruikbare scores — alle ${candidates.length} kandidaten blijven staan`)
    return { kept: candidates, verdicts: [], skipped: 'geen scores in het antwoord' }
  }

  const verdicts: RelevanceVerdict[] = []
  const kept: SupplierProduct[] = []
  for (const p of candidates) {
    const s = byId.get(p.productId)
    // Niet beoordeeld → laten staan. Een product laten vallen omdat de LLM het
    // vergat is erger dan een randgeval doorlaten; de operator ziet het toch.
    const score = s ? Math.max(1, Math.min(10, Math.round(Number(s.score) || 0))) : threshold
    const reason = s?.reason?.trim() || (s ? '' : 'niet beoordeeld — behouden')
    const accepted = score >= threshold
    verdicts.push({ productId: p.productId, title: p.title, score, reason, accepted })
    if (accepted) kept.push(p)
  }

  const rejected = verdicts.filter(v => !v.accepted)
  log(`[relevance] "${niche}": ${kept.length}/${candidates.length} kandidaten gehouden (drempel ${threshold})`)
  for (const v of verdicts.sort((a, b) => b.score - a.score)) {
    log(`[relevance]   ${v.accepted ? '✓' : '✗'} ${String(v.score).padStart(2)}/10  ${v.title.slice(0, 60)} — ${v.reason}`)
  }
  if (rejected.length) {
    log(`[relevance] ${rejected.length} afgewezen: ${rejected.map(v => `${v.title.slice(0, 30)} (${v.score})`).join(', ')}`)
  }

  return { kept, verdicts }
}
