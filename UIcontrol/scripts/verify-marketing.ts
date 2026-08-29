// Verificatie marketing-agent.
//
// ⚠ LOKAAL NAGEBOOTST waar het de LLM betreft: deze machine heeft geen geldige
// DeepSeek-key, dus het model wordt onderschept met vaste antwoorden. Wat hier
// wél echt is: de kwaliteitspoorten, de SQLite-opslag, de bewerk-semantiek en
// het gedrag bij hergenereren. De kwaliteit van de échte captions kan alleen op
// de VPS met een geldige key beoordeeld worden.
//
// Met LOGFILE + KEEPDB draait dit script tegen een vaste database, zodat de
// UI-test daarna dezelfde data ziet.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DB = process.env.MARKETING_DB ?? path.join(os.tmpdir(), 'dropship-marketing', 'm.db')
fs.mkdirSync(path.dirname(DB), { recursive: true })
if (!process.env.KEEPDB) fs.rmSync(DB, { force: true })
process.env.DATABASE_PATH = DB

const {
  generateMarketingContent, listMarketingContent, updateMarketingItem,
  checkClaims, normalizeHashtags, buildPrompt,
} = await import('../src/server/marketing-agent.js')
const { containsAiEmoji } = await import('../src/server/design/sanitize.js')

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

say('╔════════════════════════════════════════════════════════════════════╗')
say('║  LLM lokaal onderschept — captions van het echte model zijn nog    ║')
say('║  niet beoordeeld. Poorten, opslag en bewerken zijn wél echt.       ║')
say('╚════════════════════════════════════════════════════════════════════╝')
say('')

const STORE = 'store-verify-marketing'
const input = {
  storeId: STORE,
  brandName: 'Trailform',
  niche: 'portable gym equipment',
  tone: 'nuchter en direct',
  storyAngle: 'We got tired of gear that rattles apart after a month.',
  usps: [{ title: 'Tested first', desc: 'We order and try everything before listing it.' }],
  products: [
    { title: 'Resistance Band Set 5-Piece', price: 24.95, productType: 'resistance band' },
    { title: 'Steel Jump Rope 3m', price: 18.95, productType: 'jump rope' },
  ],
}

// ── 1. De prompt draagt de kwaliteitsregels ──────────────────────────────────
say('═══ 1. PROMPT ═══')
const prompt = buildPrompt(input)
check('winkelgegevens zitten in de prompt',
  prompt.user.includes('Trailform') && prompt.user.includes('portable gym equipment') && prompt.user.includes('Resistance Band'),
  'merknaam, niche en producten')
check('toon en verhaal gaan mee', prompt.user.includes('nuchter en direct') && prompt.user.includes('rattles apart'),
  'toon + story angle uit de bestaande brief')
check('emoji-verbod staat erin', /GEEN emoji/.test(prompt.user), 'zelfde eis als de site-copy')
check('verbod op verzonnen cijfers staat erin', /GEEN verzonnen cijfers/.test(prompt.user), 'geen klantaantallen of sterren')

// ── 2. Claim-poort ───────────────────────────────────────────────────────────
say('')
say('═══ 2. KWALITEITSPOORT: GEEN VERZONNEN CLAIMS ═══')
const slecht = [
  'Join 10,000+ happy customers who train at home.',
  'Rated 4.9/5 by our community.',
  'The #1 resistance band set in Europe.',
  'Clinically proven to build muscle faster.',
  'Thousands of athletes already switched.',
]
const goed = [
  'Five bands, 3 to 25 kg, in a pouch that fits a jacket pocket.',
  'Ships from Germany, so it is with you in about four days.',
  'The 3m steel rope has replaceable bearings — no glue, just screws.',
  'Costs EUR 24.95 and comes with a 30-day return window.',
]
for (const t of slecht) {
  const r = checkClaims(t)
  say(`  ${r.ok ? 'DOOR ' : 'STOP '} ${t}`)
  if (!r.ok) say(`         ${r.issues.join(' · ')}`)
}
check('alle verzonnen claims worden gevangen', slecht.every(t => !checkClaims(t).ok), `${slecht.length}/${slecht.length}`)
check('concrete captions blijven staan', goed.every(t => checkClaims(t).ok), `${goed.length}/${goed.length} doorgelaten`)
check('prijs en maat blijven toegestaan', checkClaims('Costs EUR 24.95, 3m long, 5 pieces.').ok,
  'productgegevens zijn geen verzonnen claim')

// ── 3. Hashtags ──────────────────────────────────────────────────────────────
say('')
const tags = normalizeHashtags(['homegym', '#HomeGym', 'resistance bands', '🚀fitness', ''])
check('hashtags genormaliseerd en ontdubbeld', tags.length === 3 && tags[0] === '#homegym' && !tags.some(containsAiEmoji),
  tags.join(' '))

