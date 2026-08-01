// Verificatie presetbibliotheek + batch-onderzoek.
//
// ⚠ LEES DIT EERST — WAT DEZE TEST WEL EN NIET BEWIJST
//
// Deze machine heeft GEEN geldige CJ- of DeepSeek-key. Alles hieronder draait
// tegen een NAGEBOOTSTE leverancier en een NAGEBOOTSTE LLM. Wat dat wél
// aantoont: dat de code doet wat hij zegt, niet crasht, de kwaliteitsdrempel
// handhaaft, mock-presets apart houdt en de juiste beslissingen neemt bij
// gegeven input.
//
// Wat het NIET aantoont: hoe echte CJ-data eruitziet, hoe lang een run duurt op
// de VPS, hoe vaak CJ 429 geeft, of DeepSeek bruikbare nichebeschrijvingen
// levert. Dat kan alleen op de VPS met echte keys — zie het stappenplan onderaan
// het rapport.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TMP = path.join(os.tmpdir(), 'dropship-presets')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
process.env.DATABASE_PATH = path.join(TMP, 'presets.db')

const {
  savePreset, listPresets, getPreset, presetStats, recordSkip, listSkips,
  alreadyHandled, markPresetUsed, deletePreset,
} = await import('../src/server/research/preset-store.js')
const { findPresetForNiche, lexicalScore } = await import('../src/server/research/preset-match.js')
const { fallbackBrief } = await import('../src/server/research/batch-research.js')
const {
  hardDisqualification, giftFramingDisqualification, machineTranslationDisqualification,
} = await import('../src/server/suppliers/product-relevance.js')

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

say('╔══════════════════════════════════════════════════════════════════╗')
say('║  LOKAAL NAGEBOOTST — nog niet op de VPS met echte keys bevestigd ║')
say('╚══════════════════════════════════════════════════════════════════╝')
say('')

const prod = (id: string, title: string, type: string, cost: number, tier: 'entry' | 'mid' | 'premium' = 'mid') => ({
  productId: id, variantId: `${id}-v`, supplier: 'cj', title, image: `https://x.invalid/${id}.jpg`,
  costPrice: cost, currency: 'USD', warehouse: 'DE', shippingDays: { min: 3, max: 6 },
  productType: type, productTier: tier, typeRole: 'onderdeel van het assortiment',
  relevanceScore: 9, relevanceReason: 'kernproduct', suggestedPriceEur: Math.round(cost * 2.8 * 0.92 * 100) / 100,
  marginEur: 10, marginPct: 70, reason: 'past bij de doelgroep',
})

const dogProducts = [
  prod('d1', 'Engraved Dog Collar Leather', 'dog collar', 8.9),
  prod('d2', 'Retractable Dog Leash 5m', 'dog leash', 9.4),
  prod('d3', 'No-Pull Dog Harness', 'dog harness', 11.2, 'premium'),
  prod('d4', 'Silicone Treat Pouch', 'treat pouch', 4.1, 'entry'),
  prod('d5', 'Collapsible Travel Bowl', 'travel bowl', 3.4, 'entry'),
  prod('d6', 'Reflective Night Collar', 'reflective collar', 6.8),
  prod('d7', 'Paw Cleaner Cup', 'paw cleaner', 5.5),
]

// ═══ 1. PRESET OPSLAAN + KWALITEITSEISEN ═══
say('═══ 1. PRESET OPSLAAN (Taak C — onderbouwing verplicht) ═══')
const saved = savePreset({
  niche: 'dog collars and leashes',
  categoryId: 'cat-dog', categoryName: 'Dog Accessories', parentName: 'Pet Supplies',
  persona: { label: 'Hondenbezitter', interests: ['honden', 'wandelen'], problem: 'riem die niet stuk gaat', priceRange: { min: 15, max: 55 } },
  products: dogProducts,
  types: dogProducts.map((p, i) => ({ id: `t${i}`, name: p.productType, searchTerm: p.productType, tier: p.productTier, role: 'kern' })),
  rationale: 'Wie een hond uitlaat koopt zelden één ding: halsband, riem en tuig horen bij elkaar, en de kleine accessoires (bakje, snoepzakje) verhogen de orderwaarde zonder extra verzendkosten.',
  problem: 'Goedkope riemen en halsbanden gaan snel stuk bij dagelijks gebruik.',
  keywords: ['dog', 'collar', 'leash', 'harness', 'walking'],
  shippingProfile: 'eu-fast',
  source: 'batch',
  isMock: true,
})
check('preset opgeslagen', !!getPreset('dog-collars-and-leashes'), saved.slug)
check('onderbouwing aanwezig', saved.rationale.length > 40, `${saved.rationale.length} tekens`)
check('klantprobleem vastgelegd', !!saved.problem, saved.problem ?? '')
check('producttypes geteld', saved.distinctTypes === 7, `${saved.distinctTypes} distincte types`)
check('gemiddelde score bewaard', saved.avgScore === 9, String(saved.avgScore))
check('als mock gemarkeerd', saved.isMock, 'is_mock = 1')

