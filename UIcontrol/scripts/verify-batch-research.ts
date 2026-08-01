// End-to-end proef van het batch-onderzoek.
//
// ⚠ LOKAAL NAGEBOOTST. CJ draait in mock-modus (geen key) en de DeepSeek-calls
// worden onderschept met vaste antwoorden. Dit bewijst dat de KETEN werkt —
// scannen → nichebeschrijving → producttypes → assortiment → kwaliteitspoorten →
// preset of gemotiveerde skip — en dat hij niet crasht. Het bewijst NIETS over
// echte CJ-data, echte LLM-kwaliteit, doorlooptijd of rate limits.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TMP = path.join(os.tmpdir(), 'dropship-batch')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
process.env.DATABASE_PATH = path.join(TMP, 'batch.db')
process.env.LLM_API_KEY = 'test-key-not-real'
process.env.CJ_REQUEST_SPACING_MS = '0'      // alleen hier: er gaat niets naar CJ
process.env.CJ_SEARCH_CACHE_MS = '0'

// ── Onderschepte DeepSeek ─────────────────────────────────────────────────────
let llmCalls = 0
const seenPrompts: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (!url.includes('deepseek') && !url.includes('/chat/completions')) {
    return realFetch(input as RequestInfo, init)
  }
  llmCalls++
  const body = JSON.parse(String(init?.body ?? '{}')) as { messages: Array<{ content: string }> }
  const prompt = body.messages.map(m => m.content).join('\n')
  seenPrompts.push(prompt.slice(0, 60))

  const reply = (obj: unknown) => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(obj) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  // 1. Nichebeschrijving per categorie
  if (/Leverancierscategorie/.test(prompt)) {
    const cat = prompt.match(/Leverancierscategorie: "([^"]+)"/)?.[1] ?? 'Onbekend'
    const naam = cat.split('›').pop()!.trim().toLowerCase()
    return reply({
      niche: naam,
      problem: `Kopers vinden moeilijk goede ${naam} die snel geleverd wordt.`,
      rationale: `Deze producten horen bij elkaar omdat ze hetzelfde moment bedienen: iemand die met ${naam} bezig is, heeft er meerdere tegelijk nodig. Het aanbod is breed genoeg voor een echte collectie.`,
      keywords: naam.split(/\s+/).concat(['eu', 'fast shipping']),
      persona: {
        label: `${naam} koper`, ageRange: '25-45', interests: [naam],
        buyingMotivation: 'gemak', problem: `Goede ${naam} vinden`,
        priceRange: { min: 20, max: 60 }, tone: 'nuchter',
      },
    })
  }
  // 2. Producttypes
  if (/Stel het assortiment samen/.test(prompt)) {
    const niche = prompt.match(/Niche: "([^"]+)"/)?.[1] ?? 'items'
    const stam = niche.split(/\s+/)[0]
    const namen = ['starter', 'pro', 'compact', 'travel', 'refill', 'holder', 'cleaner', 'stand', 'cover', 'kit']
    return reply({
      types: namen.map((n, i) => ({
        name: `${stam} ${n}`, searchTerm: `${stam} ${n}`,
        tier: i < 3 ? 'entry' : i < 7 ? 'mid' : 'premium',
        role: `Onderdeel ${i + 1} van het assortiment`,
      })),
    })
  }
  // 3. Relevantiescores
  if (/score van 1 tot 10/.test(prompt)) {
    const ids = [...prompt.matchAll(/"id":"([^"]+)"/g)].map(m => m[1])
    return reply({ scores: ids.map(id => ({ id, score: 9, reason: 'Kernproduct voor deze niche.' })) })
  }
  // 4. Prijzen
  if (/verkoopprijs/.test(prompt)) {
    const ids = [...prompt.matchAll(/"id":"([^"]+)"/g)].map(m => m[1])
    return reply({ prices: ids.map((id, i) => ({ id, priceEur: 19.95 + i * 5, reason: 'Past bij de doelgroep.' })) })
  }
  return reply({})
}) as typeof fetch

const { runBatchResearch } = await import('../src/server/research/batch-research.js')
const { listPresets, listSkips, presetStats } = await import('../src/server/research/preset-store.js')
const { findPresetForNiche } = await import('../src/server/research/preset-match.js')

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

