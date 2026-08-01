// ═══════ Preset zoeken bij een niche ═══════
//
// Twee lagen, in deze volgorde:
//
//   1. Lexicaal — woordoverlap tussen de ingetypte niche/persona en de preset
//      (niche-label, trefwoorden, producttypes). Gratis, geen LLM, en genoeg
//      voor het geval dat iemand "dog collars" typt terwijl de preset
//      "dog collars and leashes" heet.
//   2. Semantisch — de wizard-input is vaak NEDERLANDS ("hondenriemen") en de
//      presets zijn Engels. Daar loopt laag 1 op stuk. Eén kleine LLM-call
//      krijgt de tien beste kandidaten (alleen labels, geen producten) en kiest.
//
// Faalt laag 2 of is er geen key, dan telt alleen laag 1. Bij twijfel geen
// preset: dan draait de live-flow, en dat is precies het vangnet dat blijft
// bestaan.

import { listPresets, type NichePreset } from './preset-store.js'

/** Drempel waarboven een lexicale match op zichzelf overtuigend is. */
export const DIRECT_MATCH_SCORE = 0.55
/** Daaronder mag de LLM meekijken; nog lager komt hij niet eens in aanmerking. */
export const CANDIDATE_MATCH_SCORE = 0.18

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'your', 'you', 'our', 'een', 'het', 'van',
  'voor', 'met', 'die', 'dat', 'the', 'shop', 'store', 'winkel', 'webshop',
  'producten', 'products', 'spullen', 'gear', 'stuff', 'accessories', 'accessoires',
])

function tokens(s: string): string[] {
  return s.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
}

export interface MatchContext {
  niche: string
  personaLabel?: string
  interests?: string[]
  problem?: string
}

function queryTokens(ctx: MatchContext): string[] {
  return [...new Set(tokens([
    ctx.niche, ctx.personaLabel ?? '', (ctx.interests ?? []).join(' '), ctx.problem ?? '',
  ].join(' ')))]
}

function presetTokens(p: NichePreset): string[] {
  return [...new Set(tokens([
    p.niche, p.keywords.join(' '), p.categoryName ?? '', p.parentName ?? '',
    p.types.map(t => `${t.name} ${t.searchTerm}`).join(' '),
  ].join(' ')))]
}

/**
 * 0..1 — hoe goed dekt deze preset de zoekwoorden?
 *
 * Twee delen, en de verhouding is het punt: overlap met de producttypes alléén
 * mag NOOIT genoeg zijn voor een directe match. Een koffiewinkel die toevallig
 * "travel bowl" in het assortiment heeft, is geen hondenwinkel. Alleen als de
 * NICHE-NAAM zelf meedoet komt een preset boven de directe drempel uit; anders
 * blijft hij hooguit kandidaat en beslist de semantische laag.
 */
export function lexicalScore(ctx: MatchContext, preset: NichePreset): number {
  const q = queryTokens(ctx)
  if (q.length === 0) return 0
  const wide = new Set(presetTokens(preset))
  const narrow = new Set(tokens(preset.niche))
  const broad = q.filter(t => wide.has(t)).length / q.length
  const onName = q.filter(t => narrow.has(t)).length / q.length
  // Maximaal 0.45 uit brede overlap → onder DIRECT_MATCH_SCORE (0.55).
  return Math.min(1, broad * 0.45 + onName * 0.55)
}

export interface PresetMatch {
  preset: NichePreset
  score: number
  how: 'lexicaal' | 'semantisch'
  /** Toelichting voor de log/UI. */
  reason: string
}

export type MatchJudge = (system: string, user: string) => Promise<unknown>

export interface FindPresetOptions {
  /** Mock-presets toestaan. ALLEEN in tests/dev — nooit met een echte adapter. */
  allowMock?: boolean
  /** LLM voor de semantische laag; weglaten = alleen lexicaal. */
  judge?: MatchJudge
  onLog?: (m: string) => void
  /** Overschrijft de directe-match-drempel (tests). */
  directThreshold?: number
}

export async function findPresetForNiche(
  ctx: MatchContext,
  opts: FindPresetOptions = {},
): Promise<PresetMatch | null> {
  const log = opts.onLog ?? (() => { /* stil */ })
  const all = listPresets({ includeMock: opts.allowMock ?? false, limit: 500 })
  if (all.length === 0) { log('[preset] bibliotheek is leeg — live zoeken'); return null }

  const ranked = all
    .map(preset => ({ preset, score: lexicalScore(ctx, preset) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const direct = opts.directThreshold ?? DIRECT_MATCH_SCORE
  if (best && best.score >= direct) {
    log(`[preset] lexicale match: "${best.preset.niche}" (${Math.round(best.score * 100)}%)`)
    return {
      preset: best.preset, score: best.score, how: 'lexicaal',
      reason: `Woordovereenkomst met "${best.preset.niche}" (${Math.round(best.score * 100)}%).`,
    }
  }

  // Kandidaten voor de semantische laag. Let op de tweede regel: bij Nederlandse
  // invoer ("hondenriemen") scoort ÁLLES lexicaal nul, en juist dan is de
  // semantische laag nodig. Zonder deze terugval zou laag 2 precies in het geval
  // waarvoor hij bestaat nooit aan bod komen. Het kost één kleine call met
  // alleen labels erin.
  const scored = ranked.filter(r => r.score >= CANDIDATE_MATCH_SCORE).slice(0, 10)
  const candidates = scored.length > 0 ? scored : ranked.slice(0, 10)
  if (candidates.length === 0 || !opts.judge) {
    log(`[preset] geen match (beste: ${best ? `${best.preset.niche} ${Math.round(best.score * 100)}%` : 'geen'}) — live zoeken`)
    return null
  }

  // Semantische laag: alleen labels, geen producten — klein en goedkoop.
  try {
    const raw = await opts.judge(
      'Je koppelt een winkelidee aan een bestaand, kant-en-klaar assortiment. Je bent streng: een assortiment dat er "een beetje op lijkt" is geen match.',
      `Het winkelidee (kan Nederlands zijn): "${ctx.niche}"
Doelgroep: ${JSON.stringify({ label: ctx.personaLabel, interests: ctx.interests, problem: ctx.problem })}

Beschikbare assortimenten:
${candidates.map((c, i) => `${i + 1}. ${c.preset.niche} — producttypes: ${c.preset.types.slice(0, 8).map(t => t.name).join(', ')}`).join('\n')}

Welk assortiment past bij dit winkelidee? Het moet echt over dezelfde producten
gaan; een aanverwante categorie is NIET goed genoeg (een winkel in hondenriemen
is geen winkel in kattenspeelgoed).

JSON: {"match": <nummer of null>, "reden": "1 zin Nederlands"}`,
    ) as { match?: number | null; reden?: string }

    const idx = typeof raw?.match === 'number' ? raw.match - 1 : -1
    if (idx >= 0 && idx < candidates.length) {
      const hit = candidates[idx]
      log(`[preset] semantische match: "${hit.preset.niche}" — ${raw.reden ?? ''}`)
      return {
        preset: hit.preset, score: Math.max(hit.score, 0.6), how: 'semantisch',
        reason: raw.reden?.trim() || `Semantisch gekoppeld aan "${hit.preset.niche}".`,
      }
    }
    log('[preset] LLM zag geen passend assortiment — live zoeken')
    return null
  } catch (err) {
    log(`[preset] semantische vergelijking mislukt (${err instanceof Error ? err.message : err}) — alleen lexicaal, dus live zoeken`)
    return null
  }
}
