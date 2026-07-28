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
): string {
  if (types.length >= 3 && count >= 8) return 'products.category-tabs'
  if (count >= MANY) return pick(['products.grid-4', 'products.masonry', 'products.list-compact', 'products.grid-3'], seed, 11)
  if (count > 0 && count <= FEW) return pick(['products.editorial-list', 'products.featured-grid', 'products.spotlight-stack'], seed, 12)
  return fitsCollection(fallback, count) ? fallback : 'products.grid-3'
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
  const productsId = chooseProductComponent(PRODUCTS_BY_VARIANT[layout.product], count, types, seed)

  // Topbar-pool: de varianten die bij dít nichethema passen, niet de hele
  // catalogus. Zo krijgt een sportwinkel geen wellness-toon in de balk.
  const topbarPool = (TOPBAR_BY_THEME[iconTheme] ?? TOPBAR_BY_THEME.universal).filter(id => getComponent(id))
  const heroPool = idsIn('hero')

  // Props-bron per component-categorie uit de brief-content
  const heroProps = { eyebrow: content.eyebrow, headline: content.headline, subheadline: content.subheadline, cta: content.cta, secondaryCta: 'Learn more' }
  const propsFor = (id: string): Record<string, unknown> => {
    const base: Record<string, unknown> = NEEDS_ICON_THEME.test(id) ? { iconTheme } : {}
    if (id.startsWith('hero.')) return { ...base, ...heroProps }
    if (id.startsWith('products.')) return { ...base, title: 'Shop the collection' }
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
    if (id.startsWith('footer.')) return { ...base, tagline: content.footerTagline }
    if (id === 'nav.announcement-bar') return { ...base, announcement: 'Free EU shipping · 30-day returns' }
    return base
  }

  const alternatives = { hero: heroPool, topbar: topbarPool }

  // ── LLM-selectie (gevalideerd tegen de registry) ────────────────────────────
  if (llm?.sections?.length) {
    const valid = llm.sections.filter(s => getComponent(s.id))
    const hasProducts = valid.some(s => s.id.startsWith('products.'))
    const sections: ComponentSelection[] = valid.map(s => ({
      id: s.id, style: s.style, anim: s.anim, props: { ...propsFor(s.id), ...(s.props ?? {}) },
    }))
    // Producten zijn nooit optioneel — voeg toe als de LLM ze vergat
    if (!hasProducts) sections.splice(1, 0, { id: PRODUCTS_BY_VARIANT[layout.product], props: propsFor('products.grid-3') })
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
      style, source: 'llm', iconTheme, alternatives,
    }
  }

  // ── Afgeleide default uit toon + layout ─────────────────────────────────────
  const heroId = HERO_BY_HERO[layout.hero]
  const productsId = PRODUCTS_BY_VARIANT[layout.product]
  // Sectie-volgorde vertaalt de layout.sections naar componenten. De tweede
  // batch componenten wordt seeded ingemengd, zodat twee stores met dezelfde
  // toon niet steeds dezelfde vijf blokken krijgen.
  const map: Record<string, string> = {
    usps: pick(['content.why-us-grid', 'content.values-grid', 'content.feature-alternating'], seed, 1),
    products: productsId,
    reviews: pick(['testimonials.cards-grid', 'testimonials.avatar-row', 'testimonials.timeline-list', 'testimonials.stat-proof'], seed, 2),
    story: pick(['content.story-split', 'content.timeline-story', 'content.big-statement'], seed, 3),
    'cta-band': pick(['cta.stock-indicator', 'cta.split-image', 'cta.gradient-banner', 'cta.guarantee-panel'], seed, 4),
  }
  const trustId = pick(['badges.trust-row', 'badges.icon-grid', 'badges.shipping-map', 'badges.payment-icons'], seed, 5)
  const bodyIds = [trustId, ...layout.sections.map(s => map[s]).filter(Boolean)]
  if (!bodyIds.includes(productsId)) bodyIds.splice(1, 0, productsId)
  // Toon-afhankelijke extra's voor variatie
  if (dna.tone === 'playful' || dna.tone === 'urban') bodyIds.push(pick(['cta.countdown', 'cta.inline-strip', 'gallery.scroll-strip'], seed, 6))
  if (dna.tone === 'premium' || dna.tone === 'organic') bodyIds.push(pick(['content.faq-accordion', 'content.tabs-info', 'gallery.detail-pair'], seed, 7))
  if (dna.tone === 'tech' || dna.tone === 'minimal') bodyIds.push(pick(['content.spec-table', 'content.comparison-table', 'form.question-box'], seed, 8))

  const navId = ({ minimal: 'nav.classic', premium: 'nav.split-links', urban: 'nav.sticky-solid-on-scroll', tech: 'nav.icon-compact', playful: 'nav.announcement-bar', organic: 'nav.centered-logo' } as Record<VisualTone, string>)[dna.tone]
  const footerId = ({ minimal: 'footer.simple', premium: 'footer.sitemap-columns', urban: 'footer.big-wordmark', tech: 'footer.dark-compact', playful: 'footer.social-strip', organic: 'footer.contact-block' } as Record<VisualTone, string>)[dna.tone]
  const topbarId = pick(topbarPool, seed)

  // dedup terwijl volgorde behouden blijft
  const seen = new Set<string>()
  const sections: ComponentSelection[] = [heroId, ...bodyIds].filter(id => { if (seen.has(id)) return false; seen.add(id); return true })
    .map(id => ({ id, props: propsFor(id) }))

  return {
    topbar: { id: topbarId, props: propsFor(topbarId) },
    nav: { id: navId, props: propsFor(navId) },
    sections,
    footer: { id: footerId, props: propsFor(footerId) },
    style, source: 'derived', iconTheme, alternatives,
  }
}
