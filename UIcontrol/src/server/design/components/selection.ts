// ═══════ Selectie-schema + default-afleiding ═══════
// De store-builder LLM levert een `components`-blok (keuze uit de catalogus).
// Ontbreekt dat, dan leiden we een goede selectie af uit toon + layout + brief-
// content, zodat elke store via het component-systeem rendert (nooit crash door
// een ontbrekende keuze). Props worden gevuld uit de bestaande brief-content.

import { z } from 'zod'
import type { DesignDNA, VisualTone } from '../tokens.js'
import type { LayoutPlan } from '../layout.js'
import type { ComponentSelection, StyleVariant } from './types.js'
import { getComponent, allComponents } from './registry.js'
import { TOPBAR_BY_THEME } from './topbars.js'
import { iconThemeFor, type IconTheme } from './icons.js'
import { componentUsage, pickFresh } from '../component-usage.js'
import { companyContact } from '../../company.js'

export const ComponentSelectionSchema = z.object({
  style: z.enum(['minimal', 'bold', 'playful', 'editorial']).optional(),
  topbar: z.string().optional(),
  nav: z.string().optional(),
  footer: z.string().optional(),
  sections: z.array(z.object({
    id: z.string(),
    style: z.enum(['minimal', 'bold', 'playful', 'editorial']).optional(),
    anim: z.enum(['none', 'subtle', 'expressive']).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
  })).min(2).max(10).optional(),
})
export type ComponentSelectionInput = z.infer<typeof ComponentSelectionSchema>

const STYLE_BY_TONE: Record<VisualTone, StyleVariant> = {
  minimal: 'minimal', premium: 'editorial', urban: 'bold', tech: 'bold', playful: 'playful', organic: 'editorial',
}

const HERO_BY_HERO: Record<LayoutPlan['hero'], string> = {
  split: 'hero.split-left', centered: 'hero.centered', editorial: 'hero.editorial',
  fullbleed: 'hero.fullbleed-overlay', 'minimal-left': 'hero.minimal-text',
}
const PRODUCTS_BY_VARIANT: Record<LayoutPlan['product'], string> = {
  grid: 'products.grid-3', 'featured-grid': 'products.featured-grid',
  carousel: 'products.carousel', 'editorial-list': 'products.editorial-list',
}

export interface BriefContentForSelection {
  brandName: string
  eyebrow: string
  headline: string
  subheadline: string
  cta: string
  usps: Array<{ title: string; desc: string }>
  storyTitle: string
  storyBody: string
  reviews: Array<{ name: string; stars: number; text: string }>
  footerTagline: string
}

export interface SelectionContext {
  /** Niche-omschrijving, voor het afleiden van het icoon-/topbarthema. */
  niche: string
  /** Interesses uit de persona; scherpen het thema aan. */
  interests?: string[]
  /** Seed uit het DNA — houdt de keuzes deterministisch per store. */
  seed: number
  /** Hoeveel producten de winkel toont. Bepaalt welke weergave past. */
  productCount?: number
  /** Distincte producttypes ("beard oil", "beard brush") voor categorie-indeling. */
  productTypes?: string[]
}

export interface SelectionResult {
  topbar: ComponentSelection
  nav: ComponentSelection
  sections: ComponentSelection[]
  footer: ComponentSelection
  style: StyleVariant
  source: 'llm' | 'derived'
  /** Het afgeleide niche-thema (bepaalt iconen én topbar-pool). */
  iconTheme: IconTheme
  /** Alternatieven per as, voor de uniciteitscontrole in uniqueness.ts. */
  alternatives: { hero: string[]; topbar: string[] }
  /** Aanpassingen die de selectie zelf heeft gedaan — worden gelogd. */
  notes: string[]
}

/** Componenten die het niche-icoonthema nodig hebben om te renderen. */
const NEEDS_ICON_THEME = /^(topbar\.|badges\.icon-grid|content\.values-grid|form\.newsletter-panel)/

/** Alle component-id's in een categorie — de pool voor seeded keuzes. */
function idsIn(category: string): string[] {
  return allComponents().filter(d => d.category === category).map(d => d.id)
}

/** Deterministische keuze uit een pool. */
function pick<T>(pool: readonly T[], seed: number, offset = 0): T {
  return pool[Math.abs(seed + offset) % pool.length]
}

// ── Productweergave ↔ collectie-grootte ───────────────────────────────────────
// Een "editorial lijst" met dertien producten wordt een eindeloze rij van
// paginagrote blokken; een grid van vier kolommen met drie producten staat vol
// gaten. De catalogus tagt componenten daarom met `few-products` /
// `many-products`; hier wordt die tag ook echt gehandhaafd.

const MANY = 9      // vanaf hier is het een catalogus
const FEW = 5       // tot hier is het een curated selectie

/** Past deze productweergave bij dit aantal producten? */
export function fitsCollection(id: string, count: number): boolean {
  const def = getComponent(id)
  if (!def || def.category !== 'products') return true
  const tags = def.tags ?? []
  if (tags.includes('few-products') && count > 8) return false
  if (tags.includes('many-products') && count < FEW) return false
  return true
}