// ── 4. Generatie met onderschept model ───────────────────────────────────────
say('')
say('═══ 4. GENERATIE (model onderschept) ═══')
const judge = async () => ({
  tiktok: [
    { caption: 'Five bands, one pouch, fits in a jacket pocket 🚀', hashtags: ['homegym', 'resistancebands'] },
    { caption: 'Join 10,000+ happy customers training at home.', hashtags: ['fitness'] },
    { caption: 'The rope has replaceable bearings. Screws, not glue.', hashtags: ['jumprope', 'homegym'] },
  ],
  instagram: [
    { caption: 'We tested eleven sets before picking this one. Ships from Germany in about four days.', hashtags: ['homegym'] },
    { caption: 'Rated 4.9/5 by our community of athletes.', hashtags: ['fitness'] },
  ],
  shots: [
    { product: 'Resistance Band Set 5-Piece', idea: 'Hand pulling one band to full stretch, close-up on the seam.' },
    { product: 'Steel Jump Rope 3m', idea: 'Overhead shot of the rope coiled next to the pouch it ships in.' },
  ],
})

const result = await generateMarketingContent(input, { judge, onLog: m => say(`  ${m}`) })
check('generatie geslaagd', result.ok, `${result.captions} captions, ${result.shots} film-suggesties`)
check('verzonnen claims geweigerd', result.rejected.length === 2,
  result.rejected.map(r => r.issues[0]).join(' · '))
check('emoji verwijderd', result.emojiStripped > 0, `${result.emojiStripped} veld(en) — de raket in caption 1`)

const items = listMarketingContent(STORE)
check('opgeslagen in dezelfde SQLite-database', items.length === result.created, `${items.length} rijen`)
check('geen emoji in de opgeslagen tekst', !items.some(i => containsAiEmoji(i.contentText)), 'alle rijen schoon')
check('geen geweigerde caption in de database', !items.some(i => /10,000|4\.9\/5/.test(i.contentText)),
  'de twee claim-varianten staan er niet in')
check('platformen gescheiden', new Set(items.map(i => i.platform)).size === 3, 'tiktok, instagram, shot-idea')
check('film-suggesties hangen aan een product', items.filter(i => i.kind === 'shot').every(i => !!i.productTitle),
  items.filter(i => i.kind === 'shot').map(i => i.productTitle).join(' | '))
check('alles start als concept', items.every(i => i.status === 'draft'), 'status = draft')

say('')
say('  opgeslagen content:')
for (const i of items) {
  say(`    [${i.platform}] ${i.contentText.slice(0, 62)}${i.contentText.length > 62 ? '…' : ''}`)
  if (i.hashtags.length) say(`               ${i.hashtags.join(' ')}`)
}

// ── 5. Bewerken ──────────────────────────────────────────────────────────────
say('')
say('═══ 5. BEWERKEN DOOR DE OPERATOR ═══')
const first = items.find(i => i.kind === 'caption')!
const edited = updateMarketingItem(first.id, { contentText: 'Vijf banden, één pouch. Past in je jaszak.' })
check('tekst opgeslagen', edited?.contentText === 'Vijf banden, één pouch. Past in je jaszak.', edited?.contentText ?? '')
check('status automatisch op bewerkt', edited?.status === 'edited', 'zo zie je wat een mens heeft nagelopen')
const withEmoji = updateMarketingItem(first.id, { contentText: 'Past in je jaszak 🔥💯' })
check('emoji-filter geldt ook bij handmatig bewerken', !containsAiEmoji(withEmoji?.contentText ?? ''),
  `"${withEmoji?.contentText}"`)
const used = updateMarketingItem(first.id, { status: 'used' })
check('als gebruikt markeren werkt', used?.status === 'used', 'voorkomt dat je twee keer hetzelfde plaatst')

// ── 6. Hergenereren spaart wat al geplaatst is ───────────────────────────────
say('')
say('═══ 6. HERGENEREREN ═══')
const before = listMarketingContent(STORE).filter(i => i.status === 'used').length
await generateMarketingContent(input, { judge, onLog: () => { /* stil */ } })
const after = listMarketingContent(STORE)
check('geplaatste content blijft staan', after.filter(i => i.status === 'used').length === before,
  `${before} gebruikte variant(en) overleven de nieuwe ronde`)
check('concepten zijn vervangen', after.filter(i => i.status === 'draft').length === result.created,
  `${after.filter(i => i.status === 'draft').length} nieuwe concepten`)

// ── 7. Model onbereikbaar ────────────────────────────────────────────────────
say('')
const kapot = async () => { throw new Error('LLM 401: invalid api key') }
const failed = await generateMarketingContent({ ...input, storeId: 'store-kapot' }, { judge: kapot, onLog: () => { /* stil */ } })
check('mislukte generatie geeft nette fout', !failed.ok && !!failed.error, failed.error ?? '')
check('geen halve rijen achtergelaten', listMarketingContent('store-kapot').length === 0, '0 rijen')

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
say('')
say('Nog niet bewezen: de kwaliteit van captions van het ECHTE model. Dat kan')
say('alleen op de VPS, met een geldige DeepSeek-key.')

fs.writeFileSync(process.env.LOGFILE ?? 'marketing.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
