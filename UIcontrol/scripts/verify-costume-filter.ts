// Verificatie — verkleedkleding voor mensen hoort niet in een niche-winkel.
//
// De titels hieronder zijn LETTERLIJK overgenomen van trailpaw.clynado.com,
// waar ze op 30 juli 2026 in de productgrid van een hondenwinkel stonden.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TMP = path.join(os.tmpdir(), 'dropship-costume')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
process.env.DATABASE_PATH = path.join(TMP, 'c.db')
process.env.STORES_WORKSPACE = path.join(TMP, 'stores')

import {
  scoreRelevance, costumeDisqualification, nicheIsAboutCostumes, RELEVANCE_THRESHOLD,
} from '../src/server/suppliers/product-relevance.js'
import { isRelevantToQuery } from '../src/server/suppliers/cj-adapter.js'
import type { SupplierProduct } from '../src/server/suppliers/types.js'

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

const p = (title: string, cost = 9.95): SupplierProduct => ({
  supplier: 'cj', productId: 'cj-' + title.slice(0, 18).replace(/\W+/g, '-').toLowerCase(),
  title, description: '', category: 'Pet Supplies', image: '', costPrice: cost, currency: 'USD', warehouse: 'CN',
})

// Exact zoals ze live stonden
const KOSTUUM_1 = p('Dalmatian Costume Set, 3-Piece Dog Costume For Adults, Dalmatian Ears + Gloves + Tail, Animal Costume For Carnival, Cosplay & Theme Parties—Party Accessory Set', 3.55)
const KOSTUUM_2 = p('Dalmatian Dog Costume, 3-Piece Dalmatian Costume Set With Polka-Dot Skirt, Ears & Tail, Animal Costume For Cosplay, Carnival & Halloween, Polka-Dot Outfit For Women—Party Accessory Set', 5.35)
const KOSTUUM_3 = p("Multi-piece Party Gift Set, 1 Lion's Mane Dog Costume—adjustable, Soft, And Comfortable—perfect For Holidays, Parties, And Celebrations—easy To Put On", 6.75)
const ECHT_1 = p('Engraved Dog Collar And Leash Pet Supplies', 8.9)
const ECHT_2 = p('Blue Agate Dog Collar Pet Supplies Export Leash Set Gold Buckle', 5.7)
const ECHT_3 = p('Dog Toys Soccer Ball With Straps, Interactive Toys For Tug Of War, Puppy Birthday Toy', 10.3)

const NICHE = 'dog collars and leashes'
const PERSONA = { label: 'Hondenbezitter', interests: ['honden', 'wandelen'], problem: 'riem die niet stuk gaat', priceRange: { min: 15, max: 50 } }

// ═══ 1. HET WOORDFILTER LIET ZE DOOR ═══
say('═══ 1. WAAROM ZE ER DOORHEEN KWAMEN — HET WOORDFILTER ═══')
for (const c of [KOSTUUM_1, KOSTUUM_2, KOSTUUM_3]) {
  say(`  ${isRelevantToQuery(NICHE, c) ? 'DOORGELATEN' : 'geweigerd   '}  ${c.title.slice(0, 62)}…`)
}
check('het grove woordfilter laat kostuums door', [KOSTUUM_1, KOSTUUM_2, KOSTUUM_3].every(c => isRelevantToQuery(NICHE, c)),
  'ze bevatten allemaal "dog" — daar is dat filter niet tegen bestand')
say('  (dat is niet erg: daar is de semantische laag voor. Die faalde hier.)')

// ═══ 2. AFGEKAPTE TITEL — WAT DE BEOORDELAAR ZAG ═══
say('')
say('═══ 2. DE BEOORDELAAR KREEG EEN AFGEKAPTE TITEL ═══')
const oud = KOSTUUM_2.title.slice(0, 110)
const nieuw = KOSTUUM_2.title.slice(0, 240)
say(`  oud (110): "${oud}"`)
check('het beslissende signaal viel weg bij 110 tekens', !/outfit for women/i.test(oud),
  '"Polka-Dot Outfit For Women" stond ná teken 110')
check('bij 240 tekens staat het er wél in', /outfit for women/i.test(nieuw), 'volledige titel bereikt de beoordelaar')

// ═══ 3. HARDE DISKWALIFICATIE ═══
say('')
say('═══ 3. HARDE DISKWALIFICATIE (Taak A) ═══')
for (const c of [KOSTUUM_1, KOSTUUM_2, KOSTUUM_3]) {
  const dq = costumeDisqualification(NICHE, c)
  say(`  ${dq.rejected ? 'AFGEWEZEN' : 'doorgelaten'}  ${c.title.slice(0, 46)}…`)
  say(`             ${dq.reason || '—'}`)
  say(`             signalen: ${dq.signals.join(', ') || 'geen'}`)
}
check('kostuum voor volwassenen afgewezen', costumeDisqualification(NICHE, KOSTUUM_1).rejected, 'costume + for adults')
check('damesrokje afgewezen', costumeDisqualification(NICHE, KOSTUUM_2).rejected, 'costume + skirt + for women')
check('feestset met hondenkostuum afgewezen', costumeDisqualification(NICHE, KOSTUUM_3).rejected,
  'de niche gaat over halsbanden en riemen, niet over verkleden')
