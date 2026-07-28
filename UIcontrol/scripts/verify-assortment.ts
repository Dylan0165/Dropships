// Verificatie Taak A+B+E — een compleet assortiment per niche.
//
// Draait de ECHTE assortiment-code (suppliers/assortment.ts + product-types.ts)
// met een injecteerbare zoekfunctie en een injecteerbare LLM. De DeepSeek-key op
// deze dev-machine is ongeldig; de logica die hier getest wordt is de onze, niet
// die van het model. De nep-catalogus gedraagt zich als CJ: sommige zoektermen
// leveren niets op, sommige leveren ruis op die de relevantiepoort moet vangen.
import fs from 'node:fs'
import { buildAssortment } from '../src/server/suppliers/assortment.js'
import { normalizeTypes, type ProductType } from '../src/server/suppliers/product-types.js'
import { fitProducts } from '../src/server/design/layout.js'
import type { SupplierProduct } from '../src/server/suppliers/types.js'

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

const NICHE = 'baard verzorging'
const PERSONA = {
  label: 'Man met een verzorgde baard', ageRange: '25-45',
  interests: ['grooming', 'verzorging'], problem: 'droge, jeukende baard',
  priceRange: { min: 15, max: 60 },
}

// ── Nep-CJ-catalogus ──────────────────────────────────────────────────────────
// Per zoekterm wat de leverancier teruggeeft. Let op de bewuste gaten
// ("beard straightener") en de ruis (ventilator, powerbank).
const p = (id: string, title: string, cost: number, wh = 'DE', category = 'Beauty'): SupplierProduct => ({
  supplier: 'cj', productId: id, variantId: `${id}-v`, title, description: '', category,
  image: `https://example.invalid/${id}.jpg`, costPrice: cost, currency: 'USD', warehouse: wh,
})

const CATALOG: Record<string, SupplierProduct[]> = {
  'beard oil': [p('cj-oil-1', 'Beard Oil 30ml Argan & Jojoba', 4.2), p('cj-oil-2', 'Beard Growth Oil 50ml', 6.1, 'FR')],
  'beard balm': [p('cj-balm-1', 'Beard Balm Leave-In Conditioner 60g', 5.4)],
  'beard trimmer': [
    p('cj-trim-1', 'Cordless Beard Trimmer USB', 12.5),
    p('cj-trim-2', 'Professional Beard Trimmer Kit 12-in-1', 27.9, 'PL'),   // duidelijk duurder → premium-variant
    p('cj-fan-1', 'Portable Leafless Cooling Fan', 9.0, 'CN', 'Home Appliance'),  // ruis
  ],
  'beard comb': [p('cj-comb-1', 'Sandalwood Beard Comb Anti-Static', 2.3)],
  'beard brush': [p('cj-brush-1', 'Boar Bristle Beard Brush Wooden Handle', 3.8)],
  'beard shampoo': [p('cj-sham-1', 'Beard Wash Shampoo Sulfate-Free 200ml', 5.9, 'NL')],
  'beard scissors': [p('cj-scis-1', 'Stainless Steel Beard Scissors', 3.1)],
  'beard growth serum': [p('cj-serum-1', 'Beard Growth Serum Biotin 30ml', 7.4, 'FR')],
  'beard gift set': [p('cj-gift-1', 'Beard Care Gift Set 6-Piece Box', 18.6, 'DE')],
  'beard storage bag': [p('cj-bag-1', 'Beard Grooming Kit Travel Pouch', 4.9, 'CN')],
  'beard roller': [p('cj-roll-1', 'Derma Roller Beard 0.5mm', 3.4, 'CN')],
  'beard straightener': [],                                     // leverancier heeft niets
  'beard dye': [p('cj-power-1', 'Portable Power Bank 20000mAh', 11.0, 'CN', 'Electronics')],  // alleen ruis
  // Uitbreidingsronde
  'shaving razor': [p('cj-razor-1', 'Safety Razor Double Edge Chrome', 8.2, 'DE')],
  'aftershave balm': [p('cj-after-1', 'Aftershave Balm Sensitive Skin', 4.4, 'NL')],
  'grooming mirror': [p('cj-mirror-1', 'Travel Grooming Mirror Foldable', 3.9, 'CN')],
}

let searchCalls = 0
const search = async (term: string, maxResults: number): Promise<SupplierProduct[]> => {
  searchCalls++
  return (CATALOG[term] ?? []).slice(0, maxResults)
}

