// ═══════ LLM Design Plan ═══════
// De store-builder LLM ontwerpt per store BEWUST een token-systeem (kleuren met
// rollen, typografie-pairing, layout-concept, één signature-element) vóórdat er
// iets gebouwd wordt. Dit module valideert dat plan en past het toe op het
// seeded design-DNA (dat als vangnet blijft bestaan voor LLM-uitval):
//   - palet: 4-6 benoemde hex-kleuren met rollen → volledige DesignPalette,
//     met WCAG-contrast-guard zodat een creatief palet nooit onleesbaar wordt
//   - typografie: display + body uit een gecureerde Google-Fonts lijst
//     (gegarandeerd laadbaar; de LLM kiest het karakter, wij de infrastructuur)
//   - layout: concrete hero/product/sectie-voorkeur (gevalideerd tegen varianten)
//   - signature: één implementeerbaar gedenkwaardig element per store

import { z } from 'zod'
import { hexToHsl, type DesignDNA, type DesignPalette } from './tokens.js'
import type { HeroVariant, ProductVariant, SectionId } from './layout.js'

// ── Signature-elementen (bounded vocabulaire — elk daadwerkelijk gerenderd) ────

export const SIGNATURE_TYPES = [
  'ticker-band',          // doorlopende marquee-band met merkwoorden
  'outline-word',         // reusachtig outline-woord door de hero
  'floating-badge',       // langzaam draaiende ronde sticker-badge
  'gradient-orb',         // zwevende brand-gekleurde gloed-orbs in de hero
  'pattern-divider',      // niche-passende golf/zigzag SVG-divider na de hero
  'numbered-collection',  // editorial 01/02/03-nummering op de productkaarten
] as const
export type SignatureType = typeof SIGNATURE_TYPES[number]

export interface SignatureElement {
  type: SignatureType
  /** tekst-parameter: woorden voor de ticker (· gescheiden), badge-tekst, outline-woord */
  text?: string
}

// ── Gecureerde fontlijsten (Google Fonts — gegarandeerd beschikbaar) ───────────

interface FontDef { css: string; query: string }

export const DISPLAY_FONTS: Record<string, FontDef> = {
  'Fraunces':            { css: "'Fraunces', Georgia, serif",             query: 'Fraunces:opsz,wght@9..144,500;9..144,700' },
  'DM Serif Display':    { css: "'DM Serif Display', Georgia, serif",     query: 'DM+Serif+Display' },
  'Playfair Display':    { css: "'Playfair Display', Georgia, serif",     query: 'Playfair+Display:wght@500;700' },
  'Cormorant Garamond':  { css: "'Cormorant Garamond', Georgia, serif",   query: 'Cormorant+Garamond:wght@500;600;700' },
  'Instrument Serif':    { css: "'Instrument Serif', Georgia, serif",     query: 'Instrument+Serif' },
  'Gloock':              { css: "'Gloock', Georgia, serif",               query: 'Gloock' },
  'Marcellus':           { css: "'Marcellus', Georgia, serif",            query: 'Marcellus' },
  'Abril Fatface':       { css: "'Abril Fatface', Georgia, serif",        query: 'Abril+Fatface' },
  'Space Grotesk':       { css: "'Space Grotesk', system-ui, sans-serif", query: 'Space+Grotesk:wght@500;700' },
  'Unbounded':           { css: "'Unbounded', system-ui, sans-serif",     query: 'Unbounded:wght@500;700' },
  'Syne':                { css: "'Syne', system-ui, sans-serif",          query: 'Syne:wght@600;800' },
  'Bricolage Grotesque': { css: "'Bricolage Grotesque', system-ui, sans-serif", query: 'Bricolage+Grotesque:wght@500;700;800' },
  'Archivo Black':       { css: "'Archivo Black', system-ui, sans-serif", query: 'Archivo+Black' },
  'Bebas Neue':          { css: "'Bebas Neue', system-ui, sans-serif",    query: 'Bebas+Neue' },
  'Anton':               { css: "'Anton', system-ui, sans-serif",         query: 'Anton' },
  'Righteous':           { css: "'Righteous', system-ui, sans-serif",     query: 'Righteous' },
  'Baloo 2':             { css: "'Baloo 2', system-ui, sans-serif",       query: 'Baloo+2:wght@600;800' },
  'Chakra Petch':        { css: "'Chakra Petch', system-ui, sans-serif",  query: 'Chakra+Petch:wght@500;700' },
}

