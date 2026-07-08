// ═══════ Layout-variatie bibliotheek ═══════
// Meerdere varianten per paginatype (hero, product-weergave, sectie-volgorde).
// Selectie op basis van: visuele toon (uit design-DNA) + site-structuur uit de
// wizard (stap 3) + expliciete ANTI-HERHALING: recent gebruikte combinaties voor
// andere stores worden vermeden.

import db from '../db.js'
import type { VisualTone } from './tokens.js'

export type HeroVariant = 'split' | 'centered' | 'editorial' | 'fullbleed' | 'minimal-left'
export type ProductVariant = 'grid' | 'featured-grid' | 'carousel' | 'editorial-list'
export type SectionId = 'usps' | 'products' | 'reviews' | 'story' | 'cta-band'

export interface LayoutPlan {
  hero: HeroVariant
  product: ProductVariant
  sections: SectionId[]      // volgorde ná de hero (hero staat altijd bovenaan)
  navStyle: 'left' | 'center' | 'split'
  footerStyle: 'minimal' | 'columns' | 'bold'
}

export interface LayoutSelectOptions {
  tone: VisualTone
  seed: number
  siteStructure?: {
    nicheType?: string
    pages?: Array<{ id: string; title: string }>
    extras?: Array<{ id: string; title: string }>
  }
  /**
   * Expliciete voorkeur uit het LLM-ontwerpplan (design-plan.ts). Een bewuste
   * keuze van de designer-LLM wint van de seeded anti-herhaling — het plan IS
   * de variatie. Ontbrekende velden vallen terug op de seeded selectie.
   */
  preferred?: {
    hero?: HeroVariant
    product?: ProductVariant
    sections?: SectionId[]
  }
}

// ── Anti-herhaling: recent gebruikte layouts (DB) ─────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS layout_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    store_key   TEXT NOT NULL DEFAULT '',
    tone        TEXT NOT NULL,
    hero        TEXT NOT NULL,
    product     TEXT NOT NULL,
    section_key TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_layout_history_created ON layout_history(created_at);
