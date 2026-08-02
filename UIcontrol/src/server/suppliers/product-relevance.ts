// ═══════ Semantische relevantie-beoordeling ═══════
// Tweede laag bovenop `isRelevantToQuery` uit cj-adapter.ts. Die eerste laag is
// een woord-filter: hij weet of er een relevant wóórd in de titel staat, niet of
// het product qua uitstraling, prijsklasse en doelgroep bij de niche past.
//
// Deze laag legt elke kandidaat aan de LLM voor en vraagt om een cijfer met een
// reden. Producten onder de drempel gaan er automatisch uit — ze worden niet
// alleen gemarkeerd. Alle scores worden gelogd, ook die van afgewezen producten,
// zodat achteraf te zien is waaróm iets sneuvelde.

import type { SupplierProduct } from './types.js'

export const RELEVANCE_THRESHOLD = 6

export interface RelevanceVerdict {
  productId: string
  title: string
  /** 1-10; hoger is beter passend. */
  score: number
  /** Eén zin Nederlands, voor de operator. */
  reason: string
  accepted: boolean
}

export interface RelevanceResult {
  kept: SupplierProduct[]
  verdicts: RelevanceVerdict[]
  /** Gevuld als de beoordeling niet kon draaien; dan is er niets weggegooid. */
  skipped?: string
}

export interface RelevanceContext {
  label?: string
  interests?: string[]
  problem?: string
  priceRange?: { min: number; max: number }
}

/** De LLM-aanroep; injecteerbaar zodat de logica zonder API-key testbaar is. */
export type RelevanceJudge = (
  system: string,
  user: string,
) => Promise<{ scores?: Array<{ id: string; score: number; reason: string }> }>

const USD_TO_EUR = 0.92

function compact(p: SupplierProduct) {
  return {
    id: p.productId,
    // 110 tekens was te kort. Leveranciers stapelen zoekwoorden vooraan en zetten
    // wát het product écht is achteraan: "Dalmatian Dog Costume, 3-Piece … —
    // Polka-Dot Outfit For Women". Op 110 tekens werd juist "Outfit For Women"
    // afgekapt en zag de beoordelaar alleen nog "Dog Costume".
    title: p.title.slice(0, 240),
    description: (p.description ?? '').slice(0, 200),
    category: p.category ?? '',
    priceEur: Math.round(p.costPrice * USD_TO_EUR * 2.8 * 100) / 100,
    warehouse: p.warehouse ?? '',
  }
}

// ── Harde diskwalificatie: verkleedkleding voor mensen ────────────────────────
//
// Terugkerend patroon: een leverancier verkoopt een dalmatiër-pak voor
// vólwassenen en propt "Dog" in de titel. Het woordfilter ziet "dog", de
// semantische beoordelaar ziet "dog costume" en denkt: past prima bij een
// hondenwinkel. Maar het is kleding voor de eigenaar, geen artikel voor het
// dier — en al helemaal niet voor een winkel in halsbanden en riemen.
//
// Trefwoord-overlap met de niche mag hier niet tegen opwegen: een titel met
// zowel "dog" als "costume for adults" valt af ondanks die "dog".

const COSTUME_WORDS = [
  'costume', 'cosplay', 'fancy dress', 'fancydress', 'halloween', 'carnival',
  'carnaval', 'masquerade', 'dress-up', 'dress up', 'party accessory',
  'theme part', 'mascot', 'onesie', 'kigurumi', 'purim', 'role play', 'roleplay',
]

/** Signalen dat een MENS het draagt in plaats van het huisdier/de gebruiker. */
const HUMAN_WEAR_WORDS = [
  'for adults', 'for adult', 'for women', 'for men', 'for ladies', 'for him', 'for her',
  'womens', "women's", 'mens', "men's", 'adult size', 'unisex adult',
  'outfit', 'skirt', 'dress', 'gloves', 'wig', 'headband', 'jumpsuit', 'bodysuit',
  'apron', 'cape', 'cloak', 'tutu',
]

/** Niches die zelf over verkleden gaan — dan is een kostuum juist het product. */
const COSTUME_NICHE_WORDS = [
  ...COSTUME_WORDS, 'verkleed', 'verkleding', 'kostuum', 'feestkleding',
  'party outfit', 'theatre', 'theater', 'stage', 'festival outfit',
]