export const BODY_FONTS: Record<string, FontDef> = {
  'Inter':       { css: "'Inter', system-ui, sans-serif",       query: 'Inter:wght@400;500;600' },
  'Manrope':     { css: "'Manrope', system-ui, sans-serif",     query: 'Manrope:wght@400;500;700' },
  'Sora':        { css: "'Sora', system-ui, sans-serif",        query: 'Sora:wght@400;600' },
  'Outfit':      { css: "'Outfit', system-ui, sans-serif",      query: 'Outfit:wght@400;500;600' },
  'Work Sans':   { css: "'Work Sans', system-ui, sans-serif",   query: 'Work+Sans:wght@400;500;600' },
  'DM Sans':     { css: "'DM Sans', system-ui, sans-serif",     query: 'DM+Sans:wght@400;500;700' },
  'Karla':       { css: "'Karla', system-ui, sans-serif",       query: 'Karla:wght@400;500;700' },
  'Nunito Sans': { css: "'Nunito Sans', system-ui, sans-serif", query: 'Nunito+Sans:wght@400;600;700' },
  'Albert Sans': { css: "'Albert Sans', system-ui, sans-serif", query: 'Albert+Sans:wght@400;500;700' },
  'Figtree':     { css: "'Figtree', system-ui, sans-serif",     query: 'Figtree:wght@400;500;600' },
  'Jost':        { css: "'Jost', system-ui, sans-serif",        query: 'Jost:wght@300;400;500' },
  'Poppins':     { css: "'Poppins', system-ui, sans-serif",     query: 'Poppins:wght@400;500;600' },
}

// ── Zod-schema voor het LLM-ontwerpplan ────────────────────────────────────────

export const DesignPlanSchema = z.object({
  // Het korte ontwerpplan + de zelf-check ("zou dit voor elke winkel werken?")
  design_rationale: z.string().min(20).max(700),
  palette: z.array(z.object({
    name: z.string().min(1).max(40),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    role: z.enum(['background', 'surface', 'text', 'muted', 'primary', 'accent']),
  })).min(4).max(6),
  typography: z.object({
    display: z.string().min(1),
    body: z.string().min(1),
    display_usage: z.string().max(200).optional(),
  }),
  layout: z.object({
    hero: z.enum(['split', 'centered', 'editorial', 'fullbleed', 'minimal-left']).optional(),
    products: z.enum(['grid', 'featured-grid', 'carousel', 'editorial-list']).optional(),
    section_order: z.array(z.enum(['usps', 'products', 'story', 'reviews', 'cta-band'])).min(2).max(5).optional(),
  }).optional(),
  signature_element: z.object({
    type: z.enum(SIGNATURE_TYPES),
    text: z.string().max(120).optional(),
    why: z.string().max(300).optional(),
  }),
})

export type DesignPlan = z.infer<typeof DesignPlanSchema>

export interface LayoutPreference {
  hero?: HeroVariant
  product?: ProductVariant
  sections?: SectionId[]
}

// ── Kleur-utilities (contrast-guard) ───────────────────────────────────────────

