// ═══════ Engelse content-helpers ═══════
// Alle klant-facing content in gegenereerde stores is Engelstalig, ongeacht de
// taal van de wizard-input. Deze helpers produceren de niet-LLM content
// (reviews, brand story, cta-band, nav/footer labels, product badges) in het
// Engels, deterministisch geseed zodat stores onderling verschillen.

import type { VisualTone } from './tokens.js'
import { hashString } from './tokens.js'

function rngFrom(seed: number): () => number {
  let a = (seed ^ 0x85ebca6b) >>> 0
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

// ── Reviews ───────────────────────────────────────────────────────────────────
// Hier stond tot 8 augustus 2026 `generateReviews()`: een seed-gebaseerde
// generator die drie reviews met verzonnen namen ("Emma R.", "James T.") en
// templated teksten op de winkel zette, met 5 sterren in 72% van de gevallen.
// Dat is niet "sociale bewijs" maar verzonnen sociaal bewijs — een misleidende
// handelspraktijk tegenover EU-consumenten, en precies het detail waardoor een
// bezoeker de winkel als nep aanvoelt.
//
// De winkel toont daarom ALLEEN nog reviews die echt zijn aangeleverd (door de
// operator of uit een echte reviewbron). Zonder echte reviews verdwijnt de
// testimonials-sectie volledig — zie buildSelection/renderStorePage.

export interface GeneratedReview { name: string; stars: number; text: string }

/**
 * Filtert aangeleverde reviews op bruikbaarheid. Gooit niets weg wat echt is,
 * maar verzint ook niets: een lege of onbruikbare lijst blijft leeg.
 */
export function realReviews(input: unknown): GeneratedReview[] {
  if (!Array.isArray(input)) return []
  return input
    .map(r => {
      const o = (r ?? {}) as Record<string, unknown>
      const name = String(o.name ?? '').trim().slice(0, 40)
      const text = String(o.text ?? '').trim().slice(0, 400)
      const stars = Number(o.stars)
      return { name, text, stars: Number.isFinite(stars) ? Math.min(5, Math.max(1, Math.round(stars))) : 5 }
    })
    .filter(r => r.name.length > 1 && r.text.length >= 12)
    .slice(0, 12)
}

// ── Product badges (Engels), toon-afhankelijk ─────────────────────────────────
// Alleen labels die de operator kan waarmaken: nieuwheid en beschikbaarheid.
// "Bestseller", "Editor's pick", "Fan favourite", "Limited edition" en
// "Restocked" zijn claims over populariteit of schaarste en zijn verwijderd —
// dezelfde regel die checkClaims in marketing-agent.ts al handhaaft.

const BADGE_POOLS: Record<VisualTone, string[]> = {
  minimal: ['New', 'New in', 'Just landed', ''],
  playful: ['New in', 'Just landed', 'Now available', ''],
  premium: ['New', 'Newly added', 'Now available', ''],
  urban:   ['New', 'Just landed', 'Now available', ''],
  organic: ['New in', 'New season', 'Just landed', ''],
  tech:    ['New', 'Newly added', 'Now available', ''],
}

export function badgeFor(tone: VisualTone, index: number, seed: number): string {
  const pool = BADGE_POOLS[tone]
  const rng = rngFrom(seed ^ (index * 977))
  // eerste product krijgt vaker een badge
  if (index === 0) return pool.find(Boolean) ?? 'New'
  return rng() < 0.5 ? pick(rng, pool) : ''
}

// ── Brand story (Engels) ──────────────────────────────────────────────────────

// LET OP: hier mag NOOIT rauwe wizard-input (persona.problem e.d.) in — die is
// vaak Nederlands. `storyAngle` komt uit de store-builder LLM-brief en is per
// definitie Engelse marketing-copy; zonder storyAngle valt hij terug op een
// generieke Engelse regel.
export function generateStory(opts: {
  brandName: string; niche: string; storyAngle?: string; tone: VisualTone; seed: number
}): { title: string; body: string } {
  const rng = rngFrom(opts.seed ^ 0x5678)
  const problem = opts.storyAngle?.trim()
  const titles = [
    'Why we built ' + opts.brandName,
    'Made for the way you live',
    'Small idea, big difference',
    'Designed around one problem',
    'The story behind ' + opts.brandName,
    'What we would not sell you',
    'How this range came together',
    'Fewer things, chosen better',
  ]
  const openers = [
    `${opts.brandName} started with a simple frustration`,
    `We built ${opts.brandName} because the options out there felt the same`,
    `${opts.brandName} exists for one reason`,
    `Everything about ${opts.brandName} comes back to one idea`,
    `We ordered a lot of bad versions before we started ${opts.brandName}`,
    `${opts.brandName} began as a shortlist we kept passing between friends`,
  ]
  // Zonder `storyAngle` (die komt uit de LLM-brief) toch iets concreets zeggen —
  // "everyday products should just work" is precies het soort zin dat op elke
  // gegenereerde winkel past en daarom niets toevoegt.
  const genericAngles = [
    ` — the cheap versions break, and the expensive ones are mostly branding.`,
    ` — most shops sell everything and stand behind nothing.`,
    ` — waiting six weeks for something that arrives wrong is not shopping.`,
    ` — a short list you can trust beats a catalogue you have to sift through.`,
  ]
  const problemLine = problem
    ? ` — ${problem.replace(/\.$/, '')}.`
    : pick(rng, genericAngles)
  const closers = [
    `That's why we ship from within Europe, keep the range focused, and stand behind every order.`,
    `So we obsess over the details, source carefully, and back it all with a 30-day guarantee.`,
    `We keep things simple: a tight collection, fast European delivery, and honest support.`,
    `No bloated catalogue — just a few things we'd actually use ourselves, delivered fast across Europe.`,
    `Everything here is stocked in the EU, so it arrives in days and goes back just as easily.`,
    `We would rather explain one product properly than list fifty we have never touched.`,
  ]
  return {
    title: pick(rng, titles),
    body: `${pick(rng, openers)}${problemLine} ${pick(rng, closers)}`,
  }
}

// ── CTA-band (Engels) ─────────────────────────────────────────────────────────

export function generateCtaBand(seed: number): { title: string; sub: string; button: string } {
  const rng = rngFrom(seed ^ 0x9abc)
  // Concreet en controleerbaar: een verzendtermijn, een retourtermijn, een plek.
  // Geen "join thousands of happy customers" — dat is een verzonnen aantal, en
  // precies het soort regel dat elke gegenereerde winkel verraadt.
  const options = [
    { title: 'Free shipping across Europe', sub: 'On every order, no minimum. Delivered in 3–8 days.', button: 'Shop the collection' },
    { title: '30-day returns, no questions', sub: 'Send it back within a month and we refund it.', button: 'Browse products' },
    { title: 'Shipped from inside the EU', sub: 'No customs, no six-week wait, tracking from day one.', button: 'Start shopping' },
    { title: 'Packed and sent within 48 hours', sub: 'Order before Thursday and it is with you next week.', button: 'Get yours' },
    { title: 'One order, one parcel', sub: 'Everything ships together — no drip-feed of packages.', button: 'See the range' },
    { title: 'Questions get a real answer', sub: 'A reply from a person within one working day.', button: 'Shop the collection' },
    { title: 'Tested before it goes on the site', sub: 'If we would not use it ourselves, we do not list it.', button: 'Browse products' },
    { title: 'Pay the way you already pay', sub: 'iDEAL, card, PayPal and Bancontact, handled by Stripe.', button: 'Start shopping' },
  ]
  return pick(rng, options)
}

// ── Nav + footer labels (Engels, wizard-structuur-bewust) ─────────────────────

export interface NavLink { label: string; href: string }

export function buildNavLinks(): NavLink[] {
  return [
    { label: 'Shop', href: '#products' },
    { label: 'About', href: '/about/' },
    { label: 'FAQ', href: '/faq/' },
    { label: 'Contact', href: '/contact/' },
  ]
}

export function buildFooterLinks(): NavLink[] {
  return [
    { label: 'About', href: '/about/' },
    { label: 'Returns', href: '/returns/' },
    { label: 'Contact', href: '/contact/' },
    { label: 'FAQ', href: '/faq/' },
  ]
}

/** Engelse hero-label ("New — 2026" e.d.), toon-afhankelijk. */
export function heroLabel(tone: VisualTone, seed: number, year: number): string {
  const rng = rngFrom(seed ^ 0xdef0)
  const pools: Record<VisualTone, string[]> = {
    minimal: [`New — ${year}`, 'The essentials', 'Just landed'],
    playful: ['Just dropped', `New for ${year}`, 'Fan favourite'],
    premium: [`The ${year} collection`, 'Signature line', 'Newly curated'],
    urban:   ['New drop', `${year} lineup`, 'Fresh heat'],
    organic: ['New season', 'Freshly stocked', `${year} range`],
    tech:    ['Now available', `${year} release`, 'Newly upgraded'],
  }
  return pick(rng, pools[tone])
}

export { hashString }