export function nicheIsAboutCostumes(niche: string, extra = ''): boolean {
  const t = `${niche} ${extra}`.toLowerCase()
  return COSTUME_NICHE_WORDS.some(w => t.includes(w))
}

export interface Disqualification {
  rejected: boolean
  /** Nederlandse reden voor de operator. */
  reason: string
  /** Welke woorden het besluit droegen — maakt de log navolgbaar. */
  signals: string[]
}

/**
 * Deterministische poort vóór de LLM. Geen model nodig om te zien dat
 * "Costume For Adults" geen hondenartikel is, en geen model dat er per ongeluk
 * een 7 van kan maken.
 */
export function costumeDisqualification(
  niche: string,
  product: { title?: string; description?: string; category?: string },
  opts: { personaText?: string } = {},
): Disqualification {
  if (nicheIsAboutCostumes(niche, opts.personaText ?? '')) {
    return { rejected: false, reason: '', signals: [] }
  }
  const hay = `${product.title ?? ''} ${product.description ?? ''} ${product.category ?? ''}`.toLowerCase()
  const costume = COSTUME_WORDS.filter(w => hay.includes(w))
  if (costume.length === 0) return { rejected: false, reason: '', signals: [] }

  const human = HUMAN_WEAR_WORDS.filter(w => hay.includes(w))
  const signals = [...costume, ...human]
  // Eén kostuumsignaal is al genoeg: de niche gaat niet over verkleden, dus een
  // verkleedartikel hoort er niet in. Staat er óók een mens-signaal bij, dan is
  // het zeker kleding voor de eigenaar.
  const reason = human.length > 0
    ? `Verkleedkleding voor mensen (${[...costume.slice(0, 2), ...human.slice(0, 2)].map(w => `"${w}"`).join(', ')}) — niet bedoeld voor deze niche, ondanks de woordovereenkomst.`
    : `Verkleed-/kostuumartikel (${costume.slice(0, 3).map(w => `"${w}"`).join(', ')}) terwijl deze niche niet over verkleden gaat.`
  return { rejected: true, reason, signals }
}

// ── Cadeau-sfeer: een listing die alleen als cadeau verkocht wordt ────────────
//
// Sommige leveranciers verkopen een product niet op wát het is maar op het
// moment waarop je het geeft: "Christmas Gift For Her, Birthday Gift Idea,
// Anniversary Present". Zulke listings zijn zelden het artikel dat de bezoeker
// van een niche-winkel zoekt, en ze slepen een sfeer mee (feestdagen, romantiek)
// die niet bij de winkel past.
//
// Bewust STRENGER afgebakend dan de kostuumregel: een "beard gift set" is een
// prima product in een baardwinkel. Er moet dus én cadeau-taal én een
// ONTVANGER/GELEGENHEID in staan, en de niche mag zelf niet over cadeaus gaan.

const GIFT_WORDS = ['gift', 'present', 'cadeau', 'giftbox', 'gift box', 'gift idea', 'souvenir']

const GIFT_OCCASION_WORDS = [
  'christmas', 'xmas', 'valentine', 'birthday', 'anniversary', 'mothers day',
  "mother's day", 'fathers day', "father's day", 'graduation', 'wedding favor',
  'wedding favour', 'easter', 'thanksgiving', 'new year gift', 'holiday gift',
]

const GIFT_RECIPIENT_WORDS = [
  'for her', 'for him', 'for mom', 'for mum', 'for dad', 'for grandma', 'for grandpa',
  'for girlfriend', 'for boyfriend', 'for wife', 'for husband', 'for teacher',
  'for best friend', 'for bff', 'for couples',
]

const GIFT_NICHE_WORDS = [...GIFT_WORDS, 'cadeaus', 'gifting', 'geschenk', 'souvenirs', 'hamper']

export function nicheIsAboutGifts(niche: string, extra = ''): boolean {
  const t = `${niche} ${extra}`.toLowerCase()
  return GIFT_NICHE_WORDS.some(w => t.includes(w))
}

