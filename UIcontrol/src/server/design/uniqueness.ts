// ═══════ Uniciteitsgarantie per store ═══════
// Harde eis: geen twee gegenereerde stores delen dezelfde combinatie van
// layout-preset × hero-variant × topbar-variant × animatie-karakter × kleurpalet
// × font-pairing. De anti-herhaling in layout.ts kijkt alleen naar de laatste
// tien layouts en per as apart — dat voorkomt "de vorige twee zagen er zo uit",
// maar niet dat store 3 en store 40 identiek uitvallen.
//
// Hier hangen we er een echte sleutel aan: een hash over álle zes assen, met een
// UNIQUE index in de database. Botst een combinatie, dan wordt er net zo lang op
// één as gedraaid tot de hash vrij is. Dat is deterministisch (zelfde seed →
// zelfde volgorde van pogingen) en het faalt nooit stil: lukt het niet, dan
// staat dat in de warnings.

import crypto from 'node:crypto'
import db from '../db.js'

db.exec(`
  CREATE TABLE IF NOT EXISTS store_combinations (
    combo_hash TEXT PRIMARY KEY,
    store_key  TEXT NOT NULL DEFAULT '',
    layout     TEXT NOT NULL,
    hero       TEXT NOT NULL,
    topbar     TEXT NOT NULL,
    motion     TEXT NOT NULL,
    palette    TEXT NOT NULL,
    fonts      TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_store_combinations_store ON store_combinations(store_key);
`)

/** De zes assen waarop stores van elkaar moeten verschillen. */
export interface Combination {
  /** Sectie-volgorde van de layout, bv. "usps>products>reviews". */
  layout: string
  /** Component-id van de hero, bv. "hero.parallax-scroll". */
  hero: string
  /** Component-id van de topbar/nav-combinatie. */
  topbar: string
  /** Id van het animatie-karakter, bv. "crisp-snap". */
  motion: string
  /** Genormaliseerde kernkleuren. */
  palette: string
  /** "DisplayFont/BodyFont". */
  fonts: string
}

