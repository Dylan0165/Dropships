---
name: product-agent
description: >
  Searches products via Zendrop EU for approved niches. Trigger keywords:
  product search, Zendrop catalog, product sourcing, product scoring, dropship
  products, supplier search, product margin, delivery time check, viral product.
version: 1.0.0
model: deepseek-chat
output_format: json
escalation: ui_only
---

# Product Agent

## Purpose

Searches the Zendrop EU catalog for products within approved niches. Scores each
product on margin (minimum 3x purchase price), delivery time to NL/BE/DE (max 5
days), and virality potential. Returns a top 3 products per niche.

## Input (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "run_id": { "type": "string", "description": "Unique pipeline run identifier" },
    "niche": { "type": "string", "description": "Approved niche name" }
  },
  "required": ["run_id", "niche"]
}
```

## Steps

1. **Zendrop EU Catalog Search**: Search products in the Zendrop EU catalog
   matching the niche. Filter by:
   - Available for EU shipping (NL, BE, DE primary)
   - Delivery time ≤ `PRODUCT_MAX_DELIVERY_DAYS` (default 5)
   - Active and in stock

2. **Margin Calculation**: Per product:
   - Calculate `margin_factor` = recommended_retail_price / purchase_price
   - Filter: margin_factor ≥ `PRODUCT_MIN_MARGIN_FACTOR` (default 3.0)
   - Calculate `gross_margin_eur` = retail_price - purchase_price - Stripe fees
     (retail_price × 0.015 + €0.25)

3. **Viral Score Calculation** (0-100):
   - Video-worthy product (suitable for UGC content): +30
   - Visually attractive (instagrammable): +25
   - Problem-solving (clear USP): +20
   - Impulse buy price point (< €40): +15
   - Unique/novel (not widely available from AliExpress retailers): +10

4. **Review Score**: Fetch Zendrop review score (0-5 stars).

5. **Ranking**: Sort by weighted score:
   - Margin factor: 30%
   - Delivery time (inverse, shorter = better): 20%
   - Viral score: 35%
   - Review score: 15%

6. **Top 3 Selection**: Return the 3 highest scoring products.

## Output (Exact JSON Structure)

```json
{
  "run_id": "string",
  "niche": "fitness accessories",
  "top_3": [
    {
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
    }
  ]
}
```

## Escalation

All escalations go exclusively to the internal UI via PIPELINE_EVENT events.
Never to external services.

This agent normally has no escalation. If fewer than 3 qualifying products are
found, report this in the output but continue with what is available. Output goes
directly to product-reviewer.

## Thresholds (Configurable via .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PRODUCT_MIN_MARGIN_FACTOR` | 3.0 | Minimum retail/purchase price ratio |
| `PRODUCT_MAX_DELIVERY_DAYS` | 5 | Maximum delivery days to NL/BE/DE |
| `PRODUCT_MIN_REVIEW` | 3.5 | Minimum Zendrop review score |
| `PRODUCT_TOP_N` | 3 | Number of products to return |

## Model

Uses `deepseek-chat` for fast product search and scoring analysis.

---

## Specialisaties

### 1. Margin Calculator

**Trigger:** Stap 2 (Margin Calculation) voor elk gevonden product.

- Bereken exacte brutomarge na alle kosten:
  ```
  stripe_fee      = retail_price × 0.015 + 0.25
  gross_margin    = retail_price − purchase_price − stripe_fee
  ```
- **Hard limit:** Als gross_margin < €15 → product wordt **onmiddellijk gedisqualificeerd**, ongeacht andere scores.
- Bereken ook de aanbevolen verkoopprijs als die nog niet beschikbaar is:
  ```
  min_retail_price = (purchase_price + 0.25 + 15) / (1 − 0.015)
  ```
  Geef `recommended_min_price` mee in de output zodat de brand-agent ermee rekening houdt.
- Voeg `margin_health` toe: `"excellent"` (> €30), `"good"` (€20-€30), `"acceptable"` (€15-€20), `"rejected"` (< €15).

**Voorbeeld:**
```json
{ "purchase_price": 4.50, "retail_price": 24.95, "stripe_fee": 0.62, "gross_margin": 19.83, "margin_health": "good", "recommended_min_price": 20.07 }
```

---

### 2. Zendrop EU Catalog Filtering

