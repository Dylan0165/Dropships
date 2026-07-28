// ═══════ Producttypes per niche ═══════
// Een winkel is geen één-product-landingspagina. "Baard verzorging" is olie,
// balsem, trimmer, kam, borstel, shampoo, schaar, opbergtas, cadeauset — een
// samenhangend assortiment van VERSCHILLENDE items.
//
// Dit bestand vraagt de LLM om die lijst. Het zegt bewust niets over zoeken of
// scoren; dat doet assortment.ts. Wat hier telt: distincte producten (geen
// synoniemen van hetzelfde item) en spreiding over prijsklassen, zodat de
// uiteindelijke winkel een instap-, midden- én topsegment heeft.

export type PriceTier = 'entry' | 'mid' | 'premium'

export interface ProductType {
  /** Slug, uniek binnen één assortiment. */
  id: string
  /**
   * Wat het IS, in het ENGELS: "beard oil". Bewust niet Nederlands: dit label
   * belandt als categorie op de winkel zelf, en alle klant-facing tekst is
   * Engels. De onderbouwing (`role`) is wél Nederlands — die leest de operator.
   */
  name: string
  /** Engelse CJ-zoekterm, 1-3 woorden: "beard oil". */
  searchTerm: string
  /** Tweede kans als de eerste term niets oplevert. */
  altTerm?: string
  tier: PriceTier
  /** Eén zin: waarom dit type in dit assortiment hoort. */
  role: string
}

/** De LLM-aanroep; injecteerbaar zodat de logica zonder API-key testbaar is. */
export type TypeJudge = (system: string, user: string) => Promise<unknown>

export interface TypeContext {
  label?: string
  ageRange?: string
  interests?: string[]
  problem?: string
  priceRange?: { min: number; max: number }
}

export const TYPES_MIN = 10
export const TYPES_MAX = 15

const SYSTEM =
  'Je bent een e-commerce inkoper die een compleet, samenhangend assortiment samenstelt voor één webshop. ' +
  'Je denkt in VERSCHILLENDE producten die elkaar aanvullen, niet in varianten van hetzelfde item.'

function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
}