/**
 * Verkocht als cadeau-moment in plaats van als product. Zie de afweging
 * hierboven: cadeau-taal alléén is niet genoeg.
 */
export function giftFramingDisqualification(
  niche: string,
  product: { title?: string; description?: string; category?: string },
  opts: { personaText?: string } = {},
): Disqualification {
  if (nicheIsAboutGifts(niche, opts.personaText ?? '')) {
    return { rejected: false, reason: '', signals: [] }
  }
  const hay = `${product.title ?? ''} ${product.description ?? ''} ${product.category ?? ''}`.toLowerCase()
  const gift = GIFT_WORDS.filter(w => hay.includes(w))
  if (gift.length === 0) return { rejected: false, reason: '', signals: [] }

  const occasion = GIFT_OCCASION_WORDS.filter(w => hay.includes(w))
  const recipient = GIFT_RECIPIENT_WORDS.filter(w => hay.includes(w))
  if (occasion.length === 0 && recipient.length === 0) {
    // Alleen "gift set" — dat kan een echt assortimentsproduct zijn.
    return { rejected: false, reason: '', signals: gift }
  }
  const signals = [...gift.slice(0, 2), ...occasion.slice(0, 2), ...recipient.slice(0, 2)]
  return {
    rejected: true,
    signals,
    reason: `Verkocht als cadeau-moment in plaats van als product (${signals.map(w => `"${w}"`).join(', ')}) — die sfeer hoort niet bij deze niche.`,
  }
}

// ── Machinevertaling / marktplaats-ruis in de titel ───────────────────────────
//
// CJ-titels komen vaak rechtstreeks uit een Chinese marktplaats door een
// vertaalmachine. Herkenbaar aan groothandelsjargon ("Cross-border", "Foreign
// Trade", "Explosion Models"), aan CJK-tekens die zijn blijven staan, en aan
// eindeloze komma-lijsten met herhaalde woorden. Zulke titels komen letterlijk
// zo op de winkel te staan; dat is meteen te zien.

const MT_JARGON = [
  'cross-border', 'cross border', 'foreign trade', 'explosion model', 'explosive model',
  'hot style', 'hot sale explosion', 'amazon hot', 'aliexpress hot', 'ebay hot',
  'source factory', 'factory direct supply', 'spot goods', 'in stock spot',
  'new arrival hot', 'wish hot', 'tiktok hot sale', 'one piece dropshipping',
  'oem odm', 'moq', 'wholesale price hot',
]

/** Titels waar de vertaalmachine doorheen schemert. */
export function machineTranslationDisqualification(
  product: { title?: string; description?: string },
): Disqualification {
  const title = product.title ?? ''
  const lower = title.toLowerCase()
  const signals: string[] = []

  const jargon = MT_JARGON.filter(w => lower.includes(w))
  signals.push(...jargon)

  // Niet-Latijns schrift dat is blijven staan (CJK, Cyrillisch, Arabisch)
  if (/[　-鿿가-힯Ѐ-ӿ؀-ۿ]/.test(title)) signals.push('niet-Latijns schrift')

  // Komma-stapeling: >6 fragmenten is geen productnaam meer maar een zoekwoordenlijst
  const parts = title.split(/[,;|]/).map(s => s.trim()).filter(Boolean)
  if (parts.length > 6) signals.push(`${parts.length} komma-fragmenten`)

  // Hetzelfde betekenisdragende woord 3+ keer
  const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3)
  const counts = new Map<string, number>()
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1)
  const repeated = [...counts.entries()].filter(([, n]) => n >= 3).map(([w]) => w)
  if (repeated.length > 0) signals.push(`herhaald woord "${repeated[0]}"`)

  // Eén signaal kan toeval zijn (een lange, eerlijke titel met 7 komma's). Twee
  // signalen samen is een patroon.
  const rejected = signals.length >= 2 || jargon.length > 0
  return {
    rejected,
    signals,
    reason: rejected
      ? `Titel komt onbewerkt uit een marktplaats-vertaling (${signals.slice(0, 3).join(', ')}) — zo op de winkel zetten is meteen zichtbaar.`
      : '',
  }
}