function relLuminance(hex: string): number {
  const m = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(m.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** mix twee hexkleuren (t=0 → a, t=1 → b) */
function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace('#', ''), pb = b.replace('#', '')
  const c = [0, 2, 4].map(i => {
    const va = parseInt(pa.slice(i, i + 2), 16), vb = parseInt(pb.slice(i, i + 2), 16)
    return Math.round(va + (vb - va) * t).toString(16).padStart(2, '0')
  })
  return `#${c.join('')}`
}

function readable(bg: string): string {
  return relLuminance(bg) > 0.42 ? '#101216' : '#ffffff'
}

// ── "AI-default look" heuristiek (waarschuwing, geen blokkade) ─────────────────
// De prompt verbiedt de defaults al; dit is het meetbare vangnet dat in de logs
// laat zien wanneer de LLM er tóch een koos.

export function detectDefaultLook(palette: DesignPalette): string | null {
  const bg = hexToHsl(palette.bg)
  const accent = hexToHsl(palette.accent)
  const primary = hexToHsl(palette.primary)
  if (!bg || !accent || !primary) return null
  const isCream = bg.l > 88 && bg.s > 8 && bg.s < 45 && bg.h >= 25 && bg.h <= 70
  const isTerracotta = (c: { h: number; s: number; l: number }) => c.h >= 5 && c.h <= 32 && c.s > 30 && c.l > 38 && c.l < 68
  if (isCream && (isTerracotta(accent) || isTerracotta(primary))) {
    return 'default-look (a): crème + terracotta'
  }
  if (bg.l < 11 && Math.abs(accent.h - primary.h) < 18 && accent.s > 70) {
    return 'default-look (b): near-black + één felle accentkleur'
  }
  return null
}

// ── Plan toepassen op het DNA ──────────────────────────────────────────────────

export interface AppliedDesign {
  dna: DesignDNA
  signature: SignatureElement | null
  layoutPreference: LayoutPreference | null
  planApplied: boolean
  warnings: string[]
}

export function applyDesignPlan(dna: DesignDNA, plan: DesignPlan | undefined | null): AppliedDesign {
  if (!plan) return { dna, signature: null, layoutPreference: null, planApplied: false, warnings: [] }
  const warnings: string[] = []
  const out: DesignDNA = { ...dna, palette: { ...dna.palette }, typography: { ...dna.typography } }

  // ── Palet: rollen → DesignPalette, met afgeleiden + contrast-guard ──────────
  const byRole = new Map(plan.palette.map(p => [p.role, p.hex]))
  const bg = byRole.get('background')
  const text = byRole.get('text')
  const primary = byRole.get('primary')
  const accent = byRole.get('accent')

  if (bg && text && primary) {
    let safeText = text
    if (contrastRatio(bg, text) < 4.5) {
      safeText = readable(bg)
      warnings.push(`tekst/achtergrond-contrast te laag (${contrastRatio(bg, text).toFixed(1)}:1) — tekstkleur gecorrigeerd`)
    }
    const dark = relLuminance(bg) < 0.22
    const surface = byRole.get('surface') ?? (dark ? mixHex(bg, '#ffffff', 0.06) : mixHex(bg, '#ffffff', 0.65))
    out.palette = {
      mode: dark ? 'dark' : 'light',
      bg,
      surface,
      surfaceAlt: mixHex(surface, bg, 0.5),
      text: safeText,
      textMuted: byRole.get('muted') ?? mixHex(safeText, bg, 0.42),
      primary,
      primaryText: readable(primary),
      secondary: mixHex(primary, dark ? '#000000' : '#101216', 0.55),
      accent: accent ?? primary,
      border: mixHex(safeText, bg, 0.86),
    }
    const defaultLook = detectDefaultLook(out.palette)
    if (defaultLook) warnings.push(`LLM koos alsnog een ${defaultLook} — prompt-regel genegeerd (palet wél toegepast)`)
  } else {
    warnings.push('palet mist background/text/primary rollen — seeded DNA-palet behouden')
  }

  // ── Typografie: alleen fonts uit de allowlist (anders DNA behouden) ─────────
  const disp = DISPLAY_FONTS[plan.typography.display]
  const body = BODY_FONTS[plan.typography.body]
  if (disp && body) {
    out.typography = {
      ...out.typography,
      fontUrl: `https://fonts.googleapis.com/css2?family=${disp.query}&family=${body.query}&display=swap`,
      heading: disp.css,
      body: body.css,
    }
  } else {
    warnings.push(`font "${plan.typography.display}"/"${plan.typography.body}" niet in de allowlist — DNA-typografie behouden`)
  }

  // ── Layout-voorkeur (gevalideerd door Zod; layout.ts past anti-herhaling toe) ─
  const layoutPreference: LayoutPreference | null = plan.layout
    ? { hero: plan.layout.hero, product: plan.layout.products, sections: plan.layout.section_order }
    : null

  return {
    dna: out,
    signature: { type: plan.signature_element.type, text: plan.signature_element.text },
    layoutPreference,
    planApplied: true,
    warnings,
  }
}
