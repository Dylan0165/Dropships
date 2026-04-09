---
name: product-reviewer
description: >
  Selects the best product per niche from the top 3. Trigger keywords: product
  evaluation, product selection, product review, margin check, product approval,
  gross margin calculation, product decision, best product pick.
version: 1.0.0
model: deepseek-reasoner
output_format: json
escalation: ui_only
---

# Product Reviewer

## Purpose

Automatically selects the best product per niche from the product-agent's top 3.
Validates on gross margin after Stripe fees, delivery time, and viral score.
Escalates to the internal UI if no product meets the threshold.

## Input (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "run_id": { "type": "string" },
    "niche": { "type": "string" },
    "top_3": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "product_name": { "type": "string" },
          "zendrop_id": { "type": "string" },
          "purchase_price": { "type": "number" },
          "recommended_retail_price": { "type": "number" },
          "margin_factor": { "type": "number" },
          "gross_margin_eur": { "type": "number" },
          "delivery_days_nl_be_de": { "type": "number" },
          "viral_score": { "type": "number" },
          "review_score": { "type": "number" },
          "image_url": { "type": "string" },
          "reasoning": { "type": "string" }
        }
      }
    }
  },
  "required": ["run_id", "niche", "top_3"]
}
```

## Steps

1. **Gross Margin Recalculation**: Per product calculate exactly:
   ```
   stripe_fees = retail_price × 0.015 + 0.25
   gross_margin = retail_price - purchase_price - stripe_fees
   ```
   Compare against `PRODUCT_MIN_MARGIN` (default €15).

2. **Qualification Filter**: Only products meeting all criteria:
   - `gross_margin >= PRODUCT_MIN_MARGIN` (€15)
   - `delivery_days_nl_be_de <= PRODUCT_MAX_DELIVERY_DAYS` (5 days)
   - `margin_factor >= PRODUCT_MIN_MARGIN_FACTOR` (3.0)

3. **Scoring**: Score qualified products:
   - Gross margin EUR (normalized): 35%
   - Viral score: 35%
   - Delivery time (inverse): 15%
   - Review score: 15%

4. **Selection**: Choose the product with the highest weighted score.

5. **No Qualifying Product**: If no product meets the threshold:
   - Set `selected_product: null`
   - Set `escalation_required: true`
   - Send PIPELINE_EVENT with status "waiting_approval"
   - Describe in `escalation_reason` why each product fails

## Output (Exact JSON Structure)

```json
{
  "run_id": "string",
  "niche": "fitness accessories",
  "selected_product": {
    "product_name": "Resistance Bands Set Premium",
    "zendrop_id": "ZD-EU-12345",
    "purchase_price": 4.50,
    "recommended_retail_price": 24.95,
    "margin_factor": 5.54,
    "gross_margin_eur": 19.83,
    "delivery_days_nl_be_de": 3,
    "viral_score": 85,
    "review_score": 4.2,
    "image_url": "https://cdn.zendrop.com/products/12345.jpg",
    "reasoning": "Excellent margin, short delivery time, very suitable for TikTok demonstration videos."
  },
  "reason": "Product scores highest on weighted criteria: gross margin €19.83, viral score 85, delivery 3 days.",
  "all_scores": [
    { "product_name": "Resistance Bands Set Premium", "weighted_score": 87.5, "qualified": true },
    { "product_name": "Yoga Mat Eco", "weighted_score": 72.3, "qualified": true },
    { "product_name": "Jump Rope Speed", "weighted_score": 65.1, "qualified": false }
  ],
  "escalation_required": false,
  "escalation_reason": null
}
```

## Escalation

All escalations go exclusively to the internal UI via PIPELINE_EVENT events.
Never to external services.
On escalation: send PIPELINE_EVENT with status "waiting_approval" and
reason in the "escalation_reason" field. The UI then shows the approve/reject button.

On approve, the user can manually select a product or accept a lower threshold.
On reject, the pipeline stops for this niche.

## Thresholds (Configurable via .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PRODUCT_MIN_MARGIN` | 15 | Minimum gross margin in EUR after Stripe fees |
| `PRODUCT_MAX_DELIVERY_DAYS` | 5 | Maximum delivery days |
| `PRODUCT_MIN_MARGIN_FACTOR` | 3.0 | Minimum retail/purchase price ratio |

## Model

Uses `deepseek-reasoner` for accurate financial calculations and decision-making.

---

## Specialisaties

### 1. Winrate Benchmark

**Trigger:** Na de kwalificatiefilter (stap 2), vóór de finale scoring.

- Vergelijk elk gekwalificeerd product met historische platformdata:
  - Haal op uit de interne database: gemiddelde winrate per productcategorie (winrate = % van stores dat winstgevend was in de eerste 30 dagen).
  - **Flag als winrate < 2%:** voeg `low_winrate_flag: true` toe en noteer in de reasoning.
  - Benchmarks per categorie (ingebouwde defaults, overschrijfbaar via env):
    | Categorie | Verwachte winrate |
    |-----------|-------------------|
    | Fitness accessoires | 8-12% |
    | Keukenproducten | 6-10% |
    | Baby producten | 10-15% |
    | Tech gadgets | 4-7% |
    | Kleding / mode | 3-5% |
    | Sieraden | 5-8% |
- Als winrate_estimate < 2%: verlaag `weighted_score` met 20 punten.
- Voeg `winrate_estimate_pct` toe aan de product output.

