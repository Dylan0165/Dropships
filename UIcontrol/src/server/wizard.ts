// ═══════ Store-wizard backend ═══════
// AI-denkstappen voor de multi-step wizard:
//   1. idee → verdiepende vragen
//   2. idee + antwoorden → 2-3 doelgroep-richtingen (persona's)
//   3. persona + CJ zoekresultaten → shortlist van 5-8 producten
//   4. persona + producten → voorstel site-structuur
// Alle calls gebruiken DeepSeek (zelfde provider als de pipeline).

import { getSupplier } from './suppliers/index.js'
import type { SupplierProduct } from './suppliers/index.js'

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

export interface ShortlistedProduct extends SupplierProduct {
  reason: string
  suggestedPriceEur: number
  marginEur: number
  marginPct: number
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

export async function buildShortlist(
  niche: string,
  persona: WizardPersona,
  options: { maxResults?: number } = {},
): Promise<{ candidates: number; shortlist: ShortlistedProduct[]; supplierIsMock: boolean; searchTermsTried: string[]; searchTermUsed: string | null }> {
  const adapter = getSupplier('cj')

  // Idee → korte Engelse zoektermen; probeer ze in volgorde tot er resultaten zijn
  const terms = adapter.isMock ? [niche] : await deriveSearchTerms(niche, persona)
  console.log(`[wizard] CJ zoektermen voor "${niche}": ${JSON.stringify(terms)}`)

  let candidates: SupplierProduct[] = []
  let searchTermUsed: string | null = null
  for (const term of terms) {
    candidates = await adapter.searchProducts(term, { maxResults: options.maxResults ?? 30 })
    if (candidates.length > 0) { searchTermUsed = term; break }
    console.log(`[wizard] zoekterm "${term}" gaf 0 relevante resultaten — probeer volgende`)
  }

  if (candidates.length === 0) {
    return { candidates: 0, shortlist: [], supplierIsMock: adapter.isMock, searchTermsTried: terms, searchTermUsed: null }
  }

  // Compacte weergave voor het LLM (tokens besparen)
  const compact = candidates.map(p => ({
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

Kies de 8-15 beste producten voor deze doelgroep (genoeg voor een volwaardige collectie).
Weeg mee: past het bij de persona en het probleem, prijs binnen de prijsklasse
(verkoopprijs = ca. 2.5-3× inkoop, USD→EUR ×0.92), review-kwaliteit (rating),
verzendtijd en voorraad. Geef per product een suggestedPriceEur binnen de prijsklasse van de persona,
eindigend op .95.
JSON formaat:
{"shortlist":[{"id":"<product id>","reason":"1 zin Nederlands","suggestedPriceEur":29.95}]}`,
    { maxTokens: 3072, temperature: 0.4 },
  )

  const byId = new Map(candidates.map(p => [p.productId, p]))
  const shortlist: ShortlistedProduct[] = []
  for (const pick of selection.shortlist ?? []) {
    const product = byId.get(pick.id)
    if (!product) continue
    const costEur = Math.round(product.costPrice * USD_TO_EUR * 100) / 100
    const price = pick.suggestedPriceEur > costEur ? pick.suggestedPriceEur : (product.suggestedPrice ?? costEur * 2.8)
    shortlist.push({
      ...product,
      reason: pick.reason ?? '',
      suggestedPriceEur: Math.round(price * 100) / 100,
      marginEur: Math.round((price - costEur) * 100) / 100,
      marginPct: Math.round(((price - costEur) / price) * 100),
    })
  }

  return { candidates: candidates.length, shortlist, supplierIsMock: adapter.isMock, searchTermsTried: terms, searchTermUsed }
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
