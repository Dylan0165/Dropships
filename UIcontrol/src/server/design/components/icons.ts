// ═══════ Custom SVG-iconen per thema ═══════
// Gegenereerde stores gebruiken geen icon-font en geen stock-set: dat geeft
// precies de uitwisselbare uitstraling die we willen vermijden. In plaats
// daarvan tekenen we zelf lijn-iconen, per niche-thema anders gekozen, zodat een
// sportwinkel andere symboliek krijgt dan een wellness-winkel.
//
// Alle iconen zijn `stroke`-gebaseerd met `currentColor` — daardoor volgen ze
// automatisch de kleur van hun context (dus het design-DNA) en zijn ze
// animeerbaar met de `draw`-familie uit anime-presets.ts (createDrawable werkt
// op path/line/circle, niet op fills).

export type IconTheme =
  | 'sport' | 'wellness' | 'home' | 'tech' | 'fashion'
  | 'outdoor' | 'kids' | 'pets' | 'beauty' | 'kitchen' | 'universal'

/** De rollen die componenten aanvragen; elk thema vult ze anders in. */
export type IconRole = 'shipping' | 'returns' | 'secure' | 'quality' | 'support' | 'guarantee'

// Losse pad-definities (viewBox 0 0 24 24, stroke, geen fill).
const P = {
  // vervoer & levering
  truck: '<path d="M2 7h11v9H2z"/><path d="M13 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  plane: '<path d="M3 13l18-7-6 15-3-6-6-2z"/>',
  boltDelivery: '<path d="M4 8h9l3 4h4v5h-3"/><path d="M8 17H4v-3"/><path d="M11 3L7 9h4l-2 5"/>',
  parcel: '<path d="M3 8l9-4 9 4v8l-9 4-9-4z"/><path d="M3 8l9 4 9-4"/><path d="M12 12v8"/>',
  compassShip: '<circle cx="12" cy="12" r="8"/><path d="M15 9l-2 5-5 2 2-5z"/>',
  // retour
  rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  boxBack: '<path d="M4 7h16v12H4z"/><path d="M9 12l-2 2 2 2"/><path d="M7 14h6a3 3 0 0 1 0 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  // veiligheid
  shield: '<path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  shieldCheck: '<path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  fingerprint: '<path d="M12 4a8 8 0 0 1 8 8"/><path d="M4 12a8 8 0 0 1 8-8"/><path d="M8 12a4 4 0 0 1 8 0v4"/><path d="M12 12v6"/>',
  // kwaliteit
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  medal: '<circle cx="12" cy="14" r="5"/><path d="M8 3l2 6M16 3l-2 6"/>',
  gem: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4l-3 5 6 11 6-11-3-5"/>',
  leaf: '<path d="M20 4C10 4 4 9 4 17c0 1 0 2 1 3 6 0 15-4 15-16z"/><path d="M5 19c4-6 8-9 12-11"/>',
  needle: '<path d="M4 20l7-7"/><path d="M13 11l7-7"/><circle cx="12" cy="12" r="1.6"/><path d="M17 4l3 3"/>',
  // support
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="13" width="4" height="6" rx="1.5"/><rect x="18" y="13" width="4" height="6" rx="1.5"/><path d="M20 19v1a3 3 0 0 1-3 3h-3"/>',
  heart: '<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/>',
  // garantie
  badge: '<circle cx="12" cy="10" r="6"/><path d="M9 15l-1 6 4-2 4 2-1-6"/>',
  handshake: '<path d="M3 12l4-4 4 3 3-3 4 4"/><path d="M7 8L3 12l4 4 3-2"/><path d="M18 8l3 4-4 4-3-2"/>',
  // thematisch specifiek
  dumbbell: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
  stopwatch: '<circle cx="12" cy="13" r="7"/><path d="M12 13V9M10 2h4M18 6l1.5-1.5"/>',
  droplet: '<path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z"/>',
  lotus: '<path d="M12 20c-5 0-8-3-8-6 2-1 4-1 5 0 0-3 1.5-6 3-8 1.5 2 3 5 3 8 1-1 3-1 5 0 0 3-3 6-8 6z"/>',
  house: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
  broom: '<path d="M14 3l-8 8"/><path d="M9 9l6 6"/><path d="M5 21l3-7 8 3-3 5z"/>',
  cpu: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  wifi: '<path d="M3 9a15 15 0 0 1 18 0"/><path d="M6.5 12.5a10 10 0 0 1 11 0"/><path d="M10 16a5 5 0 0 1 4 0"/><circle cx="12" cy="19" r="1"/>',
  hanger: '<path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7v2l8 5H4l8-5z"/><path d="M4 14h16v3H4z"/>',
  scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8l12 10M8 16L20 6"/>',
  mountain: '<path d="M3 19l6-11 4 6 2-3 6 8z"/><circle cx="17" cy="6" r="2"/>',
  tent: '<path d="M12 4L3 20h18z"/><path d="M12 4v16M8 20l4-7 4 7"/>',
  balloon: '<path d="M12 3a5 5 0 0 1 5 5c0 3.5-5 8-5 8S7 11.5 7 8a5 5 0 0 1 5-5z"/><path d="M12 16v3M10 21h4"/>',
  blocks: '<rect x="3" y="12" width="8" height="8" rx="1"/><rect x="13" y="12" width="8" height="8" rx="1"/><rect x="8" y="4" width="8" height="8" rx="1"/>',
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 15c0-2.5 2-4 4-4s4 1.5 4 4-2 5-4 5-4-2.5-4-5z"/>',
  bone: '<path d="M6 12h12"/><circle cx="5" cy="10" r="2"/><circle cx="5" cy="14" r="2"/><circle cx="19" cy="10" r="2"/><circle cx="19" cy="14" r="2"/>',
  bottle: '<path d="M10 3h4v3l2 3v11H8V9l2-3z"/><path d="M8 13h8"/>',
  sparkleLine: '<path d="M12 4v6M12 14v6M4 12h6M14 12h6"/><circle cx="12" cy="12" r="1.5"/>',
  pot: '<path d="M4 9h16l-1.5 10h-13z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',
  chefHat: '<path d="M6 12a3.5 3.5 0 1 1 1.4-6.7 4 4 0 0 1 7.2 0A3.5 3.5 0 1 1 18 12z"/><path d="M6 12v7h12v-7"/>',
}