// ── Nep-LLM ───────────────────────────────────────────────────────────────────
// Beantwoordt de drie prompts die de assortiment-code stelt: types, uitbreiding
// en relevantiescores. Herkenning op de tekst van de prompt, net als de echte.
const TYPES: Array<Partial<ProductType>> = [
  { name: 'beard oil', searchTerm: 'beard oil', tier: 'mid', role: 'Kernproduct, dagelijkse verzorging' },
  { name: 'beard balm', searchTerm: 'beard balm', tier: 'mid', role: 'Houdt de baard in model' },
  { name: 'beard trimmer', searchTerm: 'beard trimmer', tier: 'premium', role: 'Duurste item, trekt de gemiddelde orderwaarde omhoog' },
  { name: 'beard comb', searchTerm: 'beard comb', tier: 'entry', role: 'Instapproduct, lage drempel' },
  { name: 'beard brush', searchTerm: 'beard brush', tier: 'entry', role: 'Logische aanvulling op de kam' },
  { name: 'beard shampoo', searchTerm: 'beard shampoo', tier: 'mid', role: 'Herhaalaankoop' },
  { name: 'beard scissors', searchTerm: 'beard scissors', tier: 'entry', role: 'Bijknippen tussendoor' },
  { name: 'beard growth serum', searchTerm: 'beard growth serum', tier: 'premium', role: 'Hoge marge, sterke belofte' },
  { name: 'beard gift set', searchTerm: 'beard gift set', tier: 'premium', role: 'Cadeaumoment, hoogste orderwaarde' },
  { name: 'beard storage bag', searchTerm: 'beard storage bag', tier: 'mid', role: 'Opbergen en meenemen' },
  { name: 'beard roller', searchTerm: 'beard roller', tier: 'mid', role: 'Stimuleert groei, past bij het serum' },
  { name: 'beard straightener', searchTerm: 'beard straightener', tier: 'premium', role: 'Voor de langere baard' },
  { name: 'beard dye', searchTerm: 'beard dye', tier: 'mid', role: 'Grijs wegwerken' },
]
const EXTRA_TYPES: Array<Partial<ProductType>> = [
  { name: 'shaving razor', searchTerm: 'shaving razor', tier: 'mid', role: 'Randen scheren hoort bij baardverzorging' },
  { name: 'aftershave balm', searchTerm: 'aftershave balm', tier: 'entry', role: 'Direct na het scheren' },
  { name: 'grooming mirror', searchTerm: 'grooming mirror', tier: 'entry', role: 'Praktisch hulpmiddel' },
]

/** Titels die duidelijk NIET in een baardwinkel horen. */
const NOISE = /cooling fan|power bank/i

let llmCalls = 0
const judge = async (_system: string, user: string): Promise<unknown> => {
  llmCalls++
  if (/AANVULLENDE producttypes/.test(user)) return { types: EXTRA_TYPES }
  if (/Stel het assortiment samen/.test(user)) return { types: TYPES }
  if (/score van 1 tot 10/.test(user)) {
    const ids = [...user.matchAll(/"id":"([^"]+)"/g)].map(m => m[1])
    const titles = new Map<string, string>()
    for (const m of user.matchAll(/"id":"([^"]+)","title":"([^"]*)"/g)) titles.set(m[1], m[2])
    return {
      scores: ids.map(id => {
        const t = titles.get(id) ?? ''
        if (NOISE.test(t)) return { id, score: 1, reason: 'Hoort niet in een baardwinkel — deelt hooguit een koopmoment.' }
        if (/Derma Roller/i.test(t)) return { id, score: 6, reason: 'Randgeval: aanpalend, maar verdedigbaar in dit assortiment.' }
        return { id, score: 9, reason: 'Kernproduct voor deze doelgroep.' }
      }),
    }
  }
  throw new Error(`onverwachte prompt: ${user.slice(0, 60)}`)
}

// ═══ 1. PRODUCTTYPES ═══
say('═══ 1. PRODUCTTYPES PER NICHE (Taak A) ═══')
say(`niche: "${NICHE}"`)
const normalized = normalizeTypes({ types: TYPES })
check('10-15 producttypes', normalized.length >= 10 && normalized.length <= 15, `${normalized.length} types`)
check('allemaal distinct', new Set(normalized.map(t => t.searchTerm)).size === normalized.length,
  `${new Set(normalized.map(t => t.searchTerm)).size} unieke zoektermen`)
const tiers = normalized.reduce<Record<string, number>>((a, t) => ({ ...a, [t.tier]: (a[t.tier] ?? 0) + 1 }), {})
check('gespreid over prijsklassen', Object.keys(tiers).length >= 3,
  `entry ${tiers.entry ?? 0} / mid ${tiers.mid ?? 0} / premium ${tiers.premium ?? 0}`)
say('  synoniem-ontdubbeling:')
const dupes = normalizeTypes({
  types: [{ name: 'beard oil', searchTerm: 'beard oil' }, { name: 'oil for beards', searchTerm: 'beard oil' }, { name: 'beard balm', searchTerm: 'beard balm' }],
})
check('twee types met dezelfde zoekterm worden één', dupes.length === 2, `3 aangeleverd → ${dupes.length} overgehouden`)

// ═══ 2. ALLE TYPES DOORZOEKEN ═══
say('')
say('═══ 2. ELK PRODUCTTYPE DOORZOCHT (Taak B) ═══')
const r = await buildAssortment({
  niche: NICHE, persona: PERSONA, search, judge,
  onLog: m => say(`  ${m.replace(/^\[/, '[')}`),
})

say('')
check('elk producttype is doorzocht', r.attempts.length === r.types.length,
  `${r.attempts.length} pogingen voor ${r.types.length} types`)
