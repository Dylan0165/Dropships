// Verificatie Taak A — relevantie in twee lagen.
// Laag 1 (woordfilter) draait zonder LLM. Laag 2 (semantisch) krijgt een
// injecteerbare judge, zodat de logica ook zonder geldige API-key te bewijzen is.
import fs from 'node:fs'
import { isRelevantToQuery } from '../src/server/suppliers/cj-adapter.js'
import { scoreRelevance, RELEVANCE_THRESHOLD } from '../src/server/suppliers/product-relevance.js'
import type { SupplierProduct } from '../src/server/suppliers/types.js'

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

const p = (title: string, description = '', category = '', costPrice = 12): SupplierProduct => ({
  supplier: 'cj', productId: 'cj-' + title.toLowerCase().replace(/\W+/g, '-').slice(0, 24),
  title, description, category, image: '', costPrice, currency: 'USD', warehouse: 'DE',
})

const NICHE = 'portable blender bottles'
const KANDIDATEN = [
  p('Portable Blender Bottle 380ml USB Rechargeable', 'Six-blade juicer cup for smoothies on the go', 'Kitchen'),
  p('Smoothie Blender Cup 500ml', 'Rechargeable personal blender with travel lid', 'Kitchen'),
  p('Mini Juicer Bottle Wireless', 'Crushes ice and frozen fruit', 'Kitchen'),
  p('Portable Leafless Cooling Fan', 'USB desk fan, bladeless and quiet', 'Home Appliance', 9),
  p('Portable Car Vacuum Cleaner', 'Handheld 12V vacuum for car interiors', 'Car', 15),
  p('LED Strip Lights 5m RGB', 'Remote controlled mood lighting', 'Lighting', 7),
]

say('═══ 1. LAAG 1 — WOORDFILTER (de eigenlijke root cause) ═══')
say(`niche: "${NICHE}"`)
for (const c of KANDIDATEN) {
  const ok = isRelevantToQuery(NICHE, c)
  say(`  ${ok ? 'doorgelaten' : 'geweigerd  '}  ${c.title}`)
}
check('ventilator wordt nu geweigerd op "portable"',
  !isRelevantToQuery(NICHE, KANDIDATEN[3]), 'deelt alleen het algemene woord "portable"')
check('kruimeldief wordt geweigerd', !isRelevantToQuery(NICHE, KANDIDATEN[4]), 'idem')
check('echte blender komt door', isRelevantToQuery(NICHE, KANDIDATEN[0]), 'matcht op "blender" en "bottle"')
check('smoothie-cup komt door', isRelevantToQuery(NICHE, KANDIDATEN[1]), 'matcht op "blender"')
check('LED-strip blijft geweigerd', !isRelevantToQuery(NICHE, KANDIDATEN[5]), 'geen enkel woord gemeen')

say('')
say('═══ 2. LAAG 2 — SEMANTISCHE SCORE ═══')
// De judge simuleert wat de LLM teruggeeft. De logica die getest wordt is:
// score toekennen, onder de drempel wegfilteren, alles loggen.
const judge = async (_s: string, u: string) => {
  const ids = [...u.matchAll(/"id":"([^"]+)"/g)].map(m => m[1])
  return {
    scores: ids.map(id => {
      if (id.includes('cooling-fan')) return { id, score: 1, reason: 'Een ventilator, geen blender — deelt alleen het woord "portable".' }
      if (id.includes('vacuum')) return { id, score: 2, reason: 'Autostofzuiger; andere productcategorie en andere doelgroep.' }
      if (id.includes('mini-juicer')) return { id, score: 7, reason: 'Sapcentrifuge-variant, past logisch bij het assortiment.' }
      return { id, score: 9, reason: 'Precies waarvoor de klant komt.' }
    }),
  }
}

const logs: string[] = []
const r = await scoreRelevance(NICHE, { label: 'Sporter onderweg', priceRange: { min: 25, max: 45 } },
  KANDIDATEN, judge, { onLog: m => logs.push(m) })

say(`  beoordeeld: ${r.verdicts.length}, gehouden: ${r.kept.length}, drempel: ${RELEVANCE_THRESHOLD}`)
say('')
say('  scores (ook de afgewezen producten):')
for (const v of [...r.verdicts].sort((a, b) => b.score - a.score)) {
  say(`    ${v.accepted ? '✓' : '✗'} ${String(v.score).padStart(2)}/10  ${v.title.slice(0, 46).padEnd(46)} ${v.reason}`)
}

const fan = r.verdicts.find(v => v.title.includes('Cooling Fan'))!
check('ventilator krijgt een lage score', fan.score <= 2, `${fan.score}/10 — "${fan.reason}"`)
check('ventilator wordt AUTOMATISCH geweigerd', !fan.accepted && !r.kept.some(k => k.title.includes('Cooling Fan')),
  'komt niet in de gehouden lijst voor')
check('afgewezen producten blijven zichtbaar met reden',
  r.verdicts.filter(v => !v.accepted).every(v => v.reason.length > 10),
  `${r.verdicts.filter(v => !v.accepted).length} afwijzingen, allemaal met uitleg`)
check('randgeval boven de drempel blijft', r.kept.some(k => k.title.includes('Mini Juicer')), 'score 7 ≥ 6')
check('elke score staat in de log', logs.filter(l => l.includes('/10')).length === r.verdicts.length,
  `${logs.filter(l => l.includes('/10')).length} logregels met een score`)

say('')
say('═══ 3. GEEN QUOTUM-OPVULLING ═══')
const allesSlecht = async (_s: string, u: string) => ({
  scores: [...u.matchAll(/"id":"([^"]+)"/g)].map(m => ({ id: m[1], score: 2, reason: 'Past niet bij deze niche.' })),
})
const leeg = await scoreRelevance(NICHE, {}, KANDIDATEN, allesSlecht, { onLog: () => { /* stil */ } })
check('niets passends → lege lijst, geen opvulling', leeg.kept.length === 0,
  `${leeg.kept.length} producten gehouden van ${KANDIDATEN.length}`)
check('de afwijzingen zijn wél opvraagbaar', leeg.verdicts.length === KANDIDATEN.length,
  `${leeg.verdicts.length} oordelen bewaard`)

say('')
say('═══ 4. LLM ONBEREIKBAAR → NIETS WEGGOOIEN ═══')
const kapot = async () => { throw new Error('LLM 401: invalid api key') }
const safe = await scoreRelevance(NICHE, {}, KANDIDATEN, kapot, { onLog: () => { /* stil */ } })
check('bij een LLM-fout blijft alles staan', safe.kept.length === KANDIDATEN.length,
  `${safe.kept.length}/${KANDIDATEN.length} — liever alles tonen dan stil filteren`)
check('de reden wordt doorgegeven', !!safe.skipped, `skipped="${safe.skipped}"`)

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
fs.writeFileSync(process.env.LOGFILE ?? 'relevance.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