const wrap = (paths: string): string => paths

/** Per thema de invulling van elke rol. */
const THEME_SETS: Record<IconTheme, Record<IconRole, string>> = {
  sport: { shipping: P.boltDelivery, returns: P.rotate, secure: P.shieldCheck, quality: P.dumbbell, support: P.stopwatch, guarantee: P.medal },
  wellness: { shipping: P.parcel, returns: P.calendar, secure: P.shield, quality: P.lotus, support: P.heart, guarantee: P.droplet },
  home: { shipping: P.truck, returns: P.boxBack, secure: P.lock, quality: P.house, support: P.chat, guarantee: P.badge },
  tech: { shipping: P.boltDelivery, returns: P.rotate, secure: P.fingerprint, quality: P.cpu, support: P.headset, guarantee: P.wifi },
  fashion: { shipping: P.parcel, returns: P.rotate, secure: P.lock, quality: P.hanger, support: P.chat, guarantee: P.scissors },
  outdoor: { shipping: P.truck, returns: P.boxBack, secure: P.shield, quality: P.mountain, support: P.compassShip, guarantee: P.tent },
  kids: { shipping: P.parcel, returns: P.rotate, secure: P.shieldCheck, quality: P.blocks, support: P.balloon, guarantee: P.heart },
  pets: { shipping: P.truck, returns: P.boxBack, secure: P.shield, quality: P.paw, support: P.chat, guarantee: P.bone },
  beauty: { shipping: P.parcel, returns: P.calendar, secure: P.lock, quality: P.gem, support: P.heart, guarantee: P.bottle },
  kitchen: { shipping: P.truck, returns: P.rotate, secure: P.shield, quality: P.chefHat, support: P.chat, guarantee: P.pot },
  universal: { shipping: P.truck, returns: P.rotate, secure: P.lock, quality: P.star, support: P.chat, guarantee: P.badge },
}

/** Extra "sfeer"-iconen per thema — voor decoratieve plekken (signature, dividers). */
const ACCENT_ICON: Record<IconTheme, string> = {
  sport: P.dumbbell, wellness: P.leaf, home: P.house, tech: P.cpu, fashion: P.hanger,
  outdoor: P.mountain, kids: P.balloon, pets: P.paw, beauty: P.sparkleLine,
  kitchen: P.chefHat, universal: P.sparkleLine,
}

