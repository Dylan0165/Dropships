// ═══════ Design DNA ═══════
// Genereert per store een uniek "design DNA": kleurpalet, typografie-pairing,
// radius/spacing-schaal en visuele toon — afgeleid van het doelgroepprofiel
// (persona) uit de wizard, NIET willekeurig.
//
// Bepalend: prijsklasse, leeftijd, niche-type en interesses → visuele toon.
// De toon kiest curated pools; een seed (runId + brand) breekt gelijkspel en
// zorgt dat twee stores met verschillende persona's aantoonbaar andere tokens
// krijgen. Deterministisch: zelfde input → zelfde DNA (reproduceerbaar).

export type VisualTone = 'minimal' | 'playful' | 'premium' | 'urban' | 'organic' | 'tech'

export interface DesignPalette {
  mode: 'light' | 'dark'
  bg: string
  surface: string
  surfaceAlt: string
  text: string
  textMuted: string
  primary: string
  primaryText: string   // leesbare tekstkleur bovenop primary
  secondary: string
  accent: string
  border: string
}

export interface DesignTypography {
  fontUrl: string
  heading: string
  body: string
  headingWeight: number
  bodyWeight: number
  headingTransform: 'none' | 'uppercase'
  headingLetterSpacing: string
  headingScale: number   // multiplier op basis-heading grootte
}

export interface DesignShape {
  radiusSm: string
  radiusMd: string
  radiusLg: string
  radiusPill: string
  sectionPadY: string    // verticale sectie-ademruimte
  contentGap: string
  shadow: string
  buttonStyle: 'solid' | 'outline' | 'pill' | 'sharp'
  borderWidth: string
}

export interface DesignDNA {
  tone: VisualTone
  palette: DesignPalette
  typography: DesignTypography
  shape: DesignShape
  seed: number
}

export interface PersonaLike {
  label?: string
  ageRange?: string
  interests?: string[]
  buyingMotivation?: string
  problem?: string
  priceRange?: { min: number; max: number }
  tone?: string
}

// ── Seeded RNG (deterministisch) ──────────────────────────────────────────────

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

// ── Kleur helpers (HSL ↔ hex) voor volledige controle + gegarandeerde spreiding ─

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const k = (n: number): number => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x: number): string => Math.round(255 * x).toString(16).padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(m) && !/^[0-9a-fA-F]{3}$/.test(m)) return null
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 }
}

function readableText(bgHex: string): string {
  const hsl = hexToHsl(bgHex)
  if (!hsl) return '#ffffff'
  // WCAG-achtige luminantie-benadering via lightness
  return hsl.l > 58 ? '#0f1115' : '#ffffff'
}

// ── Toon-bepaling uit persona ──────────────────────────────────────────────────

export function deriveTone(persona: PersonaLike, niche: string, rng: () => number): VisualTone {
  const text = `${niche} ${persona.label ?? ''} ${(persona.interests ?? []).join(' ')} ${persona.tone ?? ''} ${persona.buyingMotivation ?? ''}`.toLowerCase()
  const priceMax = persona.priceRange?.max ?? 0
  const ageMin = parseInt((persona.ageRange ?? '').match(/\d+/)?.[0] ?? '35', 10)

  const scores: Record<VisualTone, number> = { minimal: 1, playful: 0, premium: 0, urban: 0, organic: 0, tech: 0 }

  if (priceMax >= 55 || /premium|luxe|luxury|exclusive|professional|office|design/.test(text)) scores.premium += 3
  if (ageMin <= 28 || /fitness|sport|gym|gaming|street|urban|energie|energy|workout|bold/.test(text)) { scores.urban += 2; scores.playful += 1 }
  if (/tech|gadget|smart|device|electronic|audio|charge|drone/.test(text)) scores.tech += 3
  if (/food|drink|coffee|tea|organic|eco|natural|wellness|beauty|skin|plant|garden|home/.test(text)) scores.organic += 2
  if (/kids|fun|colorful|playful|party|pet|cute|toy|hobby/.test(text)) scores.playful += 2
  if (ageMin >= 40 && priceMax < 55) scores.minimal += 1
  if (/minimal|clean|simple|scandi/.test(text)) scores.minimal += 2

  // seed-jitter zodat gelijke scores per store anders vallen
  for (const k of Object.keys(scores) as VisualTone[]) scores[k] += rng() * 0.9

  return (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]) as VisualTone
}

// ── Palet-generatie: HSL-gebaseerd, per toon, met brand-hue respect ─────────────

const TONE_HUE_BIAS: Record<VisualTone, [number, number]> = {
  minimal: [200, 260],
  playful: [330, 45],   // wraps: pink → warm
  premium: [255, 285],
  urban:   [220, 260],
  organic: [20, 130],
  tech:    [190, 230],
}