`)

interface RecentLayout { hero: string; product: string; section_key: string; tone: string }

function recentLayouts(limit = 10): RecentLayout[] {
  try {
    return db.prepare(
      `SELECT hero, product, section_key, tone FROM layout_history ORDER BY id DESC LIMIT ?`,
    ).all(limit) as RecentLayout[]
  } catch { return [] }
}

export function recordLayout(plan: LayoutPlan, tone: VisualTone, storeKey: string): void {
  try {
    db.prepare(
      `INSERT INTO layout_history (store_key, tone, hero, product, section_key, created_at) VALUES (?,?,?,?,?,?)`,
    ).run(storeKey, tone, plan.hero, plan.product, plan.sections.join('>'), new Date().toISOString())
  } catch (err) {
    console.error('[layout] recordLayout failed:', err)
  }
}

// ── Seeded RNG (los van tokens zodat layout onafhankelijk varieert) ───────────

function rngFrom(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Kies een variant uit `options`, met voorkeur voor iets dat NIET recent gebruikt
 * is (anti-herhaling). Valt terug op een seeded keuze als alles recent is.
 */
function pickAvoiding<T extends string>(
  options: readonly T[],
  recent: string[],
  rng: () => number,
): T {
  const fresh = options.filter(o => !recent.includes(o))
  const pool = fresh.length > 0 ? fresh : options
  return pool[Math.floor(rng() * pool.length) % pool.length]
}

// ── Aantal producten per store (varieert 6-15, seeded) ────────────────────────

export const PRODUCTS_MIN = 6
export const PRODUCTS_MAX = 15

/**
 * Bepaalt hoeveel producten een store toont — varieert per store tussen 6 en 15.
 * Impulsaankoop-niches krijgen een compactere collectie, overwogen aankopen een
 * bredere. Deterministisch geseed zodat twee stores een ander aantal krijgen.
 */
export function deriveProductCount(seed: number, nicheType?: string): number {
  const rng = rngFrom(seed ^ 0x50f7)
  let lo = PRODUCTS_MIN, hi = PRODUCTS_MAX
  if (nicheType === 'impulse') { lo = 6; hi = 10 }
  else if (nicheType === 'considered') { lo = 9; hi = 15 }
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/**
 * Past een productlijst aan tot een doel-aantal:
 * - genoeg producten → toont er `target` (max 15)
 * - te weinig (< 6) → vult aan tot minimaal 6 door te cyclen (unieke display-id,
 *   supplier-velden blijven gelijk zodat fulfillment naar het juiste CJ-product wijst)
 * Zo heeft elke store een volle, maar variabel grote collectie.
 */
export function fitProducts<T extends { id: string }>(products: T[], target: number, _seed = 0): T[] {
  if (products.length === 0) return []
  const desired = products.length >= PRODUCTS_MIN
    ? Math.min(target, products.length)
    : PRODUCTS_MIN
  const out: T[] = []
  for (let i = 0; i < desired; i++) {
    const src = products[i % products.length]
    out.push(i < products.length ? src : { ...src, id: `${src.id}--v${Math.floor(i / products.length) + 1}` })
  }
  return out
}

// ── Toon → passende hero/product varianten ────────────────────────────────────

const HERO_BY_TONE: Record<VisualTone, HeroVariant[]> = {
  minimal: ['minimal-left', 'centered', 'split'],
  playful: ['centered', 'fullbleed', 'split'],
  premium: ['editorial', 'split', 'fullbleed'],
  urban:   ['fullbleed', 'split', 'editorial'],
  organic: ['editorial', 'split', 'centered'],
  tech:    ['split', 'fullbleed', 'centered'],
}

const PRODUCT_BY_TONE: Record<VisualTone, ProductVariant[]> = {
  minimal: ['grid', 'editorial-list', 'featured-grid'],
  playful: ['carousel', 'grid', 'featured-grid'],
  premium: ['featured-grid', 'editorial-list', 'grid'],
  urban:   ['grid', 'carousel', 'featured-grid'],
  organic: ['editorial-list', 'featured-grid', 'grid'],
  tech:    ['grid', 'featured-grid', 'carousel'],
}

// Basis sectie-volgordes (na hero). Wizard-config kan hierop ingrijpen.
const SECTION_ORDERS: SectionId[][] = [
  ['usps', 'products', 'reviews'],
  ['products', 'usps', 'reviews'],
  ['products', 'reviews', 'usps'],
  ['usps', 'products', 'story', 'reviews'],
  ['story', 'products', 'usps', 'reviews'],
  ['products', 'story', 'reviews', 'cta-band'],
]

const NAV_BY_TONE: Record<VisualTone, LayoutPlan['navStyle']> = {
  minimal: 'split', playful: 'center', premium: 'center', urban: 'left', organic: 'split', tech: 'left',
}
const FOOTER_BY_TONE: Record<VisualTone, LayoutPlan['footerStyle']> = {
  minimal: 'minimal', playful: 'bold', premium: 'columns', urban: 'bold', organic: 'columns', tech: 'columns',
}

export function selectLayout(opts: LayoutSelectOptions): LayoutPlan {
  const rng = rngFrom(opts.seed)
  const recent = recentLayouts(10)

  const hero = pickAvoiding(HERO_BY_TONE[opts.tone], recent.map(r => r.hero), rng)
  const product = pickAvoiding(PRODUCT_BY_TONE[opts.tone], recent.map(r => r.product), rng)

  // Sectie-volgorde: kies er één die niet recent is
  const recentSectionKeys = recent.map(r => r.section_key)
  const orderCandidates = SECTION_ORDERS.map(o => ({ order: o, key: o.join('>') }))
  const freshOrders = orderCandidates.filter(o => !recentSectionKeys.includes(o.key))
  const chosenPool = freshOrders.length > 0 ? freshOrders : orderCandidates
  let sections = [...chosenPool[Math.floor(rng() * chosenPool.length) % chosenPool.length].order]

  // ── Wizard site-structuur toepassen ─────────────────────────────────────────
  if (opts.siteStructure) {
    const extraIds = (opts.siteStructure.extras ?? []).map(e => e.id.toLowerCase())
    const pageIds = (opts.siteStructure.pages ?? []).map(p => p.id.toLowerCase())
    const all = [...extraIds, ...pageIds].join(' ')

    // Impulsaankoop → compacter (geen story-sectie, reviews dichter bij products)
    if (opts.siteStructure.nicheType === 'impulse') {
      sections = sections.filter(s => s !== 'story')
      if (!sections.includes('cta-band')) sections.push('cta-band')
    }
    // Overwogen aankoop → juist meer vertrouwen (story vooraan, reviews behouden)
    if (opts.siteStructure.nicheType === 'considered' && !sections.includes('story')) {
      sections.splice(1, 0, 'story')
    }
    // Expliciete extra's uit de wizard
    if (/review|beoordel|testimonial/.test(all) && !sections.includes('reviews')) sections.push('reviews')
    if (/bundel|bundle|aanbieding|offer/.test(all) && !sections.includes('cta-band')) sections.push('cta-band')
    if (/blog|story|verhaal|about/.test(all) && !sections.includes('story')) sections.splice(1, 0, 'story')
  }

  // Dedup terwijl volgorde behouden blijft
  sections = sections.filter((s, i) => sections.indexOf(s) === i)

  return {
    hero,
    product,
    sections,
    navStyle: NAV_BY_TONE[opts.tone],
    footerStyle: FOOTER_BY_TONE[opts.tone],
  }
}
