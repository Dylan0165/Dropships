// ═══════ Gedeelde pagina-assemblage ═══════
// ÉÉN plek waar `app/page.tsx` ontstaat, voor élk pad dat een store bouwt:
//
//   • de pipeline        (pipeline/store-builder.ts → renderStore)
//   • de CMS-rebuild     (store-platform.ts → writeNextScaffold)
//   • standalone deploys (store-platform.ts → deployStore)
//
// Waarom dit bestaat: de CMS-rebuild riep rechtstreeks `renderStorePage` aan —
// de oude, vrije renderer — terwijl de pipeline de componentcatalogus gebruikte.
// Een store die via het beheerscherm herbouwd werd, verloor daarmee stilzwijgend
// z'n component-ontwerp, topbar en bewegingslaag. Precies de "genereer in plaats
// van combineer"-situatie die het componentsysteem moest oplossen.
//
// De terugval op `renderStorePage` blijft bestaan als vangnet, maar is nu voor
// beide paden hetzelfde en wordt altijd gelogd.

import type { DesignDNA } from './tokens.js'
import type { LayoutPlan } from './layout.js'
import type { SignatureElement } from './design-plan.js'
import { renderStorePage, type RenderProduct, type RenderContent } from './render-page.js'
import { assemblePage } from './components/assemble.js'
import { buildSelection, type ComponentSelectionInput } from './components/selection.js'
import { selectMotionProfile, motionCharacterIds } from './anime-presets.js'
import { ensureUniqueCombination, paletteKey } from './uniqueness.js'

export interface BuildPageInput {
  dna: DesignDNA
  layout: LayoutPlan
  brandName: string
  niche: string
  subdomain: string
  products: RenderProduct[]
  /** Exact wat de oude renderer ook krijgt — één contentvorm voor beide paden. */
  content: RenderContent
  /** Persona-interesses sturen het icoon- en topbarthema. */
  interests?: string[]
  /** Componentkeuze uit de LLM-brief; ontbreekt bij een CMS-rebuild. */
  llmComponents?: ComponentSelectionInput
  /** Signature-element voor de terugval-renderer. */
  signature?: SignatureElement | null
  onLog?: (msg: string) => void
}

export interface BuildPageResult {
  page: string
  componentMeta: Record<string, unknown>
  uniqueMeta: Record<string, unknown>
  /** false = teruggevallen op de oude renderer. */
  usedCatalog: boolean
}

export function buildStorePage(input: BuildPageInput): BuildPageResult {
  const { dna, layout, brandName, products, content, subdomain } = input
  const log = input.onLog ?? (() => { /* stil */ })

  // Producttypes uit het assortiment: sturen zowel de categorie-indeling op de
  // pagina als de keuze van de productweergave.
  const productTypes = [...new Set(products.map(p => p.productType).filter((t): t is string => !!t))]

  try {
    const selection = buildSelection(dna, layout, {
      brandName,
      eyebrow: content.heroLabel,
      headline: content.heroHeadline,
      subheadline: content.heroSubheadline,
      cta: content.heroCta,
      usps: content.usps,
      storyTitle: content.story.title,
      storyBody: content.story.body,
      reviews: content.reviews,
      footerTagline: content.footerTagline,
    }, input.llmComponents, {
      niche: input.niche,
      interests: input.interests ?? [],
      seed: dna.seed,
      productCount: products.length,
      productTypes,
    })
    for (const n of selection.notes) log(`[assemble] ${n}`)

    const motion = selectMotionProfile(dna.tone, dna.seed)

    // Uniciteit over de zes assen. Botst deze store met een bestaande, dan
    // draait ensureUniqueCombination aan hero/topbar/beweging tot de hash vrij
    // is — nooit aan palet of fonts, die komen uit de persona.
    const heroIdx = selection.sections.findIndex(s => s.id.startsWith('hero.'))
    const unique = ensureUniqueCombination(
      {
        layout: layout.sections.join('>'),
        hero: heroIdx >= 0 ? selection.sections[heroIdx].id : 'none',
        topbar: selection.topbar.id,
        motion: motion.id,
        palette: paletteKey(dna.palette),
        fonts: `${dna.typography.heading}/${dna.typography.body}`,
      },
      { hero: selection.alternatives.hero, topbar: selection.alternatives.topbar, motion: motionCharacterIds() },
      subdomain,
      dna.seed,
    )
    if (unique.attempts > 0) {
      log(`[uniqueness] combinatie botste — ${unique.rotated.join('+')} gedraaid na ${unique.attempts} poging(en) → ${unique.hash}`)
      if (heroIdx >= 0 && unique.combination.hero !== selection.sections[heroIdx].id) {
        selection.sections[heroIdx] = { ...selection.sections[heroIdx], id: unique.combination.hero }
      }
      if (unique.combination.topbar !== selection.topbar.id) {
        selection.topbar = { ...selection.topbar, id: unique.combination.topbar }
      }
    }
    if (unique.warning) log(`[uniqueness] ⚠ ${unique.warning}`)
    const activeMotion = unique.combination.motion === motion.id ? motion : selectMotionProfile(dna.tone, dna.seed)

    const assembled = assemblePage({
      dna, brandName, topbar: selection.topbar, nav: selection.nav,
      sections: selection.sections, footer: selection.footer, products,
      defaultStyle: selection.style, motion: activeMotion,
    })
    for (const w of assembled.warnings) log(`[assemble] ⚠ ${w}`)
    log(`[assemble] ${assembled.usedComponents.length} componenten (${selection.source}, thema ${selection.iconTheme}, beweging ${activeMotion.id}): ${assembled.usedComponents.join(', ')}${assembled.cssConflicts.length ? ` — ${assembled.cssConflicts.length} CSS-conflict!` : ''}`)

    if (assembled.cssConflicts.length > 0) throw new Error('CSS-conflicten in assemblage')
    if (assembled.usedComponents.length < 3) throw new Error('te weinig componenten')

    return {
      page: assembled.page,
      usedCatalog: true,
      componentMeta: {
        renderer: 'component-catalog', source: selection.source, iconTheme: selection.iconTheme,
        topbar: selection.topbar.id, motion: { id: activeMotion.id, label: activeMotion.label },
        used: assembled.usedComponents, cssConflicts: assembled.cssConflicts,
      },
      uniqueMeta: { hash: unique.hash, combination: unique.combination, attempts: unique.attempts, rotated: unique.rotated },
    }
  } catch (err) {
    // Het vangnet mag nooit stil blijven: als dit vaker gebeurt dan bij hoge
    // uitzondering, ziet de store er niet uit zoals bedoeld en moet iemand het
    // weten.
    const reden = err instanceof Error ? err.message : String(err)
    log(`[assemble] ⚠ TERUGVAL op de oude renderer — ${reden}`)
    console.warn(`[build-page] ${subdomain}: terugval op renderStorePage — ${reden}`)
    return {
      page: renderStorePage(dna, layout, content, products, input.signature ?? null),
      usedCatalog: false,
      componentMeta: { renderer: 'render-page (fallback)', reason: reden },
      uniqueMeta: {},
    }
  }
}
