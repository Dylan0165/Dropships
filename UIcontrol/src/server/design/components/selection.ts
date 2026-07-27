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

/** Bouwt de uiteindelijke selectie: LLM-keuze indien geldig, anders afgeleid. */
export function buildSelection(
  dna: DesignDNA,
  layout: LayoutPlan,
  content: BriefContentForSelection,
  llm: ComponentSelectionInput | undefined,
): { nav: ComponentSelection; sections: ComponentSelection[]; footer: ComponentSelection; style: StyleVariant; source: 'llm' | 'derived' } {
  const style = llm?.style ?? STYLE_BY_TONE[dna.tone]

  // Props-bron per component-categorie uit de brief-content
  const heroProps = { eyebrow: content.eyebrow, headline: content.headline, subheadline: content.subheadline, cta: content.cta, secondaryCta: 'Learn more' }
  const propsFor = (id: string): Record<string, unknown> => {
    if (id.startsWith('hero.')) return heroProps
    if (id.startsWith('products.')) return { title: 'Shop the collection' }
    if (id === 'content.why-us-grid') return { title: 'Built different', items: content.usps }
    if (id === 'content.story-split') return { title: content.storyTitle, body: content.storyBody }
    if (id === 'testimonials.cards-grid') return { title: 'What customers say', items: content.reviews.map(r => ({ name: r.name, stars: r.stars, text: r.text })) }
    if (id === 'testimonials.quote-large') return { quote: content.reviews[0]?.text, author: content.reviews[0]?.name }
    if (id.startsWith('footer.')) return { tagline: content.footerTagline }
    if (id === 'nav.announcement-bar') return { announcement: 'Free EU shipping · 30-day returns' }
    return {}
  }

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
    return {
      nav: { id: nav, props: propsFor(nav) },
      sections,
      footer: { id: footer, props: propsFor(footer) },
      style, source: 'llm',
    }
  }

  // ── Afgeleide default uit toon + layout ─────────────────────────────────────
  const heroId = HERO_BY_HERO[layout.hero]
  const productsId = PRODUCTS_BY_VARIANT[layout.product]
  // Sectie-volgorde vertaalt de layout.sections naar componenten
  const map: Record<string, string> = {
    usps: 'content.why-us-grid', products: productsId, reviews: 'testimonials.cards-grid',
    story: 'content.story-split', 'cta-band': 'cta.stock-indicator',
  }
  const bodyIds = ['badges.trust-row', ...layout.sections.map(s => map[s]).filter(Boolean)]
  if (!bodyIds.includes(productsId)) bodyIds.splice(1, 0, productsId)
  // Toon-afhankelijke extra's voor variatie
  if (dna.tone === 'playful' || dna.tone === 'urban') bodyIds.push('cta.countdown')
  if (dna.tone === 'premium' || dna.tone === 'organic') bodyIds.push('content.faq-accordion')

  const navId = ({ minimal: 'nav.classic', premium: 'nav.centered-logo', urban: 'nav.transparent', tech: 'nav.classic', playful: 'nav.announcement-bar', organic: 'nav.centered-logo' } as Record<VisualTone, string>)[dna.tone]
  const footerId = ({ minimal: 'footer.simple', premium: 'footer.multi-column', urban: 'footer.trust-badges', tech: 'footer.multi-column', playful: 'footer.newsletter', organic: 'footer.multi-column' } as Record<VisualTone, string>)[dna.tone]

  // dedup terwijl volgorde behouden blijft
  const seen = new Set<string>()
  const sections: ComponentSelection[] = [heroId, ...bodyIds].filter(id => { if (seen.has(id)) return false; seen.add(id); return true })
    .map(id => ({ id, props: propsFor(id) }))

  return {
    nav: { id: navId, props: propsFor(navId) },
    sections,
    footer: { id: footerId, props: propsFor(footerId) },
    style, source: 'derived',
  }
}