function baseHue(tone: VisualTone, brandPrimary: string | undefined, rng: () => number): number {
  const fromBrand = brandPrimary ? hexToHsl(brandPrimary) : null
  if (fromBrand && fromBrand.s > 12) {
    // Respecteer brand-intentie maar roteer licht per store voor spreiding
    return (fromBrand.h + (rng() * 40 - 20) + 360) % 360
  }
  const [lo, hi] = TONE_HUE_BIAS[tone]
  const span = (hi - lo + 360) % 360
  return (lo + rng() * span) % 360
}

function buildPalette(tone: VisualTone, brandPrimary: string | undefined, rng: () => number): DesignPalette {
  const h = baseHue(tone, brandPrimary, rng)
  // Accent-schema: complementair / analoog / triadisch — per store gekozen
  const scheme = pick(rng, [180, 150, 210, 30, 330, 120])
  const accentHue = (h + scheme) % 360

  // Dark-mode kans afhankelijk van toon
  const darkChance: Record<VisualTone, number> = {
    minimal: 0.15, playful: 0.1, premium: 0.55, urban: 0.7, organic: 0.15, tech: 0.5,
  }
  const dark = rng() < darkChance[tone]

  // Saturatie/lightness-strategie per toon
  const satMap: Record<VisualTone, number> = {
    minimal: 42, playful: 82, premium: 38, urban: 30, organic: 52, tech: 72,
  }
  const sat = satMap[tone] + (rng() * 14 - 7)
  const primaryL = dark ? 62 : (tone === 'premium' ? 34 : tone === 'urban' ? 26 : 48)

  const primary = hslToHex(h, sat, primaryL)
  const accent = hslToHex(accentHue, Math.min(95, sat + 12), dark ? 66 : 52)
  const secondary = hslToHex(h, Math.max(12, sat - 20), dark ? 20 : 22)

  if (dark) {
    const bgL = tone === 'urban' ? 7 : 10
    return {
      mode: 'dark',
      bg: hslToHex(h, 14, bgL),
      surface: hslToHex(h, 12, bgL + 6),
      surfaceAlt: hslToHex(h, 12, bgL + 11),
      text: hslToHex(h, 8, 96),
      textMuted: hslToHex(h, 10, 66),
      primary, primaryText: readableText(primary),
      secondary, accent,
      border: hslToHex(h, 12, bgL + 16),
    }
  }
  const bgTint = tone === 'organic' ? 40 : tone === 'minimal' ? 20 : 30
  return {
    mode: 'light',
    bg: hslToHex(h, Math.min(bgTint, 18), tone === 'organic' ? 97 : 98.5),
    surface: '#ffffff',
    surfaceAlt: hslToHex(h, 16, 96),
    text: hslToHex(h, 18, tone === 'urban' ? 8 : 12),
    textMuted: hslToHex(h, 10, 46),
    primary, primaryText: readableText(primary),
    secondary, accent,
    border: hslToHex(h, 14, 90),
  }
}

// ── Typografie-pools per toon ───────────────────────────────────────────────────

interface FontPair {
  fontUrl: string; heading: string; body: string
  headingWeight: number; bodyWeight: number
  transform: 'none' | 'uppercase'; letterSpacing: string; scale: number
}