// ═══ 2. MOCK-SCHEIDING ═══
say('')
say('═══ 2. MOCK-PRESETS BLIJVEN UIT DE ECHTE FLOW ═══')
check('standaard-lijst laat mock weg', listPresets().length === 0, `${listPresets().length} presets zonder includeMock`)
check('expliciet opvragen kan wel', listPresets({ includeMock: true }).length === 1, '1 met includeMock')
const echt = savePreset({ ...saved, persona: saved.persona as Record<string, unknown>, niche: 'coffee brewing gear', products: dogProducts, types: saved.types, rationale: saved.rationale, keywords: ['coffee'], source: 'batch', isMock: false })
check('echte preset verschijnt wel', listPresets().some(p => p.slug === echt.slug), echt.slug)

// ═══ 3. MATCHING (Taak B) ═══
say('')
say('═══ 3. PRESET-MATCHING ═══')
const ctx = (niche: string, interests: string[] = []) => ({ niche, interests, personaLabel: '', problem: '' })
say(`  lexicale scores tegen "dog collars and leashes":`)
for (const q of ['dog collars', 'dog collars and leashes', 'dog walking gear', 'cat toys', 'koffiezetapparaten']) {
  say(`    ${String(Math.round(lexicalScore(ctx(q), saved) * 100)).padStart(3)}%  "${q}"`)
}
const hit = await findPresetForNiche(ctx('dog collars'), { allowMock: true, onLog: m => say(`    ${m}`) })
check('directe lexicale match', hit?.preset.slug === saved.slug && hit.how === 'lexicaal', hit ? `${hit.preset.niche} (${Math.round(hit.score * 100)}%)` : 'geen match')
const miss = await findPresetForNiche(ctx('aquarium filters'), { allowMock: true, onLog: () => { /* stil */ } })
check('geen match op een vreemde niche', miss === null, 'valt terug op live zoeken')

// Nederlandse invoer: precies waar de lexicale laag op stukloopt
const nlLexicaal = lexicalScore(ctx('hondenriemen en halsbanden'), saved)
check('Nederlands scoort lexicaal laag', nlLexicaal < 0.3, `${Math.round(nlLexicaal * 100)}% — daarom is er een semantische laag`)
const nlJudge = async (_s: string, u: string) => {
  const idx = u.split('\n').findIndex(l => /dog collars and leashes/.test(l))
  const nummer = Number(u.split('\n')[idx]?.trim().split('.')[0])
  return { match: nummer, reden: 'Hondenriemen en halsbanden is precies dit assortiment.' }
}
const nlHit = await findPresetForNiche(ctx('hondenriemen en halsbanden', ['honden']), { allowMock: true, judge: nlJudge, onLog: m => say(`    ${m}`) })
check('semantische laag vangt Nederlands op', nlHit?.preset.slug === saved.slug && nlHit.how === 'semantisch',
  nlHit ? nlHit.reason : 'geen match')
const kapotteJudge = async () => { throw new Error('LLM 401') }
const nlFail = await findPresetForNiche(ctx('hondenriemen en halsbanden'), { allowMock: true, judge: kapotteJudge, onLog: () => { /* stil */ } })
check('LLM stuk → geen preset, dus live zoeken', nlFail === null, 'vangnet blijft de live-flow')

