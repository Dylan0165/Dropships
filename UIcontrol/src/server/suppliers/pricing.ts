// ═══════ Prijzen voor een compleet assortiment ═══════
//
// Eén LLM-call voor de hele collectie in plaats van één per product: twaalf
// calls geven hetzelfde antwoord voor twaalf keer de kosten en de wachttijd.
// Faalt de call, dan pakt de deterministische markup het op — een winkel zonder
// prijzen is geen winkel.
//
// Woont hier (en niet in wizard.ts) omdat zowel de wizard als het offline
// batch-onderzoek hem gebruikt; die twee mogen elkaar niet importeren.

import type { AssortmentPick } from './assortment.js'

const USD_TO_EUR = 0.92
const MARKUP = 2.8

export type PricingJudge = (system: string, user: string) => Promise<unknown>

export interface PricedEntry { priceEur: number; reason: string }

export interface PricingContext {
  label?: string
  ageRange?: string
  interests?: string[]
  problem?: string
  priceRange?: { min: number; max: number }
}

/** Deterministische terugval: 2.8× inkoop, afgerond op .95. */
export function fallbackPrice(costUsd: number): number {
  const eur = costUsd * USD_TO_EUR
  return Math.max(9.95, Math.floor(eur * MARKUP) + 0.95)
}

export async function priceAssortment(
  niche: string,
  persona: PricingContext,
  picks: AssortmentPick[],
  judge: PricingJudge,
): Promise<Map<string, PricedEntry>> {
  const out = new Map<string, PricedEntry>()
  if (picks.length === 0) return out
  try {
    const result = await judge(
      'Je bent een dropshipping product-analist voor de EU-markt. Je bepaalt verkoopprijzen binnen één samenhangend assortiment.',
      `Niche: "${niche}"
Doelgroepprofiel:
${JSON.stringify(persona, null, 2)}

Dit assortiment is al samengesteld — je kiest NIET welke producten meedoen, je bepaalt alleen prijs en onderbouwing:
${JSON.stringify(picks.map(p => ({
        id: p.product.productId,
        title: p.product.title.slice(0, 120),
        type: p.typeName,
        tier: p.tier,
        costUsd: p.product.costPrice,
        warehouse: p.product.warehouse,
      })))}

Geef per product een verkoopprijs in euro's:
- verkoopprijs ≈ 2.5-3× inkoop (USD→EUR ×0.92), eindigend op .95
- respecteer de prijsklasse van het type: entry onderin, premium bovenin de range van de persona
- het assortiment moet als geheel prijsspreiding tonen, niet tien keer hetzelfde bedrag
Plus één zin Nederlands waarom dit product in deze winkel past.

JSON formaat:
{"prices":[{"id":"<product id>","priceEur":29.95,"reason":"1 zin Nederlands"}]}`,
    ) as { prices?: Array<{ id: string; priceEur: number; reason: string }> }

    for (const p of result?.prices ?? []) {
      const price = Number(p.priceEur)
      if (!p.id || !isFinite(price) || price <= 0) continue
      out.set(String(p.id), { priceEur: price, reason: String(p.reason ?? '') })
    }
  } catch (err) {
    console.warn('[pricing] prijsbepaling via LLM mislukt — deterministische markup gebruikt:', err instanceof Error ? err.message : err)
  }
  return out
}

export interface AppliedPrice {
  suggestedPriceEur: number
  marginEur: number
  marginPct: number
  reason: string
}

/** Combineert LLM-prijs (indien bruikbaar) met de deterministische terugval. */
export function applyPricing(pick: AssortmentPick, priced: Map<string, PricedEntry>): AppliedPrice {
  const costEur = Math.round(pick.product.costPrice * USD_TO_EUR * 100) / 100
  const llm = priced.get(pick.product.productId)
  const price = llm && llm.priceEur > costEur
    ? llm.priceEur
    : (pick.product.suggestedPrice ?? fallbackPrice(pick.product.costPrice))
  return {
    suggestedPriceEur: Math.round(price * 100) / 100,
    marginEur: Math.round((price - costEur) * 100) / 100,
    marginPct: Math.round(((price - costEur) / price) * 100),
    reason: llm?.reason || pick.reason || '',
  }
}