const FONTS: Record<VisualTone, FontPair[]> = {
  minimal: [
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap', heading: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", headingWeight: 800, bodyWeight: 400, transform: 'none', letterSpacing: '-0.02em', scale: 1 },
    { fontUrl: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap', heading: "'DM Serif Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif", headingWeight: 400, bodyWeight: 400, transform: 'none', letterSpacing: '-0.01em', scale: 1.05 },
  ],
  playful: [
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Nunito:wght@400;600&display=swap', heading: "'Baloo 2', system-ui, sans-serif", body: "'Nunito', system-ui, sans-serif", headingWeight: 800, bodyWeight: 400, transform: 'none', letterSpacing: '0', scale: 1.08 },
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Poppins:wght@400;500&display=swap', heading: "'Fredoka', system-ui, sans-serif", body: "'Poppins', system-ui, sans-serif", headingWeight: 700, bodyWeight: 400, transform: 'none', letterSpacing: '0', scale: 1.05 },
  ],
  premium: [
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,400&family=Lato:wght@300;400;700&display=swap', heading: "'Playfair Display', Georgia, serif", body: "'Lato', system-ui, sans-serif", headingWeight: 700, bodyWeight: 300, transform: 'none', letterSpacing: '-0.01em', scale: 1.1 },
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@300;400;500&display=swap', heading: "'Cormorant Garamond', Georgia, serif", body: "'Jost', system-ui, sans-serif", headingWeight: 600, bodyWeight: 300, transform: 'none', letterSpacing: '0.01em', scale: 1.18 },
  ],
  urban: [
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Archivo:wght@400;500&display=swap', heading: "'Archivo', system-ui, sans-serif", body: "'Archivo', system-ui, sans-serif", headingWeight: 900, bodyWeight: 400, transform: 'uppercase', letterSpacing: '-0.01em', scale: 1.05 },
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500&display=swap', heading: "'Anton', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", headingWeight: 400, bodyWeight: 400, transform: 'uppercase', letterSpacing: '0.01em', scale: 1.15 },
  ],
  organic: [
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400&family=Figtree:wght@300;400;600&display=swap', heading: "'Fraunces', Georgia, serif", body: "'Figtree', system-ui, sans-serif", headingWeight: 600, bodyWeight: 400, transform: 'none', letterSpacing: '-0.01em', scale: 1.08 },
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,600;1,400&family=Karla:wght@400;500&display=swap', heading: "'Spectral', Georgia, serif", body: "'Karla', system-ui, sans-serif", headingWeight: 600, bodyWeight: 400, transform: 'none', letterSpacing: '0', scale: 1.06 },
  ],
  tech: [
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Grotesk:wght@400;500&display=swap', heading: "'Space Grotesk', system-ui, sans-serif", body: "'Space Grotesk', system-ui, sans-serif", headingWeight: 700, bodyWeight: 400, transform: 'none', letterSpacing: '-0.02em', scale: 1.04 },
    { fontUrl: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=Inter:wght@400;500&display=swap', heading: "'Chakra Petch', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", headingWeight: 700, bodyWeight: 400, transform: 'uppercase', letterSpacing: '0.02em', scale: 1.02 },
  ],
}

function buildTypography(tone: VisualTone, rng: () => number): DesignTypography {
  const fp = pick(rng, FONTS[tone])
  return {
    fontUrl: fp.fontUrl,
    heading: fp.heading,
    body: fp.body,
    headingWeight: fp.headingWeight,
    bodyWeight: fp.bodyWeight,
    headingTransform: fp.transform,
    headingLetterSpacing: fp.letterSpacing,
    headingScale: fp.scale,
  }
}

// ── Vorm-schaal per toon ────────────────────────────────────────────────────────

function buildShape(tone: VisualTone, rng: () => number): DesignShape {
  const radiusByTone: Record<VisualTone, number> = {
    minimal: 8, playful: 22, premium: 4, urban: 0, organic: 16, tech: 6,
  }
  const base = radiusByTone[tone] + Math.round(rng() * 4)
  const sectionByTone: Record<VisualTone, number> = {
    minimal: 6, playful: 5, premium: 8, urban: 4.5, organic: 6.5, tech: 5,
  }
  const padY = (sectionByTone[tone] + rng() * 1.5).toFixed(1)

  const buttonStyle: DesignShape['buttonStyle'] =
    tone === 'urban' ? 'sharp'
    : tone === 'playful' || tone === 'organic' ? 'pill'
    : rng() < 0.3 ? 'outline' : 'solid'

  return {
    radiusSm: `${Math.max(0, base - 4)}px`,
    radiusMd: `${base}px`,
    radiusLg: `${base + 8}px`,
    radiusPill: '999px',
    sectionPadY: `${padY}rem`,
    contentGap: tone === 'premium' || tone === 'minimal' ? '2.5rem' : '1.5rem',
    shadow: tone === 'urban'
      ? 'none'
      : tone === 'premium'
        ? '0 20px 60px rgba(0,0,0,0.12)'
        : '0 8px 30px rgba(0,0,0,0.08)',
    buttonStyle,
    borderWidth: tone === 'urban' ? '2px' : '1px',
  }
}

// ── Publieke entry ──────────────────────────────────────────────────────────────

export function deriveDesignDNA(opts: {
  persona: PersonaLike
  niche: string
  seed: string
  brandPrimary?: string
}): DesignDNA {
  const seedNum = hashString(`${opts.seed}|${opts.niche}|${opts.persona.label ?? ''}|${opts.persona.priceRange?.max ?? ''}`)
  const rng = mulberry32(seedNum)
  const tone = deriveTone(opts.persona, opts.niche, rng)
  return {
    tone,
    palette: buildPalette(tone, opts.brandPrimary, rng),
    typography: buildTypography(tone, rng),
    shape: buildShape(tone, rng),
    seed: seedNum,
  }
}

/** Fallback-persona voor niet-wizard runs, zodat DNA-variatie altijd werkt. */
export function fallbackPersona(niche: string, brandTone?: string): PersonaLike {
  return { label: niche, interests: niche.split(/\s+/).slice(0, 3), tone: brandTone }
}
