// ═══════ Anti-generieke-AI-output filter ═══════
// Twee dingen verraden LLM-gegenereerde webshops direct: emoji-confetti in de
// copy (🚀✨🔥💯) en een handvol standaard-looks. Dit bestand weert het eerste
// hard uit élke tekst die een store in gaat, en levert de stijlruimte-definitie
// waarmee design-plan.ts het tweede tegenhoudt.
//
// Filteren gebeurt BIJ DE POORT: alle LLM-output passeert `sanitizeCopyDeep`
// voordat er ook maar iets gerenderd wordt. Een prompt-instructie ("gebruik geen
// emoji") is een verzoek; dit is een garantie.

/**
 * Unicode-reeksen die we als "AI-emoji" behandelen. Bewust breed: pictogrammen,
 * emoticons, transport/kaart-symbolen, dingbats, vlaggen en de
 * variatie-selector + zero-width-joiner die samengestelde emoji lijmen.
 *
 * NIET geweerd: typografische tekens die legitiem in webshop-copy staan —
 * € £ ¥ § © ® ™ ° … — en de HTML-entities die de componenten zelf gebruiken
 * (&#10003; voor een vinkje, &#8364; voor de euro).
 */
const EMOJI_RANGES = [
  '\\u{1F300}-\\u{1F5FF}', // pictogrammen & symbolen
  '\\u{1F600}-\\u{1F64F}', // emoticons
  '\\u{1F680}-\\u{1F6FF}', // transport & kaart (🚀 zit hier)
  '\\u{1F700}-\\u{1F77F}', // alchemie
  '\\u{1F780}-\\u{1F7FF}', // geometrisch uitgebreid
  '\\u{1F800}-\\u{1F8FF}', // pijlen aanvullend
  '\\u{1F900}-\\u{1F9FF}', // aanvullende symbolen (💯 nabij, 🤖 etc.)
  '\\u{1FA00}-\\u{1FAFF}', // symbolen uitgebreid-A
  '\\u{2600}-\\u{26FF}',   // diverse symbolen (☀ ⚡ ✅-buren)
  '\\u{2700}-\\u{27BF}',   // dingbats (✨ ✔ ➡)
  '\\u{2B00}-\\u{2BFF}',   // pijlen/sterren (⭐)
  '\\u{1F1E6}-\\u{1F1FF}', // regionale indicatoren (vlaggen)
  '\\u{FE0F}',             // variatie-selector-16 (emoji-presentatie)
  '\\u{20E3}',             // combining keycap
  '\\u{200D}',             // zero-width joiner
]

const EMOJI_RE = new RegExp(`[${EMOJI_RANGES.join('')}]`, 'gu')

/** Bevat deze tekst emoji die niet in een professionele webshop hoort? */
export function containsAiEmoji(text: string): boolean {
  EMOJI_RE.lastIndex = 0
  return EMOJI_RE.test(String(text ?? ''))
}

/** Alle gevonden emoji (uniek), voor logging/rapportage. */
export function findAiEmoji(text: string): string[] {
  const found = String(text ?? '').match(EMOJI_RE) ?? []
  return [...new Set(found)].filter(c => c !== '‍' && c !== '️')
}

/**
 * Verwijdert emoji en ruimt de rommel op die achterblijft: dubbele spaties,
 * een spatie vóór leestekens, en een kop die met een leesteken begint omdat het
 * emoji ervoor verdween.
 */
export function stripAiEmoji(text: string): string {
  const cleaned = String(text ?? '')
    .replace(EMOJI_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/^[\s\-—·•|]+/, '')
    .replace(/[\s\-—·•|]+$/, '')
  return cleaned.trim()
}

export interface SanitizeReport {
  /** Aantal strings waar iets uit verwijderd is. */
  changed: number
  /** Welke emoji er zijn tegengehouden (uniek, over alles heen). */
  blocked: string[]
  /** Padnamen van de gewijzigde velden, voor debugging. */
  fields: string[]
}

/**
 * Loopt recursief door een object/array en schoont élke string. Geeft het
 * geschoonde resultaat plus een rapport terug. Het origineel blijft ongemoeid.
 *
 * Dit is de functie die de pipeline aanroept op de brief vóór het renderen —
 * één plek, geen enkele string die eromheen kan.
 */
export function sanitizeCopyDeep<T>(input: T): { value: T; report: SanitizeReport } {
  const report: SanitizeReport = { changed: 0, blocked: [], fields: [] }
  const blocked = new Set<string>()

  const walk = (node: unknown, path: string): unknown => {
    if (typeof node === 'string') {
      if (!containsAiEmoji(node)) return node
      for (const e of findAiEmoji(node)) blocked.add(e)
      report.changed++
      report.fields.push(path || '(root)')
      return stripAiEmoji(node)
    }
    if (Array.isArray(node)) return node.map((v, i) => walk(v, `${path}[${i}]`))
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node)) out[k] = walk(v, path ? `${path}.${k}` : k)
      return out
    }
    return node
  }

  const value = walk(input, '') as T
  report.blocked = [...blocked]
  return { value, report }
}

// ── Stijlruimte ───────────────────────────────────────────────────────────────
// Wat een gegenereerde store WEL mag zijn. Alles daarbuiten (brutalist, rauw,
// experimenteel, anti-design) hoort niet bij een webshop die geld moet verdienen:
// bezoekers moeten het vertrouwen, niet bewonderen.

export const ALLOWED_STYLE_SPACE = [
  'clean',    // rustig, veel witruimte, duidelijke hiërarchie
  'modern',   // strak, contrastrijk, hedendaags maar niet trendgevoelig
  'warm',     // uitnodigend, zachte kleuren, menselijk
  'premium',  // ingetogen luxe, ruime marges, terughoudende kleur
  'playful',  // speels maar verzorgd — kleur en ritme, nooit chaos
] as const
export type AllowedStyle = typeof ALLOWED_STYLE_SPACE[number]

/** Termen die op een verboden stijlrichting wijzen (check op LLM-rationale). */
const FORBIDDEN_STYLE_TERMS = [
  'brutalist', 'brutalism', 'anti-design', 'raw html', 'unstyled',
  'glitch', 'chaotic', 'grunge', 'distressed', 'experimental layout',
  'neubrutalism', 'neo-brutalist',
]

/**
 * Controleert of een LLM-stijlomschrijving binnen de toegestane ruimte blijft.
 * Geeft de gevonden overtredingen terug (leeg = in orde).
 */
export function checkStyleSpace(description: string): string[] {
  const lower = String(description ?? '').toLowerCase()
  return FORBIDDEN_STYLE_TERMS.filter(t => lower.includes(t))
}