/** Stabiele, korte hash over de zes assen. */
export function combinationHash(c: Combination): string {
  const canonical = [c.layout, c.hero, c.topbar, c.motion, c.palette, c.fonts]
    .map(v => String(v ?? '').trim().toLowerCase())
    .join('|')
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

/** Normaliseert een palet tot een vergelijkbare sleutel (kern-kleuren, lowercase). */
export function paletteKey(p: { primary: string; accent: string; bg: string; secondary?: string }): string {
  return [p.bg, p.primary, p.accent, p.secondary ?? '']
    .map(h => String(h ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('-')
}

/** Is deze combinatie al door een andere store gebruikt? */
export function combinationTaken(hash: string, storeKey: string): boolean {
  try {
    const row = db.prepare(
      `SELECT store_key FROM store_combinations WHERE combo_hash = ?`,
    ).get(hash) as { store_key: string } | undefined
    if (!row) return false
    // Een herbouw van dezelfde store mag z'n eigen combinatie hergebruiken.
    return row.store_key !== storeKey
  } catch { return false }
}

/** Legt de combinatie vast. Idempotent per store. */
export function recordCombination(hash: string, c: Combination, storeKey: string): void {
  try {
    db.prepare(`
      INSERT INTO store_combinations (combo_hash, store_key, layout, hero, topbar, motion, palette, fonts, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(combo_hash) DO UPDATE SET store_key = excluded.store_key
    `).run(hash, storeKey, c.layout, c.hero, c.topbar, c.motion, c.palette, c.fonts, new Date().toISOString())
  } catch (err) {
    console.error('[uniqueness] recordCombination failed:', err)
  }
}

/** Welke alternatieven er per as beschikbaar zijn om mee te draaien. */
export interface CombinationAlternatives {
  hero: string[]
  topbar: string[]
  motion: string[]
}

export interface UniqueResult {
  combination: Combination
  hash: string
  /** Hoeveel keer er gedraaid moest worden (0 = meteen uniek). */
  attempts: number
  /** Op welke assen er is bijgestuurd. */
  rotated: string[]
  /** Gevuld als er géén vrije combinatie gevonden is. */
  warning?: string
}

/**
 * Zorgt dat de combinatie uniek is. Draait bij een botsing achtereenvolgens aan
 * de hero, de topbar en het animatie-karakter — in die volgorde, want dat zijn
 * de assen die het meest zichtbaar verschillen zonder het design-plan van de LLM
 * te ondermijnen. Palet en fonts blijven ongemoeid: die komen uit de persona en
 * de artdirection, en daaraan sleutelen zou de store minder passend maken.
 *
 * De rotatie start op een seeded offset, zodat twee gelijktijdige botsingen niet
 * allebei naar dezelfde eerste alternatief springen.
 */
export function ensureUniqueCombination(
  base: Combination,
  alternatives: CombinationAlternatives,
  storeKey: string,
  seed: number,
): UniqueResult {
  let hash = combinationHash(base)
  if (!combinationTaken(hash, storeKey)) {
    recordCombination(hash, base, storeKey)
    return { combination: base, hash, attempts: 0, rotated: [] }
  }

  const axes: Array<{ name: keyof Combination; options: string[] }> = [
    { name: 'hero', options: alternatives.hero },
    { name: 'topbar', options: alternatives.topbar },
    { name: 'motion', options: alternatives.motion },
  ]

  const rotated: string[] = []
  let attempts = 0
  const current: Combination = { ...base }

  // Eén as tegelijk, dan twee gecombineerd — zo blijft de afwijking van het
  // oorspronkelijke plan zo klein mogelijk.
  for (const axis of axes) {
    const opts = axis.options.filter(o => o && o !== base[axis.name])
    for (let i = 0; i < opts.length; i++) {
      const pick = opts[(seed + i) % opts.length]
      const candidate: Combination = { ...current, [axis.name]: pick }
      attempts++
      const h = combinationHash(candidate)
      if (!combinationTaken(h, storeKey)) {
        recordCombination(h, candidate, storeKey)
        return { combination: candidate, hash: h, attempts, rotated: [...rotated, axis.name] }
      }
    }
    // Deze as gaf niets vrij → houd de laatste waarde vast en draai de volgende
    if (opts.length) {
      current[axis.name] = opts[seed % opts.length]
      rotated.push(axis.name)
    }
  }

  // Alle enkelvoudige rotaties vol → volledige kruisproduct van hero × motion
  for (const h1 of alternatives.hero) {
    for (const m of alternatives.motion) {
      const candidate: Combination = { ...current, hero: h1, motion: m }
      attempts++
      const h = combinationHash(candidate)
      if (!combinationTaken(h, storeKey)) {
        recordCombination(h, candidate, storeKey)
        return { combination: candidate, hash: h, attempts, rotated: ['hero', 'motion'] }
      }
    }
  }

  hash = combinationHash(current)
  recordCombination(hash, current, storeKey)
  return {
    combination: current, hash, attempts, rotated,
    warning: `geen vrije combinatie gevonden na ${attempts} pogingen — combinatie mogelijk niet uniek`,
  }
}

/** Voor rapportage/tests: alle vastgelegde combinaties. */
export function listCombinations(limit = 50): Array<Combination & { combo_hash: string; store_key: string }> {
  try {
    return db.prepare(
      `SELECT combo_hash, store_key, layout, hero, topbar, motion, palette, fonts
       FROM store_combinations ORDER BY created_at DESC LIMIT ?`,
    ).all(limit) as Array<Combination & { combo_hash: string; store_key: string }>
  } catch { return [] }
}

/** Maakt de combinatie van een verwijderde store weer vrij. */
export function releaseCombination(storeKey: string): void {
  try { db.prepare(`DELETE FROM store_combinations WHERE store_key = ?`).run(storeKey) }
  catch (err) { console.error('[uniqueness] releaseCombination failed:', err) }
}