say('╔══════════════════════════════════════════════════════════════════════╗')
say('║  LOKAAL NAGEBOOTST — CJ in mock-modus, DeepSeek onderschept.         ║')
say('║  Bewijst dat de keten werkt en niet crasht. Niets over echte data,   ║')
say('║  doorlooptijd of rate limits — dat kan alleen op de VPS.             ║')
say('╚══════════════════════════════════════════════════════════════════════╝')
say('')

const t0 = Date.now()
const res = await runBatchResearch({
  maxCategories: 5,
  spacingMs: 0,          // in deze test gaat er niets naar CJ
  maxCalls: 400,
  onLog: m => say(`  ${m}`),
})
const lokaleDuur = Date.now() - t0

say('')
say('═══ UITKOMST ═══')
check('run afgerond zonder crash', true, `${res.scanned} categorieën behandeld`)
check('presets aangemaakt', res.presets > 0, `${res.presets} presets`)
check('run is als mock gemarkeerd', res.isMock, 'isMock = true')
check('alle presets dragen het mock-label', listPresets({ includeMock: true }).every(p => p.isMock),
  `${listPresets({ includeMock: true }).length} presets, allemaal is_mock = 1`)
check('mock-presets zijn onzichtbaar voor de echte flow', listPresets().length === 0,
  'listPresets() zonder includeMock geeft er nul')

const presets = listPresets({ includeMock: true })
say('')
say('  aangemaakte presets:')
for (const p of presets) {
  say(`    ${p.slug}`)
  say(`      ${p.productCount} producten · ${p.distinctTypes} types · gem. score ${p.avgScore}`)
  say(`      waarom: ${p.rationale.slice(0, 100)}…`)
}

check('elke preset haalt de drempel van 7', presets.every(p => p.productCount >= 7),
  presets.map(p => p.productCount).join(', '))
check('elke preset heeft een onderbouwing (Taak C)', presets.every(p => p.rationale.length > 40),
  'geen preset zonder "waarom dit assortiment"')
check('elke preset heeft een klantprobleem', presets.every(p => !!p.problem), 'problem gevuld')
check('producten hebben een producttype', presets.every(p => p.products.every(x => !!x.productType)),
  'categorie-indeling blijft werken')
check('producten hebben een prijs en marge', presets.every(p => p.products.every(x => x.suggestedPriceEur > 0 && x.marginEur > 0)),
  'prijszetting uit de gedeelde pricing-module')

const skips = listSkips()
if (skips.length > 0) {
  say('')
  say('  overgeslagen categorieën (met reden):')
  for (const s of skips) say(`    ${s.categoryName.padEnd(24)} ${s.found} gevonden — ${s.reason.slice(0, 80)}`)
}
check('overslaan gebeurt met een reden', skips.every(s => s.reason.length > 10), `${skips.length} skips`)

// ── Preset daarna vinden ──────────────────────────────────────────────────────
say('')
say('═══ DE BIBLIOTHEEK GEBRUIKEN ═══')
const eerste = presets[0]
const match = await findPresetForNiche(
  { niche: eerste.niche, interests: [] },
  { allowMock: true, onLog: m => say(`  ${m}`) },
)
check('een aangemaakte preset is terug te vinden', match?.preset.slug === eerste.slug,
  match ? `${match.preset.niche} via ${match.how}` : 'niet gevonden')
check('teruggevonden preset bevat de producten', (match?.preset.products.length ?? 0) >= 7,
  `${match?.preset.products.length} producten, 0 CJ-calls nodig`)

const stats = presetStats()
say('')
say(`  bibliotheek: ${stats.total} presets (${stats.real} echt, ${stats.mock} mock), ` +
  `${stats.products} producten, gemiddeld ${stats.avgProducts} per preset, ${stats.skips} skips`)

say('')
say('═══ LOKALE MEETWAARDEN (NIET REPRESENTATIEF VOOR PRODUCTIE) ═══')
say(`  duur van deze run          : ${Math.round(lokaleDuur / 1000)}s met tussenruimte 0ms en mock-data`)
say(`  CJ /product/list-calls     : ${res.cjCalls} (mock — er ging niets over het netwerk)`)
say(`  LLM-calls (onderschept)    : ${llmCalls}`)
say('  → Op de VPS staat de tussenruimte standaard op 2500ms en zijn de calls echt.')
say('    Wat een run daar kost aan tijd en calls is HIER NIET GEMETEN.')

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
fs.writeFileSync(process.env.LOGFILE ?? 'batch-research.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