/** Trefwoorden → thema. Eerste match wint; volgorde is dus betekenisvol. */
const THEME_KEYWORDS: Array<[IconTheme, string[]]> = [
  ['sport', ['sport', 'fitness', 'gym', 'training', 'workout', 'running', 'yoga mat', 'athletic', 'cycling', 'muscle']],
  ['wellness', ['wellness', 'health', 'selfcare', 'self-care', 'relax', 'massage', 'sleep', 'meditation', 'spa', 'mindful']],
  ['kitchen', ['kitchen', 'cook', 'coffee', 'tea', 'baking', 'blender', 'chef', 'food prep', 'cutlery', 'barista']],
  ['home', ['home', 'household', 'cleaning', 'storage', 'organiz', 'interior', 'furniture', 'decor', 'laundry', 'huishoud']],
  ['tech', ['tech', 'gadget', 'electronic', 'smart', 'charger', 'audio', 'gaming', 'phone', 'computer', 'device']],
  ['fashion', ['fashion', 'clothing', 'apparel', 'style', 'wear', 'jewel', 'watch', 'bag', 'shoe', 'accessor', 'mode']],
  ['outdoor', ['outdoor', 'camping', 'hiking', 'travel', 'adventure', 'fishing', 'garden', 'survival', 'bike']],
  ['kids', ['kid', 'child', 'baby', 'toy', 'toddler', 'nursery', 'school', 'play']],
  ['pets', ['pet', 'dog', 'cat', 'puppy', 'animal', 'aquarium', 'bird']],
  ['beauty', ['beauty', 'skincare', 'cosmetic', 'makeup', 'hair', 'nail', 'fragrance', 'grooming']],
]

/** Leidt het icoonthema af uit niche + interesses. Valt terug op 'universal'. */
export function iconThemeFor(niche: string, interests: string[] = []): IconTheme {
  const hay = [niche, ...interests].join(' ').toLowerCase()
  for (const [theme, words] of THEME_KEYWORDS) {
    if (words.some(w => hay.includes(w))) return theme
  }
  return 'universal'
}

export interface IconOptions {
  size?: number
  strokeWidth?: number
  /** Zet data-am="draw" zodat de bewegingslaag het pad tekent. */
  animated?: boolean
  className?: string
}

/**
 * Levert een inline SVG als JSX-string. `aria-hidden` omdat iconen hier altijd
 * naast tekst staan die de betekenis al draagt — een screenreader die "shield"
 * voorleest naast "Secure payment" voegt niets toe.
 */
export function icon(theme: IconTheme, role: IconRole, opts: IconOptions = {}): string {
  const { size = 24, strokeWidth = 1.6, animated = false, className = '' } = opts
  const paths = wrap(THEME_SETS[theme]?.[role] ?? THEME_SETS.universal[role])
  const cls = className ? ` className=${JSON.stringify(className)}` : ''
  const am = animated ? ' data-am="draw"' : ''
  return `<svg${cls}${am} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={${strokeWidth}} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">${paths}</svg>`
}

/** Decoratief sfeer-icoon van het thema. */
export function accentIcon(theme: IconTheme, opts: IconOptions = {}): string {
  const { size = 24, strokeWidth = 1.6, animated = false, className = '' } = opts
  const cls = className ? ` className=${JSON.stringify(className)}` : ''
  const am = animated ? ' data-am="draw"' : ''
  return `<svg${cls}${am} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={${strokeWidth}} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">${ACCENT_ICON[theme] ?? ACCENT_ICON.universal}</svg>`
}

/** De zes rollen in een vaste volgorde — handig voor icon-grids. */
export const ICON_ROLES: IconRole[] = ['shipping', 'returns', 'secure', 'quality', 'support', 'guarantee']

/** Standaard bijschriften per rol (Engels — alle klant-facing tekst is Engels). */
export const ROLE_LABELS: Record<IconRole, { title: string; desc: string }> = {
  shipping: { title: 'Fast EU shipping', desc: 'Dispatched from European warehouses.' },
  returns: { title: '30-day returns', desc: 'Changed your mind? Send it back.' },
  secure: { title: 'Secure checkout', desc: 'Encrypted payments via Stripe.' },
  quality: { title: 'Checked quality', desc: 'Every item is inspected before dispatch.' },
  support: { title: 'Real support', desc: 'Answers within one working day.' },
  guarantee: { title: 'Money-back promise', desc: 'Not right for you? Full refund.' },
}
