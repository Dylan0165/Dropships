// ═══════ Store-wizard backend ═══════
// AI-denkstappen voor de multi-step wizard:
//   1. idee → verdiepende vragen
//   2. idee + antwoorden → 2-3 doelgroep-richtingen (persona's)
//   3. persona + CJ zoekresultaten → shortlist van 5-8 producten
//   4. persona + producten → voorstel site-structuur
// Alle calls gebruiken DeepSeek (zelfde provider als de pipeline).

import { getSupplier } from './suppliers/index.js'
import type { SupplierProduct } from './suppliers/index.js'
import { mcpProductDiscovery } from './suppliers/cj-mcp-search.js'
import { isMcpConfigured, McpUnavailableError } from './suppliers/cj-mcp-client.js'
import { scoreRelevance, type RelevanceVerdict } from './suppliers/product-relevance.js'

const LLM_BASE = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1'
const USD_TO_EUR = 0.92

export interface WizardPersona {
  label: string
  ageRange: string
  interests: string[]
  buyingMotivation: string
  problem: string
  priceRange: { min: number; max: number }
  tone?: string
}

export interface WizardDirection {
  id: string
  title: string
  persona: WizardPersona
  rationale: string
}

export interface WizardPage {
  id: string
  title: string
  purpose: string
  optional?: boolean
}

// ── LLM helper ────────────────────────────────────────────────────────────────

async function chatJson<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<T> {
  const apiKey = process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('LLM_API_KEY niet geconfigureerd — ga naar Settings')

  const resp = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-chat',
      messages: [
        { role: 'system', content: `${systemPrompt}\nAntwoord UITSLUITEND met geldige JSON — geen markdown, geen uitleg eromheen.` },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`LLM API error ${resp.status}: ${txt.slice(0, 200)}`)
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content ?? ''
  const match = content.match(/[{[][\s\S]*[}\]]/)
  if (!match) throw new Error(`LLM gaf geen JSON terug: ${content.slice(0, 200)}`)
  return JSON.parse(match[0]) as T
}

// ── Stap 1: verdiepende vragen ────────────────────────────────────────────────

export async function generateQuestions(idea: string): Promise<{
  questions: Array<{ id: string; question: string; suggestions: string[] }>
}> {
  return chatJson(
    'Je bent een Europese e-commerce strateeg die een dropshipping store helpt opzetten.',
    `Iemand wil een webshop starten rond dit idee: "${idea}".
Stel 3 korte verdiepende vragen (in het Nederlands) om de doelgroep scherp te krijgen.
Focus op: doelgroep (leeftijd/interesses/koopmotivatie), welk probleem het product oplost, en de passende prijsklasse.
Geef per vraag 3-4 aanklikbare suggestie-antwoorden.
JSON formaat:
{"questions":[{"id":"doelgroep","question":"...","suggestions":["...","..."]}]}`,
    { maxTokens: 1024 },
  )
}

// ── Stap 1b: richting-varianten (persona's) ──────────────────────────────────

export async function generateDirections(
  idea: string,
  answers: Record<string, string>,
): Promise<{ directions: WizardDirection[] }> {
  const result = await chatJson<{ directions: WizardDirection[] }>(
    'Je bent een Europese e-commerce strateeg. Je bedenkt concrete doelgroep-richtingen voor een dropshipping store.',
    `Idee: "${idea}"
Antwoorden van de gebruiker op verdiepende vragen:
${JSON.stringify(answers, null, 2)}

Genereer 3 duidelijk verschillende richting-varianten voor deze store, elk met een compleet doelgroepprofiel (persona).
Voorbeeld van variatie: "fitness-gericht, jong, €25-35" vs "office/professioneel, ouder, €40-60".
Prijzen in euro's, realistisch voor EU dropshipping (marge ≥ 2.5× inkoopprijs).
JSON formaat:
{"directions":[{
  "id":"fitness",
  "title":"korte titel",
  "rationale":"1-2 zinnen waarom deze richting kansrijk is (Nederlands)",
  "persona":{
    "label":"bv. Jonge fitness-fanaat",
    "ageRange":"18-30",
    "interests":["...","..."],
    "buyingMotivation":"...",
    "problem":"welk probleem lost het product op",
    "priceRange":{"min":25,"max":35},
    "tone":"tone of voice voor copy, bv. energiek en direct"
  }
}]}`,
    { maxTokens: 2048 },
  )
  // Zorg voor bruikbare ids
  result.directions = (result.directions ?? []).map((d, i) => ({ ...d, id: d.id || `richting-${i + 1}` }))
  return result
}