check('niet gestopt na het eerste type', r.attempts.filter(a => a.terms.length > 0).length >= 10,
  `${r.attempts.filter(a => a.terms.length > 0).length} types kregen een echte zoekopdracht`)
check('7-15 producten', r.picks.length >= 7 && r.picks.length <= 15, `${r.picks.length} producten`)
const ids = r.picks.map(x => x.product.productId)
check('geen dubbele producten', new Set(ids).size === ids.length, `${new Set(ids).size} unieke product-ids`)
check('geen --v duplicaat-suffix', !ids.some(i => /--v\d/.test(i)), ids.join(', '))
const distinct = new Set(r.picks.map(x => x.typeId))
check('minstens 7 distincte producttypes', distinct.size >= 7, `${distinct.size} types in de collectie`)
check('ruis is niet in de collectie beland', !r.picks.some(x => NOISE.test(x.product.title)),
  'ventilator en powerbank ontbreken')
const rejected = r.verdicts.filter(v => !v.accepted)
check('ruis is wél zichtbaar afgewezen', rejected.some(v => NOISE.test(v.title)),
  rejected.map(v => `${v.title.slice(0, 30)} (${v.score})`).join(', ') || 'geen')
const prijzen = r.picks.map(x => x.product.costPrice)
check('prijsspreiding in het assortiment', Math.max(...prijzen) / Math.min(...prijzen) >= 3,
  `inkoop €${Math.min(...prijzen).toFixed(2)} — €${Math.max(...prijzen).toFixed(2)}`)

say('')
say('  het assortiment:')
for (const x of r.picks) {
  say(`    ${x.typeName.padEnd(20)} [${x.tier.padEnd(7)}] ${String(x.score ?? '-').padStart(2)}/10  $${String(x.product.costPrice).padStart(5)}  ${x.product.title}`)
}

// ═══ 3. GEEN DUPLICATEN MEER IN fitProducts ═══
say('')
say('═══ 3. DUPLICATE-OPVULLING BESTAAT NIET MEER (Taak B) ═══')
const drie = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const gefit = fitProducts(drie)
check('3 producten blijven 3 producten', gefit.length === 3, `${gefit.length} terug (oud gedrag: 6, met a--v1/b--v1/c--v1)`)
check('geen enkel gekloond id', !gefit.some(x => x.id.includes('--v')), gefit.map(x => x.id).join(', '))
const twintig = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }))
check('boven 15 wordt begrensd, niet gedupliceerd', fitProducts(twintig).length === 15, `20 → ${fitProducts(twintig).length}`)

// ═══ 4. TE WEINIG? EXTRA TYPES, GEEN DUPLICATEN ═══
say('')
say('═══ 4. TE MAGERE NICHE → EXTRA TYPES, DAARNA EERLIJKE MELDING ═══')
const MAGER: Record<string, SupplierProduct[]> = {
  'beard oil': [p('m-oil', 'Beard Oil 30ml', 4.2)],
  'beard balm': [p('m-balm', 'Beard Balm 60g', 5.4)],
  'shaving razor': [p('m-razor', 'Safety Razor', 8.2)],
}
let magerCalls = 0
const magerResult = await buildAssortment({
  niche: NICHE, persona: PERSONA,
  search: async (term, max) => { magerCalls++; return (MAGER[term] ?? []).slice(0, max) },
  judge,
  onLog: () => { /* stil */ },
})
check('uitbreidingsronde is gedraaid', magerResult.types.length > TYPES.length,
  `${TYPES.length} types → ${magerResult.types.length} na uitbreiding`)
check('eerlijke melding i.p.v. opvulling', !!magerResult.shortfall, magerResult.shortfall ?? 'GEEN MELDING')
check('nog steeds geen duplicaten', new Set(magerResult.picks.map(x => x.product.productId)).size === magerResult.picks.length,
  `${magerResult.picks.length} producten, allemaal uniek`)
check('het echte aantal wordt genoemd', (magerResult.shortfall ?? '').includes(String(magerResult.picks.length)),
  `"${(magerResult.shortfall ?? '').slice(0, 90)}…"`)

// ═══ 5. LOGGING ═══
say('')
say('═══ 5. LOGGING PER TYPE (Taak E) ═══')
check('per type is vastgelegd wat het opleverde', r.attempts.every(a => typeof a.candidates === 'number'),
  `${r.attempts.length} pogingen met kandidaat-telling`)
check('lege types staan er met reden bij', r.attempts.some(a => a.candidates === 0 && !!a.note),
  r.attempts.filter(a => a.candidates === 0).map(a => `${a.name}: ${a.note}`).join(' · ') || 'geen lege types')
check('gekozen product staat per type genoteerd', r.attempts.filter(a => a.chosen).length === r.picks.length - (r.picks.length - distinct.size),
  `${r.attempts.filter(a => a.chosen).length} types met een gekozen product`)

say('')
say(`  zoekopdrachten: ${searchCalls} · LLM-calls: ${llmCalls} (types + relevantie per ronde)`)
say(`  magere niche: ${magerCalls} zoekopdrachten over ${magerResult.types.length} types`)

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
fs.writeFileSync(process.env.LOGFILE ?? 'assortment.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