// ── Doelgroep-mismatch: verkeerd geslacht, verkeerde diersoort ────────────────
//
// Hetzelfde patroon als de kostuum-bug, twee keer opnieuw opgedoken op de VPS:
// woordoverlap met de niche wint het van een harde eigenschap die niet klopt.
//
//   niche "women's baseball caps" → "Twee sportieve baseballcaps voor HEREN"
//   niche "interactive cat toys"  → "Hondenspeelgoed voetbal met riemen"
//
// In beide gevallen benoemde de beoordelaar de mismatch zélf in zijn motivatie
// en gaf hem alsnog een voldoende. Zo'n eigenschap hoort niet afgewogen te
// worden — een herenpet is geen dameswinkel-artikel, hoeveel andere woorden er
// ook matchen.
//
// De regel triggert ALLEEN bij een expliciete tegenstrijdigheid:
//   • de niche noemt een doelgroep, én
//   • het product noemt een ANDERE doelgroep, én
//   • het product noemt de gevraagde doelgroep NIET (dus "men's and women's"
//     of "unisex" gaat gewoon door).
// Een titel zonder enige vermelding ("Baseball Cap Cotton") is unisex en gaat
// altijd door naar de gewone beoordeling.

interface AudienceAxis {
  /** Naam van de as, voor de logregel. */
  label: string
  /** Groepen: sleutel → woorden die die groep aanduiden. */
  groups: Record<string, string[]>
}

const AUDIENCE_AXES: AudienceAxis[] = [
  {
    label: 'doelgroep',
    groups: {
      // Let op: matching gaat via woordgrenzen, dus "men" matcht niet in "women".
      mannen: ['men', 'man', 'mens', 'male', 'males', 'herren', 'heren', 'homme', 'hommes',
        'boys', 'boy', 'gentlemen', 'for him', 'voor heren', 'voor mannen'],
      vrouwen: ['women', 'woman', 'womens', 'female', 'females', 'damen', 'dames', 'femme',
        'femmes', 'girls', 'girl', 'ladies', 'lady', 'for her', 'voor dames', 'voor vrouwen'],
      kinderen: ['kids', 'kid', 'children', 'child', 'toddler', 'baby', 'babies', 'infant',
        'kinderen', 'kinder', 'peuter'],
    },
  },
  {
    label: 'diersoort',
    groups: {
      hond: ['dog', 'dogs', 'puppy', 'puppies', 'canine', 'hond', 'honden', 'hunde', 'chien'],
      kat: ['cat', 'cats', 'kitten', 'kittens', 'feline', 'kat', 'katten', 'katze', 'chat'],
      vogel: ['bird', 'birds', 'parrot', 'parakeet', 'vogel', 'vogels'],
      vis: ['fish', 'aquarium', 'goldfish', 'vissen'],
      knaagdier: ['rabbit', 'rabbits', 'bunny', 'hamster', 'guinea pig', 'konijn', 'cavia'],
      paard: ['horse', 'horses', 'equestrian', 'pony', 'paard', 'paarden'],
      reptiel: ['reptile', 'turtle', 'tortoise', 'gecko', 'snake', 'schildpad'],
    },
  },
]

/** Woordgrens-match, zodat "men" niet in "women" of "moment" aanslaat. */
function mentionsWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(haystack)
}

function groupsPresent(text: string, axis: AudienceAxis): Set<string> {
  const found = new Set<string>()
  for (const [group, words] of Object.entries(axis.groups)) {
    if (words.some(w => mentionsWord(text, w))) found.add(group)
  }
  return found
}

/**
 * Expliciete doelgroep- of diersoort-mismatch. Draait vóór de LLM: dit is geen
 * afweging maar een feit.
 */