// ── Stap 2: product shortlist ─────────────────────────────────────────────────

export interface ShortlistResult {
  candidates: number
  shortlist: ShortlistedProduct[]
  supplierIsMock: boolean
  searchTermsTried: string[]
  searchTermUsed: string | null
  source: 'mcp' | 'rest' | 'mock'
  /**
   * Het assortiment: welke producttypes zijn bedacht, welke zijn doorzocht en
   * wat leverde elk op. Zonder dit is niet na te gaan of een korte lijst komt
   * doordat de leverancier niets heeft of doordat er niet gezocht is — precies
   * de blinde vlek waardoor "baard verzorging" op één producttype bleef steken.
   */
  assortment?: {
    types: Array<{ id: string; name: string; searchTerm: string; tier: string; role: string }>
    attempts: Array<{ typeId: string; name: string; terms: string[]; candidates: number; chosen?: { productId: string; title: string; score?: number }; note?: string }>
    distinctTypes: number
    searchCalls: number
    /** Eerlijke melding als er minder producten zijn dan het streefgetal. */
    shortfall?: string
    /** Gevuld als de producttype-generatie faalde en er op één term gezocht is. */
    typesFallback?: string
  }
  /**
   * Uitslag van de semantische poort. `verdicts` bevat ÓÓK de afgewezen
   * producten met hun score en reden — zonder dat kan niemand nakijken waarom
   * een lijst kort is, en dat is precies waarom er ooit stilzwijgend werd
   * aangevuld met producten die er niet hoorden.
   */
  relevance: {
    evaluated: number
    rejected: number
    verdicts: RelevanceVerdict[]
    /** Gevuld als de beoordeling niet kon draaien; dan is er niets weggegooid. */
    skipped?: string
  }
}

export interface ShortlistedProduct extends SupplierProduct {
  reason: string
  suggestedPriceEur: number
  marginEur: number
  marginPct: number
  /** Semantische relevantie 1-10 (zie product-relevance.ts). */
  relevanceScore?: number
  /** Waarom die score — zichtbaar in de wizard. */
  relevanceReason?: string
  /** Producttype uit het assortiment ("beard oil") — Engels, komt op de winkel. */
  productType?: string
  /** Prijsklasse van het type: instap / midden / premium. */
  productTier?: 'entry' | 'mid' | 'premium'
  /** Waarom dit type in het assortiment hoort (Nederlands, voor de operator). */
  typeRole?: string
}

/**
 * Vertaal het (mogelijk Nederlandse, lange) store-idee naar korte ENGELSE
 * CJ-zoektermen. CJ's productNameEn matcht op Engelse productnamen — een zin
 * als "draagbare blender voor onderweg" of zelfs een lange Engelse omschrijving
 * levert daar willekeurige catalogus-items op. 1-3 woorden per term werkt.
 */
export async function deriveSearchTerms(idea: string, persona?: WizardPersona): Promise<string[]> {
  try {
    const result = await chatJson<{ terms: string[] }>(
      'You translate e-commerce store ideas into product search keywords for a supplier catalog (CJ Dropshipping). The catalog matches on ENGLISH product names.',
      `Store idea (any language): "${idea}"
${persona ? `Target audience: ${JSON.stringify({ label: persona.label, interests: persona.interests, problem: persona.problem })}` : ''}

Give 3 ENGLISH product search terms for this idea, best first.
Rules: 1-3 words each, concrete product nouns (what the product IS, e.g. "portable blender"),
no marketing words, no audience words, singular or plural both fine.
JSON: {"terms":["portable blender","blender bottle","mini juicer"]}`,
      { maxTokens: 256, temperature: 0.2 },
    )
    const terms = (result.terms ?? []).map(t => String(t).trim()).filter(t => t.length >= 3 && t.length <= 40)
    if (terms.length > 0) return terms.slice(0, 3)
  } catch (err) {
    console.warn('[wizard] zoekterm-afleiding via LLM mislukt, val terug op ruwe input:', err instanceof Error ? err.message : err)
  }
  return [idea]
}

/**
 * Product-discovery voor de wizard. Bron-voorkeur:
 *   1. CJ MCP server (LLM roept zelf search_products e.d. aan) — indien geconfigureerd
 *   2. Directe REST (CJAdapter.searchProducts + deriveSearchTerms) als fallback
 * De EU-warehouse voorkeur en isRelevantToQuery-check gelden in BEIDE paden.
 * Mock-modus (geen CJ-key) gebruikt altijd REST (adapter geeft mock-producten).
 */