---

### 2. Return Rate Risico

**Trigger:** Bij het beoordelen van elk product, parallel aan de kwalificatiefilter.

- Identificeer producten met verhoogd retourrisico op basis van producteigenschappen:
  | Eigenschappen | Risico | Actie |
  |---------------|--------|-------|
  | Fragiele materialen (glas, keramiek, elektronica) | Hoog | `return_risk: "high"`, flag naar reviewer |
  | Kledingmaten (S/M/L/XL vereist) | Hoog | `return_risk: "high"`, flag + annotatie "maatspecificatie vereist" |
  | Elektronica zonder EU-garantie | Hoog | `return_risk: "high"`, vereis CE-certificering bewijs |
  | Voedselsupplementen | Kritiek | `return_risk: "critical"`, auto-disqualify (GDPR + aansprakelijkheid) |
  | Stevige materialen (rubber, stof, plastic) | Laag | `return_risk: "low"` |
  | Digitale producten | Geen | `return_risk: "none"` |
- Bereken `estimated_return_rate_pct`: hoog_risico = 15-25%, middel = 8-15%, laag = 2-8%.
- Pas de nettomarge-berekening aan: `adjusted_margin = gross_margin × (1 − estimated_return_rate_pct / 100)`.
- Als adjusted_margin < €15 na retourrisico-correctie: disqualificeer het product.

---

### 3. Prijspositionering Check

**Trigger:** Na de kwalificatiefilter, bij alle gekwalificeerde producten.

- Vergelijk de aanbevolen verkoopprijs met marktprijzen op:
  - **bol.com:** zoek op productnaam, noteer gemiddelde prijs.
  - **Amazon.de:** zoek op EAN of productnaam, noteer gemiddelde prijs.
- Bereken `price_positioning`:
  - Onze prijs < 80% van marktgemiddelde → `"budget"` (kans op prijsoorlog, overweeg hogere prijs)
  - Onze prijs 80-120% van marktgemiddelde → `"markt"` (gezond)
  - Onze prijs > 120% van marktgemiddelde → `"premium"` (risico, vereist sterke brand)
- Als `price_positioning = "premium"` én `viral_score < 70`: flag als `pricing_risk: true`.
- Voeg `market_avg_price_eur`, `price_positioning`, en `pricing_risk` toe.

---

### 4. Uniekheid Score

**Trigger:** Bij elk gekwalificeerd product, vóór finale selectie.

- Beoordeel hoe onderscheidend het product is ten opzichte van wat al op de markt is:

  | Uniekheidscriterium | Punten |
  |---------------------|--------|
  | Exclusief EU-warehouse (niet te vinden op AliExpress NL) | +30 |
  | Unieke kleur of uitvoering (niet standaard) | +20 |
  | Bundeloplossing (meerdere producten gecombineerd) | +20 |
  | Probleemoplosser met duidelijke USP | +15 |
  | Customization mogelijk (gravering, kleur, etc.) | +15 |
  | Generiek product zonder differentiatie | 0 |
  | Exact zelfde product bij >10 NL webshops | -20 |

- `uniqueness_score` (0-100) als optelling van bovenstaande punten.
- Als uniqueness_score < 30: voeg `commodity_risk: true` toe als waarschuwing.
- Hoge uniqueness_score (> 70): voeg `differentiation_advantage: true` toe → bonus +5 punten op weighted_score.

---

## Output Format

De product-reviewer retourneert een uitgebreid JSON-object. Naast het bestaande schema worden de volgende velden toegevoegd:

```json
{
  "run_id": "string",
  "niche": "fitness accessories",
  "selected_product": {
    "product_name": "Resistance Bands Set Premium",
    "zendrop_id": "ZD-EU-12345",
    "purchase_price": 4.50,
    "recommended_retail_price": 24.95,
    "margin_factor": 5.54,
    "gross_margin_eur": 19.83,
    "adjusted_margin_eur": 18.24,
    "estimated_return_rate_pct": 7,
    "return_risk": "low",
    "delivery_days_nl_be_de": 3,
    "viral_score": 85,
    "review_score": 4.2,
    "winrate_estimate_pct": 10,
    "low_winrate_flag": false,
    "market_avg_price_eur": 22.50,
    "price_positioning": "markt",
    "pricing_risk": false,
    "uniqueness_score": 65,
    "commodity_risk": false,
    "differentiation_advantage": false,
    "image_url": "https://cdn.zendrop.com/products/12345.jpg",
    "reasoning": "Excellente marge, korte levertijd, hoge winrate-benchmark, lage retourrisico."
  },
  "reason": "Hoogste gewogen score met gecorrigeerde marge €18.24, winrate schatting 10%, uniekheid 65/100.",
  "all_scores": [
    { "product_name": "Resistance Bands Set Premium", "weighted_score": 87.5, "qualified": true, "uniqueness_score": 65, "return_risk": "low" },
    { "product_name": "Yoga Mat Eco", "weighted_score": 72.3, "qualified": true, "uniqueness_score": 40, "return_risk": "low" },
    { "product_name": "Jump Rope Speed", "weighted_score": 45.0, "qualified": false, "disqualification_reason": "adjusted_margin €12.30 < €15 na retourrisico" }
  ],
  "escalation_required": false,
  "escalation_reason": null
}
```
