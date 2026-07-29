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
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

// ── Reviews (Engels, internationale namen) ────────────────────────────────────

const REVIEWER_NAMES = [
  'Emma R.', 'James T.', 'Sofia L.', 'Liam K.', 'Nora B.', 'Lucas M.', 'Mia V.',
  'Noah P.', 'Olivia S.', 'Daniel H.', 'Ava C.', 'Leo W.', 'Isla F.', 'Max D.',
  'Chloe N.', 'Ethan G.', 'Zoe A.', 'Adam J.', 'Freya O.', 'Sam B.',
]

const REVIEW_TEMPLATES = [
  'Exactly as described — the quality genuinely surprised me.',
  'Fast delivery and the packaging felt really premium.',
  'Been using it every day since it arrived. Highly recommend.',
  'Better than I expected for the price. Will order again.',
  'Shipping was quick and it works perfectly. Five stars.',
  'Great value and it looks even better in person.',
  'Customer service answered within a day — smooth experience.',
  'My second purchase from them. Consistent quality every time.',
  'Solid build and does exactly what it promises.',
  'Arrived earlier than expected and the finish is beautiful.',
]

export interface GeneratedReview { name: string; stars: number; text: string }

export function generateReviews(seed: number, count = 3): GeneratedReview[] {
  const rng = rngFrom(seed ^ 0x1234)
  const names = shuffle(REVIEWER_NAMES, rng).slice(0, count)
  const texts = shuffle(REVIEW_TEMPLATES, rng).slice(0, count)
  return names.map((name, i) => ({
    name,
    text: texts[i],
    stars: rng() < 0.72 ? 5 : 4,
  }))
}

// ── Product badges (Engels), toon-afhankelijk ─────────────────────────────────

const BADGE_POOLS: Record<VisualTone, string[]> = {
  minimal: ['Bestseller', 'New', 'Essential', ''],
  playful: ['Fan favourite', 'New drop', 'Hot', 'Limited'],
  premium: ['Signature', 'New', 'Editor’s pick', 'Limited edition'],
  urban:   ['Bestseller', 'Drop', 'Hyped', 'Restocked'],
  organic: ['Bestseller', 'New in', 'Small batch', ''],
  tech:    ['Bestseller', 'New', 'Upgraded', 'Pro'],
}

export function badgeFor(tone: VisualTone, index: number, seed: number): string {
  const pool = BADGE_POOLS[tone]
  const rng = rngFrom(seed ^ (index * 977))
  // eerste product krijgt vaker een badge
  if (index === 0) return pool.find(Boolean) ?? 'Bestseller'
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