/** Normalisatie voor ontdubbeling: kale woordenverzameling zonder stopwoorden. */
function typeKey(t: { name: string; searchTerm: string }): string {
  return `${t.searchTerm}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function asTier(v: unknown): PriceTier {
  const s = String(v ?? '').toLowerCase()
  if (s.startsWith('entry') || s.startsWith('instap') || s === 'low') return 'entry'
  if (s.startsWith('prem') || s.startsWith('top') || s === 'high') return 'premium'
  return 'mid'
}

/**
 * Zet ruwe LLM-output om in bruikbare types en gooit dubbelen weg.
 * Ontdubbelt op de ZOEKTERM: twee types die hetzelfde zoeken leveren hetzelfde
 * product op, en dan sta je alsnog met een halve collectie.
 */
export function normalizeTypes(raw: unknown, existing: ProductType[] = []): ProductType[] {
  const list = Array.isArray((raw as { types?: unknown })?.types)
    ? (raw as { types: unknown[] }).types
    : Array.isArray(raw) ? raw as unknown[] : []

  const seen = new Set(existing.map(typeKey))
  const ids = new Set(existing.map(t => t.id))
  const out: ProductType[] = []

  for (const item of list) {
    const o = item as Record<string, unknown>
    const name = String(o.name ?? o.type ?? '').trim()
    const searchTerm = String(o.searchTerm ?? o.search_term ?? o.term ?? name).trim().toLowerCase()
    if (!name || searchTerm.length < 3 || searchTerm.length > 40) continue
    const key = typeKey({ name, searchTerm })
    if (seen.has(key)) continue
    seen.add(key)

    let id = slug(name) || slug(searchTerm) || `type-${out.length + 1}`
    while (ids.has(id)) id = `${id}-${ids.size + 1}`
    ids.add(id)

    const alt = o.altTerm ?? o.alt_term ?? o.alternativeTerm
    const altTerm = alt ? String(alt).trim().toLowerCase() : undefined

    out.push({
      id, name, searchTerm,
      altTerm: altTerm && altTerm !== searchTerm && altTerm.length >= 3 ? altTerm : undefined,
      tier: asTier(o.tier ?? o.priceTier ?? o.price_tier),
      role: String(o.role ?? o.reason ?? '').trim() || 'Onderdeel van het assortiment.',
    })
  }
  return out
}

function personaBlock(persona: TypeContext): string {
  const price = persona.priceRange
    ? `Prijsklasse van de doelgroep: EUR ${persona.priceRange.min}-${persona.priceRange.max} per product.`
    : ''
  return `Doelgroep: ${JSON.stringify({
    label: persona.label, ageRange: persona.ageRange,
    interests: persona.interests, problem: persona.problem,
  })}
${price}`
}

/**
 * Vraagt 10-15 distincte producttypes voor één niche.
 *
 * Faalt de LLM, dan komt er GEEN verzonnen lijst terug: dan is er één type (de
 * niche zelf) en zegt de aanroeper daar eerlijk iets over. Stilletjes doorgaan
 * met een gefantaseerd assortiment is precies hoe je een winkel krijgt die niet
 * klopt.
 */
export async function generateProductTypes(
  niche: string,
  persona: TypeContext,
  judge: TypeJudge,
  opts: { onLog?: (m: string) => void } = {},
): Promise<{ types: ProductType[]; fallback?: string }> {
  const log = opts.onLog ?? ((m: string) => console.log(m))
  try {
    const raw = await judge(SYSTEM, `Niche: "${niche}"
${personaBlock(persona)}

Stel het assortiment samen voor deze winkel: ${TYPES_MIN} tot ${TYPES_MAX} VERSCHILLENDE producttypes
die samen een logisch, aantrekkelijk aanbod vormen.

Harde regels:
- Elk type is een ANDER product, geen synoniem of variant van een ander type in de lijst.
  Fout: "beard oil" + "oil for beards" + "beard care oil". Goed: oil, balm, trimmer, comb,
  brush, growth serum, shampoo, scissors, storage bag, gift set.
- "name" is ENGELS en enkelvoudig ("beard oil") — het verschijnt als categorie op de winkel,
  en alle klant-facing tekst is Engels. "role" is Nederlands, die leest de operator.
- Spreid bewust over prijsklassen: enkele instap (entry), de meeste midden (mid),
  2-3 premium. Zo krijgt de winkel prijsspreiding in plaats van tien keer hetzelfde bedrag.
- Alles moet passen bij dezelfde doelgroep en dezelfde winkel.
- searchTerm is ENGELS, 1-3 woorden, een concreet productzelfstandignaamwoord zoals het in een
  leverancierscatalogus staat ("beard oil", "beard trimmer"). Geen marketingwoorden,
  geen doelgroepwoorden.
- altTerm is een tweede Engelse formulering voor hetzelfde type, voor als de eerste niets oplevert.

JSON formaat:
{"types":[{"name":"beard oil","searchTerm":"beard oil","altTerm":"beard growth oil","tier":"mid","role":"Kernproduct, dagelijkse verzorging"}]}`)

    const types = normalizeTypes(raw).slice(0, TYPES_MAX)
    if (types.length >= 3) {
      const tiers = types.reduce<Record<string, number>>((a, t) => ({ ...a, [t.tier]: (a[t.tier] ?? 0) + 1 }), {})
      log(`[types] ${types.length} producttypes voor "${niche}" (entry ${tiers.entry ?? 0} / mid ${tiers.mid ?? 0} / premium ${tiers.premium ?? 0})`)
      for (const t of types) log(`[types]   · ${t.name} — zoekterm "${t.searchTerm}"${t.altTerm ? ` (alt "${t.altTerm}")` : ''} [${t.tier}]`)
      return { types }
    }
    log(`[types] LLM gaf te weinig bruikbare types (${types.length}) — val terug op de niche zelf`)
    return { types: fallbackTypes(niche), fallback: `LLM gaf ${types.length} bruikbare types` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`[types] producttype-generatie mislukt (${msg}) — val terug op de niche zelf als enige zoekterm`)
    return { types: fallbackTypes(niche), fallback: msg }
  }
}

/**
 * Vraagt EXTRA types, verder van het centrum van de niche af. Wordt aangeroepen
 * als de eerste ronde te weinig distincte producten opleverde — het alternatief
 * (dezelfde producten dupliceren tot het aantal klopt) is precies wat we niet
 * meer doen.
 */
export async function expandProductTypes(
  niche: string,
  persona: TypeContext,
  existing: ProductType[],
  judge: TypeJudge,
  count: number,
  opts: { onLog?: (m: string) => void } = {},
): Promise<ProductType[]> {
  const log = opts.onLog ?? ((m: string) => console.log(m))
  if (count <= 0) return []
  try {
    const raw = await judge(SYSTEM, `Niche: "${niche}"
${personaBlock(persona)}

Deze producttypes zijn al geprobeerd:
${existing.map(t => `- ${t.name} ("${t.searchTerm}")`).join('\n')}

Ze leverden samen te weinig producten op. Geef ${count} AANVULLENDE producttypes die
verder van het centrum van de niche af liggen, maar nog steeds logisch in dezelfde winkel
passen en bij dezelfde doelgroep horen. Denk aan aanpalende gebruiksmomenten, accessoires,
onderhoud, opbergen, cadeau-varianten.

Geen enkel type mag hetzelfde zijn als hierboven, ook niet als synoniem.
name én searchTerm zijn ENGELS, 1-3 woorden, concreet productzelfstandignaamwoord.
role is Nederlands.

JSON formaat:
{"types":[{"name":"...","searchTerm":"...","altTerm":"...","tier":"entry|mid|premium","role":"..."}]}`)

    const extra = normalizeTypes(raw, existing).slice(0, count)
    log(`[types] uitbreiding: ${extra.length} extra producttypes${extra.length ? ` (${extra.map(t => t.name).join(', ')})` : ''}`)
    return extra
  } catch (err) {
    log(`[types] uitbreiding mislukt (${err instanceof Error ? err.message : err}) — geen extra types`)
    return []
  }
}

/** Zonder LLM: de niche zelf is het enige type. Eerlijk, en zichtbaar mager. */
export function fallbackTypes(niche: string): ProductType[] {
  return [{
    id: slug(niche) || 'niche',
    name: niche,
    searchTerm: niche.toLowerCase().slice(0, 40),
    tier: 'mid',
    role: 'Terugval: geen producttype-lijst beschikbaar.',
  }]
}
