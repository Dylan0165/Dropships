// ═══════ Component-bibliotheek — types + gedeelde render-context ═══════
// De store-generatie gaat van "LLM schrijft ruwe JSX" naar "LLM kiest en
// configureert componenten uit deze catalogus". Elk component is een vooraf
// geschreven, geteste render-functie die JSX + CSS produceert uit het design-DNA
// via CSS-variabelen (--c-*, --f-*, --r-*) — nooit hardgecodeerde kleuren/fonts.
// Zo sluit de art-director-flow (design-plan.ts) er direct op aan en delen alle
// componenten hetzelfde token-systeem.

import type { DesignDNA } from '../tokens.js'

export type ComponentCategory =
  | 'hero' | 'products' | 'testimonials' | 'cta' | 'nav' | 'footer'
  | 'content' | 'form' | 'badges' | 'gallery'

/** Interne stijl-varianten die bovenop de structurele variant liggen. */
export type StyleVariant = 'minimal' | 'bold' | 'playful' | 'editorial'

/** Animatie-intensiteit per component (sluit aan op het bestaande rv/hi-systeem). */
export type AnimationVariant = 'none' | 'subtle' | 'expressive'

export interface RenderCtx {
  /** Vlakke tokens; identiek aan wat als CSS-variabelen beschikbaar is. */
  dna: DesignDNA
  style: StyleVariant
  anim: AnimationVariant
  /** Volgnummer van dit component op de pagina (voor unieke keys/ids). */
  index: number
}

/** Wat een render-functie teruggeeft: JSX-fragment + (optioneel) eigen CSS. */
export interface RenderResult {
  jsx: string
  css?: string
  /** Componenten die producten renderen zetten dit zodat de assembler weet dat
   * de #products-anchor aanwezig is (checkout-CTA's kunnen ernaar linken). */
  hasProducts?: boolean
}

/** Props die een component-instantie meekrijgt (door de LLM ingevuld). */
export type ComponentProps = Record<string, unknown>

export interface ComponentDef {
  /** Uniek id, bv. "hero.split-left" — dit kiest de LLM. */
  id: string
  category: ComponentCategory
  /** Korte structurele omschrijving voor de catalogus (LLM-facing). */
  label: string
  /** Welke stijl-varianten dit component ondersteunt. */
  styles: StyleVariant[]
  /** Welke animatie-varianten. */
  anims: AnimationVariant[]
  /** Niche/toon-tags waar dit goed bij past (LLM-hint). */
  tags: string[]
  /** Props-schema (naam → korte beschrijving) voor de catalogus. */
  props: Record<string, string>
  /** Kan dit component het "signature element" van de store zijn? */
  canBeSignature?: boolean
  /** De render-functie (NIET in de catalogus — alleen server-side). */
  render: (ctx: RenderCtx, props: ComponentProps) => RenderResult
}

/** LLM-facing catalogus-entry (zonder broncode). */
export interface CatalogEntry {
  id: string
  category: ComponentCategory
  label: string
  styles: StyleVariant[]
  anims: AnimationVariant[]
  tags: string[]
  props: Record<string, string>
  canBeSignature?: boolean
}

/** De keuze die de LLM per component teruggeeft. */
export interface ComponentSelection {
  id: string
  style?: StyleVariant
  anim?: AnimationVariant
  props?: ComponentProps
}

// ── Gedeelde helpers voor alle componenten ────────────────────────────────────

/** JSON-veilige emit van dynamische tekst in gegenereerde TSX (nooit rauw). */
export const j = (v: unknown): string => JSON.stringify(v)

/** Stijl-afhankelijke schaal-tokens (spacing/typografie-accent per StyleVariant). */
export function styleTokens(style: StyleVariant) {
  switch (style) {
    case 'bold':      return { padY: 'clamp(4rem,9vw,8rem)', titleScale: 1.15, labelSpacing: '.2em', weight: 800 }
    case 'playful':   return { padY: 'clamp(3rem,7vw,6rem)', titleScale: 1.05, labelSpacing: '.12em', weight: 700 }
    case 'editorial': return { padY: 'clamp(4.5rem,10vw,9rem)', titleScale: 1.1, labelSpacing: '.3em', weight: 500 }
    case 'minimal':
    default:          return { padY: 'clamp(3.5rem,8vw,7rem)', titleScale: 1, labelSpacing: '.24em', weight: 700 }
  }
}

/**
 * Bouwt de CSS-variabele-declaraties uit het design-DNA. Alle componenten
 * verwijzen naar var(--c-*) i.p.v. hardgecodeerde waarden → één store =
 * één DNA = consistente kleuren/fonts over alle componenten.
 */
export function dnaCssVars(dna: DesignDNA): string {
  const p = dna.palette
  const t = dna.typography
  const s = dna.shape
  const btnRadius = s.buttonStyle === 'pill' ? s.radiusPill : s.buttonStyle === 'sharp' ? '0px' : s.radiusMd
  const decls: Record<string, string> = {
    '--c-bg': p.bg, '--c-surface': p.surface, '--c-surface-alt': p.surfaceAlt,
    '--c-text': p.text, '--c-muted': p.textMuted, '--c-primary': p.primary,
    '--c-primary-text': p.primaryText, '--c-secondary': p.secondary,
    '--c-accent': p.accent, '--c-border': p.border,
    '--f-head': t.heading, '--f-body': t.body,
    '--fw-head': String(t.headingWeight), '--fw-body': String(t.bodyWeight),
    '--tt-head': t.headingTransform, '--ls-head': t.headingLetterSpacing,
    '--r-sm': s.radiusSm, '--r-md': s.radiusMd, '--r-lg': s.radiusLg, '--r-pill': s.radiusPill,
    '--r-btn': btnRadius, '--bw': s.borderWidth,
    '--shadow': s.shadow === 'none' ? '0 6px 24px rgba(0,0,0,0.10)' : s.shadow,
  }
  return ':root{' + Object.entries(decls).map(([k, v]) => `${k}:${v}`).join(';') + '}'
}