export function audienceMismatchDisqualification(
  niche: string,
  product: { title?: string; description?: string; category?: string },
  opts: { personaText?: string } = {},
): Disqualification {
  // De niche is leidend; de persona mag hem aanvullen (bv. label "Vrouwen 25-40").
  const nicheText = `${niche} ${opts.personaText ?? ''}`.toLowerCase()
  const productText = `${product.title ?? ''} ${product.description ?? ''} ${product.category ?? ''}`.toLowerCase()

  for (const axis of AUDIENCE_AXES) {
    const wanted = groupsPresent(nicheText, axis)
    // Niche zegt niets over deze as (of noemt er meerdere, bv. "voor hond én
    // kat") → geen regel om tegen te toetsen.
    if (wanted.size !== 1) continue
    const target = [...wanted][0]

    const declared = groupsPresent(productText, axis)
    if (declared.size === 0) continue          // unisex / niet vermeld → gewoon door
    if (declared.has(target)) continue         // noemt óók de gevraagde groep → door

    const conflicting = [...declared]
    const woorden = axis.groups[conflicting[0]].filter(w => mentionsWord(productText, w)).slice(0, 2)
    return {
      rejected: true,
      signals: [`${axis.label}: ${conflicting.join('/')} i.p.v. ${target}`, ...woorden],
      reason: axis.label === 'diersoort'
        ? `Product voor een andere diersoort (${conflicting.join('/')}${woorden.length ? `: "${woorden.join('", "')}"` : ''}) terwijl de niche over ${target} gaat.`
        : `Product voor een andere doelgroep (${conflicting.join('/')}${woorden.length ? `: "${woorden.join('", "')}"` : ''}) terwijl de niche zich op ${target} richt.`,
    }
  }
  return { rejected: false, reason: '', signals: [] }
}

/** Alle deterministische poorten achter elkaar; eerste treffer wint. */
export function hardDisqualification(
  niche: string,
  product: { title?: string; description?: string; category?: string },
  opts: { personaText?: string } = {},
): Disqualification {
  const costume = costumeDisqualification(niche, product, opts)
  if (costume.rejected) return costume
  const audience = audienceMismatchDisqualification(niche, product, opts)
  if (audience.rejected) return audience
  const gift = giftFramingDisqualification(niche, product, opts)
  if (gift.rejected) return gift
  return machineTranslationDisqualification(product)
}

/**
 * Beoordeelt alle kandidaten en geeft alleen de passende terug.
 *
 * Faalt de LLM (geen key, time-out, onbruikbaar antwoord), dan wordt er
 * **niets** weggegooid: liever alle kandidaten tonen met een duidelijke melding
 * dan stilzwijgend de halve lijst laten verdwijnen om een reden die niemand kan
 * nakijken. `skipped` vertelt dan waarom.
 */