/**
 * Kiest een productweergave die past bij de omvang ÉN de opbouw van de collectie.
 * Meerdere producttypes + een volle collectie → categorie-tabs, zodat tien
 * producten navigeerbaar zijn in plaats van één ongestructureerde lijst.
 */
export function chooseProductComponent(
  fallback: string, count: number, types: string[], seed: number,
  usage: Map<string, number> = new Map(),
): string {
  const from = (pool: readonly string[], offset: number) => pickFresh(pool, usage, seed, offset)
  if (types.length >= 3 && count >= 8) return 'products.category-tabs'
  if (count >= MANY) return from(['products.grid-4', 'products.masonry', 'products.list-compact', 'products.grid-3', 'products.quickview-grid'], 11)
  if (count > 0 && count <= FEW) return from(['products.editorial-list', 'products.featured-grid', 'products.spotlight-stack'], 12)
  return fitsCollection(fallback, count) ? fallback : from(['products.grid-3', 'products.grid-4', 'products.quickview-grid'], 13)
}

/** Bouwt de uiteindelijke selectie: LLM-keuze indien geldig, anders afgeleid. */
export function buildSelection(
  dna: DesignDNA,
  layout: LayoutPlan,
  content: BriefContentForSelection,
  llm: ComponentSelectionInput | undefined,
  ctx: SelectionContext,
): SelectionResult {
  const style = llm?.style ?? STYLE_BY_TONE[dna.tone]
  const seed = Math.abs(Math.trunc(ctx.seed)) || 1
  const iconTheme = iconThemeFor(ctx.niche, ctx.interests ?? [])
  const notes: string[] = []
  const count = ctx.productCount ?? 0
  const types = ctx.productTypes ?? []
  const usage = componentUsage()
  const productsId = chooseProductComponent(PRODUCTS_BY_VARIANT[layout.product], count, types, seed, usage)

  // Topbar-pool: de varianten die bij dít nichethema passen, niet de hele
  // catalogus. Zo krijgt een sportwinkel geen wellness-toon in de balk.
  const topbarPool = (TOPBAR_BY_THEME[iconTheme] ?? TOPBAR_BY_THEME.universal).filter(id => getComponent(id))
  const heroPool = idsIn('hero')

  // Props-bron per component-categorie uit de brief-content
  const heroProps = { eyebrow: content.eyebrow, headline: content.headline, subheadline: content.subheadline, cta: content.cta, secondaryCta: 'Learn more' }
  const propsFor = (id: string): Record<string, unknown> => {
    const base: Record<string, unknown> = NEEDS_ICON_THEME.test(id) ? { iconTheme } : {}
    if (id.startsWith('hero.')) return { ...base, ...heroProps }
    if (id.startsWith('products.')) {
      // Tabs krijgen de ECHTE producttypes mee; de component leidt ze ook zelf
      // uit de producten af, dit is de expliciete route.
      const tabs = types.length >= 2 ? ['All', ...types] : undefined
      return { ...base, title: 'Shop the collection', ...(tabs ? { tabs } : {}) }
    }
    if (id === 'content.why-us-grid') return { ...base, title: 'Built different', items: content.usps }
    if (id === 'content.values-grid') return { ...base, items: content.usps.slice(0, 3).map(u => ({ title: u.title, desc: u.desc })) }
    if (id === 'content.story-split') return { ...base, title: content.storyTitle, body: content.storyBody }
    if (id === 'content.timeline-story') return { ...base, title: content.storyTitle }
    if (id === 'content.big-statement') return { ...base, statement: content.storyTitle, attribution: content.brandName }
    if (id === 'testimonials.cards-grid' || id === 'testimonials.avatar-row' || id === 'testimonials.timeline-list') {
      return { ...base, title: 'What customers say', items: content.reviews.map(r => ({ name: r.name, stars: r.stars, text: r.text })) }
    }
    if (id === 'testimonials.quote-large' || id === 'testimonials.split-feature') {
      return { ...base, quote: content.reviews[0]?.text, author: content.reviews[0]?.name }
    }
    // Contactgegevens komen uit de centrale bedrijfsbron, nooit per winkel.
    if (id.startsWith('footer.')) {
      const c = companyContact()
      return { ...base, tagline: content.footerTagline, email: c.email, hours: c.hours }
    }
    if (id === 'nav.announcement-bar') return { ...base, announcement: 'Free EU shipping · 30-day returns' }
    return base
  }

  const alternatives = { hero: heroPool, topbar: topbarPool }

  // ── LLM-selectie (gevalideerd tegen de registry) ────────────────────────────
  if (llm?.sections?.length) {
    const valid = llm.sections.filter(s => getComponent(s.id))
    const hasProducts = valid.some(s => s.id.startsWith('products.'))
    const sections: ComponentSelection[] = valid.map(s => {
      // Weergave-keuze toetsen aan de werkelijke collectie: de LLM kiest zonder
      // te weten hoeveel producten het uiteindelijk worden.
      if (s.id.startsWith('products.') && count > 0 && !fitsCollection(s.id, count)) {
        notes.push(`productweergave "${s.id}" past niet bij ${count} producten → "${productsId}"`)
        return { id: productsId, style: s.style, anim: s.anim, props: { ...propsFor(productsId), ...(s.props ?? {}) } }
      }
      return { id: s.id, style: s.style, anim: s.anim, props: { ...propsFor(s.id), ...(s.props ?? {}) } }
    })
    // Producten zijn nooit optioneel — voeg toe als de LLM ze vergat
    if (!hasProducts) {
      sections.splice(1, 0, { id: productsId, props: propsFor(productsId) })
      notes.push(`geen productweergave gekozen → "${productsId}" toegevoegd`)
    }
    const nav = (llm.nav && getComponent(llm.nav)) ? llm.nav : 'nav.classic'
    const footer = (llm.footer && getComponent(llm.footer)) ? llm.footer : 'footer.simple'
    // Een topbar-keuze van de LLM telt alleen als het écht een topbar is; kiest
    // hij er geen, dan pakken we er een uit de niche-pool in plaats van niets —
    // de balk is een van de sterkste per-niche verschillen.
    const llmTopbar = llm.topbar && getComponent(llm.topbar)?.category === 'topbar' ? llm.topbar : pick(topbarPool, seed)
    return {
      topbar: { id: llmTopbar, props: propsFor(llmTopbar) },
      nav: { id: nav, props: propsFor(nav) },
      sections,
      footer: { id: footer, props: propsFor(footer) },
      style, source: 'llm', iconTheme, alternatives, notes,
    }
  }

  // ── Afgeleide default uit toon + layout ─────────────────────────────────────
  //
  // Hier stonden tot 29 juli 2026 hardgecodeerde lijstjes van 3-4 id's per
  // gleuf. Daardoor kon de afgeleide selectie hooguit de helft van de catalogus
  // bereiken, en kregen vier van de vijf audit-winkels dezelfde nav, footer en
  // gallery. Nu is de pool per gleuf de HELE categorie, en wordt er eerst
  // gekozen uit wat nog niet gebruikt is (`pickFresh` tegen `component_usage`).
  const fresh = <T extends string>(pool: readonly T[], offset: number): T =>
    pool.length ? pickFresh(pool, usage, seed, offset) : pool[0]

  // De hero uit het layout-plan is de voorkeur, maar niet ten koste van alles:
  // staat die al in meer winkels dan het minst gebruikte alternatief, dan wint
  // het alternatief. Anders krijgt elke "editorial"-layout dezelfde hero.
  const layoutHero = HERO_BY_HERO[layout.hero]
  const freshHero = fresh(heroPool, 0)
  const heroId = (usage.get(layoutHero) ?? 0) <= (usage.get(freshHero) ?? 0) ? layoutHero : freshHero
  // Componenten die per definitie ergens anders horen (producten hebben hun
  // eigen gleuf; de hero staat vast bovenaan).
  const contentPool = idsIn('content')
  const uspsId = fresh(contentPool, 1)
  // Story komt óók uit content, maar nooit hetzelfde blok als de USP's.
  const storyPool = contentPool.filter(id => id !== uspsId)
  const map: Record<string, string> = {
    usps: uspsId,
    products: productsId,
    reviews: fresh(idsIn('testimonials'), 2),
    story: fresh(storyPool, 3),
    'cta-band': fresh(idsIn('cta'), 4),
  }
  const trustId = fresh(idsIn('badges'), 5)
  const bodyIds = [trustId, ...layout.sections.map(s => map[s]).filter(Boolean)]
  if (!bodyIds.includes(productsId)) bodyIds.splice(1, 0, productsId)
  // Eén toon-passende extra uit een categorie die verder nog niet aan bod kwam.
  // Zo komen gallery en form ook echt in winkels terecht in plaats van alleen in
  // de catalogus te staan.
  const extraPool = [...idsIn('gallery'), ...idsIn('form'), ...contentPool, ...idsIn('cta')]
    .filter(id => !bodyIds.includes(id))
  if (extraPool.length) bodyIds.push(fresh(extraPool, 6))

  const navId = fresh(idsIn('nav'), 7)
  const footerId = fresh(idsIn('footer'), 8)
  const topbarId = fresh(topbarPool, 9)

  // dedup terwijl volgorde behouden blijft
  const seen = new Set<string>()
  const sections: ComponentSelection[] = [heroId, ...bodyIds].filter(id => { if (seen.has(id)) return false; seen.add(id); return true })
    .map(id => ({ id, props: propsFor(id) }))

  return {
    topbar: { id: topbarId, props: propsFor(topbarId) },
    nav: { id: navId, props: propsFor(navId) },
    sections,
    footer: { id: footerId, props: propsFor(footerId) },
    style, source: 'derived', iconTheme, alternatives, notes,
  }
}