// ═══ 4. GEBRUIK TELLEN ═══
say('')
markPresetUsed(saved.slug)
markPresetUsed(saved.slug)
check('gebruik wordt geteld', getPreset(saved.slug)?.usedCount === 2, '2×')

// ═══ 5. OVERSLAAN MET REDEN (Taak C) ═══
say('')
say('═══ 5. TE MAGERE CATEGORIE → GEEN PRESET ═══')
recordSkip('cat-thin', 'Rare Widgets', 'slechts 3 passende producten (drempel 7) — niets opgevuld', 3, true)
const skips = listSkips()
check('skip vastgelegd met reden', skips.some(s => s.categoryId === 'cat-thin' && /drempel 7/.test(s.reason)), skips[0]?.reason ?? '')
check('behandelde categorie wordt overgeslagen', alreadyHandled('cat-thin'), 'geen eindeloze herhaling in een volgende run')
check('onbekende categorie niet', !alreadyHandled('cat-nieuw'), 'die wordt wel geprobeerd')

// ═══ 6. KWALITEITSPOORTEN ═══
say('')
say('═══ 6. KWALITEITSPOORTEN OP PRESET-PRODUCTEN ═══')
const gift = { title: 'Cute Mug — Christmas Gift For Her, Birthday Present Idea', description: '' }
const mt = { title: 'Cross-border Hot Style Dog Collar, Explosion Models, Foreign Trade Pet Supplies, Spot Goods', description: '' }
const ok = { title: 'Engraved Leather Dog Collar', description: '' }
check('cadeau-framing afgewezen', giftFramingDisqualification('mugs', gift).rejected, giftFramingDisqualification('mugs', gift).reason.slice(0, 70))
check('gewone "gift set" blijft', !giftFramingDisqualification('beard care', { title: 'Beard Care Gift Set 6-Piece' }).rejected, 'geen gelegenheid/ontvanger in de titel')
check('cadeau-niche houdt cadeaus', !giftFramingDisqualification('christmas gifts', gift).rejected, 'niche gaat er zelf over')
check('machinevertaling afgewezen', machineTranslationDisqualification(mt).rejected, machineTranslationDisqualification(mt).signals.join(', '))
check('nette titel blijft', !machineTranslationDisqualification(ok).rejected, ok.title)
check('gecombineerde poort werkt', hardDisqualification('dog collars', mt).rejected && !hardDisqualification('dog collars', ok).rejected,
  'kostuum → cadeau → machinevertaling, eerste treffer wint')

// ═══ 7. DETERMINISTISCHE TERUGVAL ZONDER LLM ═══
say('')
say('═══ 7. BATCH ZONDER LLM — DETERMINISTISCHE NICHEBESCHRIJVING ═══')
const brief = fallbackBrief({
  categoryId: 'c1', name: 'Dog Accessories', parentName: 'Pet Supplies',
  totalAll: 420, totalEU: 190, shippingProfile: 'eu-fast',
  avgCostUsd: 7.5, avgMarginPct: 64, sampleTitles: ['Dog Collar', 'Dog Leash'],
})
check('niche afgeleid', brief.niche === 'dog accessories', brief.niche)
check('onderbouwing noemt de echte cijfers', /420/.test(brief.rationale) && /190/.test(brief.rationale), brief.rationale.slice(0, 80))
check('prijsklasse afgeleid van de inkoopprijs', brief.persona.priceRange.max > brief.persona.priceRange.min,
  `EUR ${brief.persona.priceRange.min}-${brief.persona.priceRange.max}`)

// ═══ 8. STATISTIEK ═══
say('')
const stats = presetStats()
say(`═══ 8. BIBLIOTHEEK: ${stats.total} presets (${stats.real} echt, ${stats.mock} mock), ${stats.products} producten, ${stats.skips} skips ═══`)
check('statistiek klopt', stats.total === 2 && stats.mock === 1 && stats.real === 1, JSON.stringify(stats))
check('verwijderen werkt', deletePreset(echt.slug) && !getPreset(echt.slug), echt.slug)

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
say('')
say('NOGMAALS: alles hierboven draaide op nagebootste CJ- en LLM-antwoorden.')
say('Geen enkele bewering over echte catalogusdata, doorlooptijd of rate limits.')

fs.writeFileSync(process.env.LOGFILE ?? 'preset-library.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