export async function scoreRelevance(
  niche: string,
  persona: RelevanceContext,
  candidates: SupplierProduct[],
  judge: RelevanceJudge,
  opts: { threshold?: number; onLog?: (m: string) => void } = {},
): Promise<RelevanceResult> {
  const threshold = opts.threshold ?? RELEVANCE_THRESHOLD
  const log = opts.onLog ?? ((m: string) => console.log(m))
  if (candidates.length === 0) return { kept: [], verdicts: [] }

  // ── Poort 0: harde diskwalificatie ──────────────────────────────────────────
  // Draait vóór de LLM. Deze producten worden niet voorgelegd: het model kan er
  // dan ook geen 7 van maken, en het scheelt tokens. Ze staan wél in `verdicts`,
  // zodat de wizard laat zien waarom ze weg zijn.
  const personaText = `${persona.label ?? ''} ${(persona.interests ?? []).join(' ')} ${persona.problem ?? ''}`
  const hardVerdicts: RelevanceVerdict[] = []
  const survivors: SupplierProduct[] = []
  for (const p of candidates) {
    const dq = hardDisqualification(niche, p, { personaText })
    if (dq.rejected) {
      hardVerdicts.push({ productId: p.productId, title: p.title, score: 1, reason: dq.reason, accepted: false })
      log(`[relevance]   ✗  1/10  ${p.title.slice(0, 60)} — ${dq.reason}`)
    } else {
      survivors.push(p)
    }
  }
  if (hardVerdicts.length > 0) {
    log(`[relevance] ${hardVerdicts.length} product(en) hard afgewezen (verkleedkleding / doelgroep / cadeau-framing / machinevertaling) vóór de LLM`)
  }
  if (survivors.length === 0) {
    return { kept: [], verdicts: hardVerdicts }
  }
  candidates = survivors

  const priceHint = persona.priceRange
    ? `De doelgroep koopt in de prijsklasse EUR ${persona.priceRange.min}-${persona.priceRange.max}.`
    : ''

  let raw: Awaited<ReturnType<RelevanceJudge>>
  try {
    raw = await judge(
      'Je beoordeelt of producten passen bij een webshop-niche. Je bent streng: een product dat toevallig een woord deelt met de niche past nog niet.',
      `Niche: "${niche}"
Doelgroep: ${JSON.stringify({ label: persona.label, interests: persona.interests, problem: persona.problem })}
${priceHint}

Geef ELK product hieronder een score van 1 tot 10 voor hoe goed het bij deze niche past.
Weeg mee: is dit werkelijk een product uit deze productcategorie, past de uitstraling
bij de doelgroep, en zit de prijs in de juiste klasse?

Richtlijn:
  9-10 = precies waarvoor de klant komt
  7-8  = past goed, logische aanvulling op het assortiment
  6    = randgeval, verdedigbaar
  3-5  = zelfde thema maar een ander soort product
  1-2  = hoort hier niet, deelt hooguit een woord met de niche

Wees streng bij 6 en lager. Een ventilator in een blender-winkel is een 1, ook al
zijn beide "portable".

VRAAG JEZELF PER PRODUCT: wie gebruikt of draagt dit? Leveranciers stapelen
zoekwoorden in de titel, dus woordovereenkomst met de niche zegt niets.
- Verkleedkleding voor MENSEN (costume, cosplay, carnaval, Halloween, "for
  adults", "for women", party accessory set) hoort NIET in een niche die niet
  over verkleden gaat — ook niet als het woord "dog", "cat" of de niche-naam in
  de titel staat. Een dalmatiër-pak met rokje is kleding voor de eigenaar, geen
  hondenartikel: score 1.
- Een artikel voor het dier/de gebruiker zelf is wél kandidaat.
Deze regel weegt ZWAARDER dan trefwoord-overlap met de niche-naam.

Producten:
${JSON.stringify(candidates.map(compact))}

JSON formaat:
{"scores":[{"id":"<product id>","score":8,"reason":"1 korte zin Nederlands"}]}`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // De harde poort blijft óók gelden als de LLM uitvalt: verkleedkleding hoort
    // er niet in, ook niet "voorlopig".
    log(`[relevance] beoordeling overgeslagen (${msg}) — de overige ${candidates.length} kandidaten blijven staan`)
    return { kept: candidates, verdicts: hardVerdicts, skipped: msg }
  }

  const byId = new Map((raw.scores ?? []).map(s => [String(s.id), s]))
  if (byId.size === 0) {
    log(`[relevance] LLM gaf geen bruikbare scores — de overige ${candidates.length} kandidaten blijven staan`)
    return { kept: candidates, verdicts: hardVerdicts, skipped: 'geen scores in het antwoord' }
  }

  const verdicts: RelevanceVerdict[] = [...hardVerdicts]
  const kept: SupplierProduct[] = []
  for (const p of candidates) {
    const s = byId.get(p.productId)
    // Niet beoordeeld → laten staan. Een product laten vallen omdat de LLM het
    // vergat is erger dan een randgeval doorlaten; de operator ziet het toch.
    const score = s ? Math.max(1, Math.min(10, Math.round(Number(s.score) || 0))) : threshold
    const reason = s?.reason?.trim() || (s ? '' : 'niet beoordeeld — behouden')
    const accepted = score >= threshold
    verdicts.push({ productId: p.productId, title: p.title, score, reason, accepted })
    if (accepted) kept.push(p)
  }

  const rejected = verdicts.filter(v => !v.accepted)
  log(`[relevance] "${niche}": ${kept.length}/${candidates.length} kandidaten gehouden (drempel ${threshold})`)
  for (const v of verdicts.sort((a, b) => b.score - a.score)) {
    log(`[relevance]   ${v.accepted ? '✓' : '✗'} ${String(v.score).padStart(2)}/10  ${v.title.slice(0, 60)} — ${v.reason}`)
  }
  if (rejected.length) {
    log(`[relevance] ${rejected.length} afgewezen: ${rejected.map(v => `${v.title.slice(0, 30)} (${v.score})`).join(', ')}`)
  }

  return { kept, verdicts }
}