async function discoverCandidates(
  niche: string,
  persona: WizardPersona,
  maxResults: number,
): Promise<{ candidates: SupplierProduct[]; searchTermsTried: string[]; searchTermUsed: string | null; source: 'mcp' | 'rest' | 'mock' }> {
  const adapter = getSupplier('cj')

  // ── Pad 1: MCP (alleen als er een echte CJ-key/MCP-token is) ────────────────
  if (!adapter.isMock && isMcpConfigured()) {
    try {
      const r = await mcpProductDiscovery(niche, {
        label: persona.label, interests: persona.interests, problem: persona.problem, priceRange: persona.priceRange,
      }, { maxResults })
      if (r.products.length > 0) {
        console.log(`[wizard] MCP-discovery: ${r.products.length} kandidaten via ${r.toolCalls.length} tool-calls (term "${r.primaryTerm}")`)
        return { candidates: r.products, searchTermsTried: r.primaryTerm ? [r.primaryTerm] : [], searchTermUsed: r.primaryTerm, source: 'mcp' }
      }
      console.warn('[wizard] MCP-discovery gaf 0 producten — val terug op directe REST-search')
    } catch (err) {
      if (err instanceof McpUnavailableError) {
        console.warn(`[wizard] MCP niet beschikbaar (${err.message}) — val terug op directe REST-search`)
      } else {
        console.warn('[wizard] MCP-discovery fout — val terug op REST:', err instanceof Error ? err.message : err)
      }
    }
  }

  // ── Pad 2: directe REST-search ──────────────────────────────────────────────
  const terms = adapter.isMock ? [niche] : await deriveSearchTerms(niche, persona)
  console.log(`[wizard] REST CJ zoektermen voor "${niche}": ${JSON.stringify(terms)}`)
  let candidates: SupplierProduct[] = []
  let searchTermUsed: string | null = null
  for (const term of terms) {
    candidates = await adapter.searchProducts(term, { maxResults })
    if (candidates.length > 0) { searchTermUsed = term; break }
    console.log(`[wizard] zoekterm "${term}" gaf 0 relevante resultaten — probeer volgende`)
  }
  return { candidates, searchTermsTried: terms, searchTermUsed, source: adapter.isMock ? 'mock' : 'rest' }
}