**Trigger:** Stap 1 (Zendrop EU Catalog Search) — vóór scoring.

- **Harde filters** die een product direct uitsluiten:
  - Warehouse locatie ≠ EU → skip.
  - Levertijd NL > 5 dagen → skip (gebruik `PRODUCT_MAX_DELIVERY_DAYS`).
  - Voorraadstatus = "out_of_stock" of "discontinued" → skip.
  - Minimale voorraad < 50 units → flag als `low_stock_warning: true` maar sluit niet uit.
- Verifieer specifiek voor NL/BE/DE:
  - Controleer of het product CE-gecertificeerd is (verplicht voor elektronica en speelgoed in EU).
  - Flag producten zonder CE-markering als `eu_compliance_flag: true`.
- Noteer `warehouse_location` (bv. "NL", "DE", "PL") in de output; NL/BE warehouse = +5 punten op leveringstijdscore.

---

### 3. Product Image Quality Check

**Trigger:** Na het ophalen van product data, vóór scoring (stap 2).

- Controleer elke product-afbeelding op:
  - **Minimale resolutie:** 800×800 px. Indien kleiner → `image_quality: "poor"`, trek 10 punten van viral_score af.
  - **Witte achtergrond:** controleer of de dominante kleur van de achtergrond ≥ 90% wit/lichtgrijs (RGB > 230,230,230). Zo niet → `white_bg: false`.
  - **Meerdere varianten:** minimaal 3 afbeeldingen aanwezig → `multi_image: true`. Minder dan 3 → trek 5 punten van viral_score af.
- Voeg `image_score` (0-100) toe aan de output:
  - ≥ 800px: +40
  - white_bg: +30
  - multi_image (3+): +30
- Producten met image_score < 40 krijgen `image_quality_flag: true` als waarschuwing naar product-reviewer.

---

### 4. Cross-Sell Bundler

**Trigger:** Na selectie van een hoofdproduct (top 3 bepaald), vóór output generatie.

- Zoek per geselecteerd hoofdproduct 2-3 complementaire producten in de Zendrop EU catalogus:
  - Zelfde niche, andere productcategorie.
  - Purchase price < 50% van het hoofdproduct (impuls-vriendelijk).
  - Levertijd ≤ hoofdproduct levertijd + 1 dag.
- Gebruik een eenvoudige cross-sell logica matrix:
  | Hoofdproduct categorie | Cross-sell suggesties |
  |------------------------|-----------------------|
  | Fitness accessoires    | Sportdrank shaker, resistance clips, yoga blok |
  | Baby producten         | Bijtring, slab, borstpomp opberghoes |
  | Tech gadgets           | Beschermhoes, USB-hub, reinigingsdoekjes |
  | Outdoor                | Draagbare lader, multitool, heuptas |
  | Beauty                 | Opbergtas, reinigingsdoekjes, applicator |
- Geef per bundle een `bundle_margin_eur` = som van marges van alle producten in de bundle.
- Output in `cross_sell_bundle` array.

---

## Output Format

De product-agent retourneert een uitgebreid JSON-object. Naast het bestaande schema worden de volgende velden toegevoegd:

```json
{
  "run_id": "string",
  "niche": "fitness accessories",
  "top_3": [
    {
      "product_name": "Resistance Bands Set Premium",
      "zendrop_id": "ZD-EU-12345",
      "purchase_price": 4.50,
      "recommended_retail_price": 24.95,
      "recommended_min_price": 20.07,
      "margin_factor": 5.54,
      "gross_margin_eur": 19.83,
      "margin_health": "good",
      "delivery_days_nl_be_de": 3,
      "warehouse_location": "NL",
      "viral_score": 85,
      "review_score": 4.2,
      "image_url": "https://cdn.zendrop.com/products/12345.jpg",
      "image_score": 100,
      "image_quality_flag": false,
      "eu_compliance_flag": false,
      "low_stock_warning": false,
      "reasoning": "string",
      "cross_sell_bundle": [
        {
          "product_name": "Sport Shaker Bottle",
          "zendrop_id": "ZD-EU-67890",
          "purchase_price": 2.10,
          "recommended_retail_price": 9.95,
          "gross_margin_eur": 7.70
        }
      ],
      "bundle_margin_eur": 27.53
    }
  ]
}
```
