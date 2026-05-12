---
name: store-builder
description: >
  Generates brand identity and content brief for a dropshipping store.
  Trigger keywords: store building, webshop generation, brand brief, store setup,
  generate store, shop setup, content brief.
version: 2.0.0
model: deepseek-chat
output_format: json
escalation: ui_only
---

# Store Builder

## Purpose

Generates a brand identity and content brief for a dropshipping store.
The actual page is built from a deterministic template (no code generation).
Your job is to provide the **brand data** the template needs to look great.

## Input

```json
{
  "run_id": "string",
  "niche": "string",
  "previous_agent_output": {
    "brand": { "name": "string", "slogan": "string", "colors": { "primary": "string", "secondary": "string", "accent": "string" } },
    "products": [{ "id": "string", "title": "string", "price": 0, "image": "", "description": "" }]
  }
}
```

## Output (exact JSON structure required)

```json
{
  "brand_name": "string",
  "slogan": "string",
  "subdomain": "string",
  "hero_headline": "string",
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex"
  },
  "usps": [
    { "title": "string", "desc": "string" },
    { "title": "string", "desc": "string" },
    { "title": "string", "desc": "string" }
  ],
  "products": [
    {
      "id": "string",
      "title": "string",
      "price": 0,
      "compareAtPrice": 0,
      "image": "string",
      "badge": "string",
      "description": "string"
    }
  ]
}
```

## Steps

1. **Brand name**: Take from `previous_agent_output.brand.name`. If missing, create one from the niche. Never generic ("ShopX", "BestStore"). Must be specific and memorable.

2. **Slogan**: Take from `previous_agent_output.brand.slogan`. Max 6 words. Specific benefit, no filler words ("quality", "premium", "best").

3. **Hero headline**: The brand name or a punchy variation. Max 4 words.

4. **Subdomain**: `{brand-name-lowercase}` — only a-z, 0-9, hyphens. No TLD.

5. **Colors**: Take from `previous_agent_output.brand.colors`. If missing, pick deliberately based on niche:
   - Fitness → electric blue `#0066ff`, signal red `#e63946`, or forest green `#2d6a4f`
   - Beauty → deep rose `#c9184a`, dusty mauve `#9b5de5`, or champagne `#e9c46a`
   - Tech → slate navy `#1e3a5f`, electric cyan `#00b4d8`, or graphite `#2d3436`
   - Food/drink → espresso `#3d1e00`, citrus `#f4a261`, or sage `#6b9e7a`
   - Home/decor → terracotta `#c77b58`, linen `#f2e9d8`, or sage `#87a989`
   Never default to generic purple `#7c3aed`.

6. **USPs**: 3 selling points tailored to the niche. Each title max 4 words, each desc 1 sentence.
   - Fitness example: `{ "title": "30-daagse garantie", "desc": "Geen resultaat? Volledig terugbetaald." }`
   - Tech example: `{ "title": "2 jaar garantie", "desc": "Volledige fabrieksgarantie inbegrepen." }`

7. **Products**: Pass through products from `previous_agent_output.products` (max 3). Add `badge` ("Bestseller", "Nieuw", "Sale") where appropriate. Keep original `id`, `price`, `image`.

## Rules

- Return ONLY the JSON object. No markdown, no explanation.
- `brand_name`, `slogan`, `subdomain`, `hero_headline`, `colors`, `usps`, `products` are all required.
- `colors.primary`, `colors.secondary`, `colors.accent` must all be hex strings.
- `usps` must have exactly 3 items.
- `products` must have 1–3 items.
- Never invent products or prices — use only what came from previous_agent_output.

## Model

Uses `deepseek-chat` for fast brand brief generation. No code generation involved.