check('halsband komt gewoon door', !costumeDisqualification(NICHE, ECHT_1).rejected, ECHT_1.title)
check('riem-set komt gewoon door', !costumeDisqualification(NICHE, ECHT_2).rejected, ECHT_2.title)
check('hondenspeelgoed komt door ondanks "Birthday" en "Party"-achtige woorden',
  !costumeDisqualification(NICHE, ECHT_3).rejected, ECHT_3.title.slice(0, 50))

say('')
say('  een niche die WÉL over verkleden gaat:')
check('kostuum-niche herkend', nicheIsAboutCostumes('halloween costumes for pets'), 'nicheIsAboutCostumes')
check('daar blijven kostuums staan', !costumeDisqualification('halloween costumes and cosplay', KOSTUUM_1).rejected,
  'geen diskwalificatie in een verkleedwinkel')
check('ook via de persona', !costumeDisqualification('party supplies', KOSTUUM_1, { personaText: 'mensen die van carnaval houden' }).rejected,
  'persona noemt carnaval')

// ═══ 4. ZWAARDER DAN DE LLM ═══
say('')
say('═══ 4. DE REGEL WEEGT ZWAARDER DAN TREFWOORD-OVERLAP ÉN DAN DE LLM ═══')
// Deze judge doet precies wat er live misging: hij ziet "dog" en geeft een 7.
let voorgelegd: string[] = []
const goedgelovigeJudge = async (_s: string, u: string) => {
  voorgelegd = [...u.matchAll(/"title":"([^"]{10,})"/g)].map(m => m[1])
  const ids = [...u.matchAll(/"id":"([^"]+)"/g)].map(m => m[1])
  return { scores: ids.map(id => ({ id, score: 7, reason: 'Bevat "dog" — lijkt te passen.' })) }
}
const logs: string[] = []
const r = await scoreRelevance(NICHE, PERSONA, [KOSTUUM_1, KOSTUUM_2, KOSTUUM_3, ECHT_1, ECHT_2, ECHT_3],
  goedgelovigeJudge, { onLog: m => logs.push(m) })

say('  scores zoals ze in de log komen:')
for (const v of [...r.verdicts].sort((a, b) => a.score - b.score)) {
  say(`    ${v.accepted ? '✓' : '✗'} ${String(v.score).padStart(2)}/10  ${v.title.slice(0, 52).padEnd(52)} ${v.reason.slice(0, 70)}`)
}
check('alle drie de kostuums afgewezen ondanks een 7 van de LLM',
  [KOSTUUM_1, KOSTUUM_2, KOSTUUM_3].every(c => !r.kept.some(k => k.productId === c.productId)),
  `${r.kept.length} producten gehouden: ${r.kept.map(k => k.title.slice(0, 24)).join(' · ')}`)
check('ze krijgen score 1, niet 7', [KOSTUUM_1, KOSTUUM_2, KOSTUUM_3]
  .every(c => r.verdicts.find(v => v.productId === c.productId)?.score === 1), 'harde poort overschrijft het model')
check('met reden, navolgbaar in de UI', r.verdicts.filter(v => !v.accepted).every(v => v.reason.length > 20),
  'elke afwijzing heeft een uitleg')
check('de echte hondenartikelen blijven', [ECHT_1, ECHT_2, ECHT_3].every(c => r.kept.some(k => k.productId === c.productId)),
  `${r.kept.length}/3`)
check('kostuums worden niet eens aan de LLM voorgelegd', !voorgelegd.some(t => /costume/i.test(t)),
  `${voorgelegd.length} producten voorgelegd, geen enkel kostuum`)
check('de volledige titel gaat wél mee voor de rest', voorgelegd.some(t => t.length > 60), 'titels niet meer op 110 afgekapt')

// ═══ 5. OOK ALS DE LLM UITVALT ═══
say('')
say('═══ 5. LLM ONBEREIKBAAR → KOSTUUMS BLIJVEN GEWEERD ═══')
const kapot = async () => { throw new Error('LLM 401') }
const r2 = await scoreRelevance(NICHE, PERSONA, [KOSTUUM_1, ECHT_1], kapot, { onLog: () => { /* stil */ } })
check('kostuum niet in de gehouden lijst', !r2.kept.some(k => k.productId === KOSTUUM_1.productId),
  `${r2.kept.length} gehouden: ${r2.kept.map(k => k.title.slice(0, 30)).join(', ')}`)
check('de afwijzing is zichtbaar', r2.verdicts.some(v => v.productId === KOSTUUM_1.productId && !v.accepted),
  'staat in verdicts met reden')
check('het echte product blijft wél staan', r2.kept.some(k => k.productId === ECHT_1.productId), 'halsband behouden')

// ═══ 6. DREMPEL ONGEWIJZIGD ═══
say('')
check('drempel blijft 6', RELEVANCE_THRESHOLD === 6, `${RELEVANCE_THRESHOLD}`)

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
fs.writeFileSync(process.env.LOGFILE ?? 'costume-filter.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