export async function buildShortlist(
  niche: string,
  persona: WizardPersona,
  options: { maxResults?: number } = {},
): Promise<ShortlistResult> {
  const adapter = getSupplier('cj')
  const { candidates, searchTermsTried, searchTermUsed, source } =
    await discoverCandidates(niche, persona, options.maxResults ?? 30)

  if (candidates.length === 0) {
    return {
      candidates: 0, shortlist: [], supplierIsMock: adapter.isMock,
      searchTermsTried, searchTermUsed: null, source,
      relevance: { evaluated: 0, rejected: 0, verdicts: [] },
    }
  }

  // ── Semantische relevantie-poort ────────────────────────────────────────────
  // Het woordfilter in cj-adapter.ts is grof: het weet of er een relevant wóórd
  // in de titel staat. Hier beoordeelt de LLM of het product écht bij de niche
  // past. Alles onder de drempel gaat eruit — dat is de reden dat er een
  // ventilator op een blender-store kon staan.
  const relevance = await scoreRelevance(
    niche,
    { label: persona.label, interests: persona.interests, problem: persona.problem, priceRange: persona.priceRange },
    candidates,
    (system, user) => chatJson(system, user, { maxTokens: 2048, temperature: 0.2 }),
  )
  const relevant = relevance.kept
  const verdictById = new Map(relevance.verdicts.map(v => [v.productId, v]))

  if (relevant.length === 0) {
    // Liever een eerlijke lege lijst dan een gevulde met producten die er niet
    // horen. De UI toont dan de afgewezen kandidaten mét reden.
    console.warn(`[wizard] geen enkele kandidaat haalde de relevantie-drempel voor "${niche}"`)
    return {
      candidates: candidates.length, shortlist: [], supplierIsMock: adapter.isMock,
      searchTermsTried, searchTermUsed, source,
      relevance: { evaluated: candidates.length, rejected: relevance.verdicts.length, verdicts: relevance.verdicts, skipped: relevance.skipped },
    }
  }

  // Compacte weergave voor het LLM (tokens besparen)
  const compact = relevant.map(p => ({
    id: p.productId,
    title: p.title.slice(0, 90),
    costUsd: p.costPrice,
    rating: p.rating,
    warehouse: p.warehouse,
    shippingDays: p.shippingDays ? `${p.shippingDays.min}-${p.shippingDays.max}` : undefined,
    inventory: p.inventory,
  }))

  const selection = await chatJson<{
    shortlist: Array<{ id: string; reason: string; suggestedPriceEur: number }>
  }>(
    'Je bent een dropshipping product-analist voor de EU-markt. Je kiest producten die passen bij een doelgroepprofiel.',
    `Doelgroepprofiel:
${JSON.stringify(persona, null, 2)}

Beschikbare producten uit EU warehouses (inkoopprijs in USD):
${JSON.stringify(compact)}

Kies de beste producten voor deze doelgroep — maximaal 15, en NOOIT meer dan er
hierboven staan.

Belangrijk: vul de lijst NIET aan om een aantal te halen. Passen er maar drie
producten écht bij deze doelgroep, geef er dan drie. Een half-passend product
toevoegen om de collectie groter te laten lijken is erger dan een korte lijst —
de klant ziet meteen dat het assortiment niet klopt.

Weeg mee: past het bij de persona en het probleem, prijs binnen de prijsklasse
(verkoopprijs = ca. 2.5-3× inkoop, USD→EUR ×0.92), review-kwaliteit (rating),
verzendtijd en voorraad. Geef per product een suggestedPriceEur binnen de prijsklasse van de persona,
eindigend op .95.
JSON formaat:
{"shortlist":[{"id":"<product id>","reason":"1 zin Nederlands","suggestedPriceEur":29.95}]}`,
    { maxTokens: 3072, temperature: 0.4 },
  )

  // Alleen producten die de relevantie-poort haalden mogen gekozen worden; een
  // id dat de LLM erbij verzint of uit de afgewezen groep haalt valt af.
  const byId = new Map(relevant.map(p => [p.productId, p]))
  const shortlist: ShortlistedProduct[] = []
  for (const pick of selection.shortlist ?? []) {
    const product = byId.get(pick.id)
    if (!product) continue
    const costEur = Math.round(product.costPrice * USD_TO_EUR * 100) / 100
    const price = pick.suggestedPriceEur > costEur ? pick.suggestedPriceEur : (product.suggestedPrice ?? costEur * 2.8)
    const verdict = verdictById.get(product.productId)
    shortlist.push({
      ...product,
      reason: pick.reason ?? '',
      suggestedPriceEur: Math.round(price * 100) / 100,
      marginEur: Math.round((price - costEur) * 100) / 100,
      marginPct: Math.round(((price - costEur) / price) * 100),
      relevanceScore: verdict?.score,
      relevanceReason: verdict?.reason,
    })
  }

  return {
    candidates: candidates.length, shortlist, supplierIsMock: adapter.isMock,
    searchTermsTried, searchTermUsed, source,
    relevance: {
      evaluated: candidates.length,
      rejected: relevance.verdicts.filter(v => !v.accepted).length,
      verdicts: relevance.verdicts,
      skipped: relevance.skipped,
    },
  }
}

// ── Stap 3: site-structuur voorstel ──────────────────────────────────────────

export async function proposeStructure(
  idea: string,
  persona: WizardPersona,
  productCount: number,
): Promise<{ nicheType: string; pages: WizardPage[]; extras: WizardPage[]; rationale: string }> {
  return chatJson(
    'Je bent een conversie-specialist voor e-commerce websites.',
    `Store-idee: "${idea}"
Doelgroep: ${JSON.stringify(persona)}
Aantal gekozen producten: ${productCount}

Bepaal eerst of dit een impulsaankoop of overwogen aankoop is, en stel op basis daarvan het
optimale aantal pagina's voor. Impulsaankoop → compact (minder pagina's, focus op conversie);
overwogen aankoop → meer vertrouwen opbouwen (FAQ, reviews, uitgebreide productinfo).
De site heeft standaard al: Home, Checkout, Bedankt, Over ons, Contact, FAQ, Retour.
"pages" = de aanbevolen kernstructuur; "extras" = optionele extra's die de gebruiker kan aanvinken
(bv. blog, reviews-pagina, bundel-aanbiedingen sectie).
JSON formaat:
{"nicheType":"impulse|considered",
 "rationale":"korte onderbouwing in het Nederlands (2-3 zinnen)",
 "pages":[{"id":"home","title":"Home","purpose":"..."}],
 "extras":[{"id":"blog","title":"Blog","purpose":"...","optional":true}]}`,
    { maxTokens: 1536, temperature: 0.5 },
  )
}
