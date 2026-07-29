// ═══════ Hero-beeld ═══════
//
// Waarom dit bestaat: elke hero gebruikte `PRODUCTS[0].image` — de kale
// leveranciersfoto — en sneed die full-bleed bij. Bij CJ is dat meestal een
// pakshot op wit: uitgesneden over 21:8 levert dat een witte vlakte op met een
// zwevend voorwerp en tekst die er los overheen ligt. Dat één winkel er wél goed
// uitzag (sculpt-fade) kwam doordat de leverancier daar toevallig een
// lifestyle-foto had geleverd, niet doordat de pipeline iets beters deed.
//
// Twee soorten hero-beeld, en de winkel weet welke hij heeft:
//
//   lifestyle — een echt sfeerbeeld (gegenereerd of meegegeven). Mag full-bleed
//               bijgesneden worden, met een scrim eroverheen voor leesbare tekst.
//   staged    — geen sfeerbeeld beschikbaar. Dan wordt de productfoto NIET
//               uitgesneden maar gepresenteerd: op een sfeerlaag uit het
//               design-DNA, volledig in beeld, met een zachte schaduw. Een
//               pakshot op wit ziet er zo bedoeld uit in plaats van toevallig.
//
// Er is altijd één van beide. Een lege of gebroken hero kan niet voorkomen: valt
// alles weg, dan blijft de sfeerlaag zelf over.

import type { DesignDNA } from './tokens.js'

export type HeroVisualKind = 'lifestyle' | 'staged'

export interface HeroVisual {
  kind: HeroVisualKind
  /** De afbeelding zelf; leeg = alleen de sfeerlaag (nooit een gebroken <img>). */
  src: string
  /** true = mag bijgesneden worden (cover), false = volledig tonen (contain). */
  fill: boolean
  /** Achtergrond onder/achter het beeld, afgeleid van het design-DNA. */
  backdrop: string
  /** Extra gloed over de sfeerlaag — geeft diepte achter een pakshot. */
  glow: string
  /** Overlay boven het beeld zodat hero-tekst leesbaar blijft. */
  scrim: string
  /** Waar het beeld vandaan komt — belandt in design-dna.json. */
  source: 'generated' | 'supplied' | 'product-photo' | 'none'
}

function mix(hex: string, pct: number, towards: string): string {
  return `color-mix(in srgb, ${hex} ${pct}%, ${towards})`
}

/**
 * Sfeerlaag uit het design-DNA: een diagonale kleurverloop van de merkkleuren.
 * Bewust in CSS en niet als afbeelding — dan is hij altijd beschikbaar, laadt
 * hij niet, en past hij per definitie bij het palet van deze winkel.
 */
export function heroBackdrop(dna: DesignDNA): { backdrop: string; glow: string } {
  const p = dna.palette
  const dark = p.mode === 'dark'
  const base = dark
    ? `linear-gradient(135deg, ${mix(p.primary, 22, p.bg)} 0%, ${p.bg} 55%, ${mix(p.accent, 18, p.bg)} 100%)`
    : `linear-gradient(135deg, ${mix(p.primary, 12, p.surfaceAlt)} 0%, ${p.surfaceAlt} 52%, ${mix(p.accent, 14, p.surfaceAlt)} 100%)`
  const glow = dark
    ? `radial-gradient(60% 55% at 50% 42%, ${mix(p.accent, 26, 'transparent')} 0%, transparent 70%)`
    : `radial-gradient(58% 52% at 50% 44%, ${mix(p.primary, 18, 'transparent')} 0%, transparent 72%)`
  return { backdrop: base, glow }
}

export interface HeroVisualInput {
  dna: DesignDNA
  /** Gegenereerd sfeerbeeld (image-gen) — heeft voorrang. */
  generated?: string | null
  /** Handmatig meegegeven beeld (CMS `imageUrls`, store-beheer). */
  supplied?: string | null
  /** De productfoto's; de eerste is de terugval. */
  products: ReadonlyArray<{ image?: string }>
}

export function resolveHeroVisual(input: HeroVisualInput): HeroVisual {
  const { backdrop, glow } = heroBackdrop(input.dna)
  const dark = input.dna.palette.mode === 'dark'

  const lifestyle = (input.generated ?? '').trim() || (input.supplied ?? '').trim()
  if (lifestyle) {
    return {
      kind: 'lifestyle', src: lifestyle, fill: true, backdrop, glow,
      // Sterke scrim: een foto met veel detail maakt witte kopregels onleesbaar.
      scrim: 'linear-gradient(90deg, rgba(0,0,0,.74), rgba(0,0,0,.30))',
      source: input.generated ? 'generated' : 'supplied',
    }
  }

  const product = (input.products.find(p => p.image)?.image ?? '').trim()
  return {
    kind: 'staged',
    src: product,
    fill: false,
    backdrop, glow,
    // Lichte scrim: het product moet zichtbaar blijven, de tekst staat ernaast
    // en niet eroverheen.
    scrim: dark
      ? 'linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.10))'
      : 'linear-gradient(90deg, rgba(0,0,0,.30), rgba(0,0,0,.04))',
    source: product ? 'product-photo' : 'none',
  }
}
