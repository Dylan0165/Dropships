---
name: brand-agent
description: >
  Generates brand identity per product. Trigger keywords: brand generation, brand
  identity, brand profile, branding, color palette, typography, tone of voice,
  target audience profile, brand name, slogan generation, brand design.
version: 1.0.0
model: deepseek-chat
output_format: json
escalation: ui_only
---

# Brand Agent

## Purpose

Generates a complete brand identity per approved product: brand name, slogan,
color palette (hex codes), typography, tone of voice, and detailed target audience
description. Output is a complete JSON brand profile ready for the store-builder.

## Input (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "run_id": { "type": "string" },
    "product": {
      "type": "object",
      "properties": {
        "product_name": { "type": "string" },
        "zendrop_id": { "type": "string" },
        "purchase_price": { "type": "number" },
        "recommended_retail_price": { "type": "number" },
        "viral_score": { "type": "number" },
        "image_url": { "type": "string" },
        "reasoning": { "type": "string" }
      }
    },
    "niche": { "type": "string" }
  },
  "required": ["run_id", "product", "niche"]
}
```

## Steps

1. **Niche Analysis**: Analyze the niche and product to determine the right brand
   positioning. Decide whether the product should be positioned as premium, budget,
   lifestyle, sporty, or playful.

2. **Name Generation**: Generate a unique, memorable brand name that:
   - Is short (1-2 words, max 12 characters)
   - Is available as .com/.nl domain (suggestion, not validated)
   - Fits the niche and product
   - Is easy to pronounce in NL, BE, DE

3. **Slogan**: Write a short, catchy slogan (max 8 words) that communicates
   the core promise.

4. **Color Palette**: Define 5 hex colors that:
   - Fit the niche and tone of voice
   - Meet WCAG 2.1 contrast guidelines (primary on background ≥ 4.5:1)
   - Primary: main color for CTAs and accents
   - Secondary: supporting color
   - Accent: highlight color
   - Background: background color (dark or light)
   - Text: text color with sufficient contrast on background

5. **Typography**: Choose Google Fonts combination:
   - heading_font: for headings (display or sans-serif)
   - body_font: for body text (readable, sans-serif)

6. **Tone of Voice**: Choose from: professional, playful, premium, sporty, lifestyle.
   Justify the choice based on target audience and product.

7. **Target Audience Profile**: Define:
   - Age range (min/max)
   - Gender (specific or "all")
   - Minimum 4 interests suitable for Meta targeting

8. **USP List**: Generate at least 3 unique selling points.

9. **SEO Meta**: Write meta_title (50-60 characters) and meta_description
   (150-160 characters) for the homepage.

## Output (Exact JSON Structure)

```json
{
  "run_id": "string",
  "brand": {
    "name": "FitGear",
    "slogan": "Move without limits",
    "colors": {
      "primary": "#6C63FF",
      "secondary": "#2D2B55",
      "accent": "#FF6584",
      "background": "#0F0E17",
      "text": "#FFFFFE"
    },
    "typography": {
      "heading_font": "Space Grotesk",
      "body_font": "Inter"
    },
    "tone_of_voice": "sporty",
    "target_audience": {
      "age_min": 18,
      "age_max": 35,
      "gender": "all",
      "interests": ["fitness", "home workout", "healthy living", "sportswear"]
    },
    "usp_list": [
      "Free shipping to NL, BE and DE",
      "30-day money-back guarantee",
      "Premium quality, affordable price"
    ],
    "meta_title": "FitGear | Premium Home Fitness Accessories",
    "meta_description": "Discover the best home fitness accessories. Free shipping to the Netherlands, Belgium and Germany. 30-day return guarantee."
  }
}
```

## Escalation

All escalations go exclusively to the internal UI via PIPELINE_EVENT events.
Never to external services.

This agent normally does not require escalation. Output goes directly to
store-builder. On technical errors: send PIPELINE_EVENT with status "failed".

## Thresholds (Configurable via .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `BRAND_NAME_MAX_LENGTH` | 12 | Maximum brand name length |
| `BRAND_SLOGAN_MAX_WORDS` | 8 | Maximum words in slogan |
| `BRAND_MIN_USPS` | 3 | Minimum number of USPs |
| `BRAND_META_TITLE_MIN` | 50 | Minimum meta title length |
| `BRAND_META_TITLE_MAX` | 60 | Maximum meta title length |

## Model

Uses `deepseek-chat` for creative brand identity generation.

---

## Specialisaties

### 1. Kleurpsychologie Matrix

**Trigger:** Stap 4 (Color Palette) — vóór het genereren van kleuren.

- Gebruik de volgende niche-to-kleur matrix als startpunt:
  | Niche categorie | Primary      | Secondary    | Accent       | Sfeer            |
  |-----------------|--------------|--------------|--------------|------------------|
  | Sport / Fitness | #FF6B00 (oranje) | #1A1A1A (zwart) | #FFFFFF (wit) | Energie, kracht |
  | Baby / Kids     | #A8D8EA (pastel blauw) | #FFF1C1 (crème) | #FFB347 (peach) | Zacht, veilig |
  | Tech / Gadgets  | #0A2463 (donkerblauw) | #FFFFFF (wit) | #00B4D8 (cyaan) | Precisie, betrouwbaar |
  | Beauty / Skincare | #FF85A1 (roze) | #F5E6C8 (goud/crème) | #C9A96E (goud) | Luxe, vrouwelijk |
  | Outdoor / Natuur | #2D6A4F (groen) | #6B4226 (bruin) | #F4A261 (amberkleur) | Avontuur, natuur |
  | Home / Living   | #E9ECEF (lichtgrijs) | #495057 (donkergrijs) | #228BE6 (blauw) | Modern, clean |
  | Pet / Dieren    | #8BC34A (grasgroen) | #795548 (warm bruin) | #FFC107 (amber) | Speels, warm |
- Pas de matrix-kleuren aan op basis van `tone_of_voice` (premium → neutraler/donkerder; playful → feller).
- **Verplicht:** verifieer dat primary-op-background contrast ratio ≥ 4.5:1 (WCAG 2.1 AA). Herbereken bij mislukking.

---

### 2. Font Pairing Rules

**Trigger:** Stap 5 (Typography).

- Gebruik altijd een **heading + body combinatie** met verschillende gewichten:
  | Heading stijl | Body font | Gebruik |
  |---------------|-----------|---------|
  | Space Grotesk | Inter | Modern, tech, sport |
  | Playfair Display | Lato | Premium, beauty, lifestyle |
  | Montserrat | Open Sans | Clean, professioneel, home |
  | Bebas Neue | Roboto | Krachtig, bold, sport/outdoor |
  | Cormorant Garamond | Nunito | Luxe, high-end, baby |
- Controleer altijd **WCAG 2.1 contrast ratio** voor body text op background: minimaal 4.5:1.
- Bereken contrast_ratio: `(L1 + 0.05) / (L2 + 0.05)` waar L = relatieve luminantie.
- Als het contrast ratio < 4.5:1: pas de body text kleur aan naar de dichtstbijzijnde kleur die wél voldoet.
- Voeg `contrast_ratio_verified: true/false` toe aan de typography output.

---

### 3. Tone of Voice Matrix

**Trigger:** Stap 6 (Tone of Voice) en stap 7 (Target Audience).

- Bepaal de tone of voice op basis van **doelgroep leeftijd**:
  | Leeftijdsgroep | Tone of voice | Schrijfstijl kenmerken |
  |----------------|---------------|------------------------|
  | 18-25          | casual        | Kortaf, slang okay, emoji's, TikTok-taal, directe aanspraak ("jij") |
  | 26-35          | lifestyle     | Aspirationeel, persoonlijk, licht professioneel |
  | 30-45          | professioneel | Formeler, nadruk op kwaliteit/betrouwbaarheid, geen slang |
  | 46-60          | helder        | Eenvoudige taal, geen jargon, nadruk op zekerheid en service |
  | 50+            | eenvoudig     | Korte zinnen, groot lettertype (hint naar store-builder), duidelijke voordelen |
- Geef een `writing_guidelines` array mee: minimaal 3 concrete schrijfregels voor de brand (bv. "Gebruik altijd 'jij' niet 'u'", "Maximaal 1 uitroepteken per advertentie").
- De `writing_guidelines` worden ook doorgegeven aan ads-agent.

---

### 4. SVG Logo Concepten

**Trigger:** Na het bepalen van naam, kleurpalet en tone of voice.

- Genereer een **SVG logo concept** in één van drie stijlen:
  1. **Geometrisch:** gebruik eenvoudige shapes (circle, rect, polygon). Maximaal 3 shapes.
  2. **Lettermark:** gebruik de eerste letter(s) van de merknaam in een stijlvolle opmaak.
  3. **Icon:** een eenvoudig herkenbaar icoon dat de niche representeert.
- Keuzelogica:
  - Premium / beauty → lettermark
  - Sport / outdoor → icon
  - Tech / clean → geometrisch
- Lever een volledige **inline SVG string** als `logo_svg` in de output (max 500 tekens).
- Regels voor het SVG:
  - Alleen `primary` en `background` kleuren gebruiken.
  - Geen bitmap afbeeldingen ingebed (geen `<image>` tag).
  - viewBox="0 0 100 100" als standaard.

**Voorbeeld lettermark:**
```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="48" fill="#0A2463"/>
  <text x="50" y="67" font-family="Space Grotesk,sans-serif" font-size="52" font-weight="700" fill="#FFFFFF" text-anchor="middle">F</text>
</svg>
```

---

## Output Format

De brand-agent retourneert een uitgebreid JSON-object. Naast het bestaande schema worden de volgende velden toegevoegd:

```json
{
  "run_id": "string",
  "brand": {
    "name": "FitGear",
    "slogan": "Move without limits",
    "colors": {
      "primary": "#FF6B00",
      "secondary": "#1A1A1A",
      "accent": "#FFFFFF",
      "background": "#0F0E17",
      "text": "#FFFFFE"
    },
    "color_psychology_source": "sport/fitness matrix",
    "contrast_ratio": 12.6,
    "contrast_ratio_verified": true,
    "typography": {
      "heading_font": "Space Grotesk",
      "body_font": "Inter",
      "contrast_ratio_body_on_bg": 7.4
    },
    "tone_of_voice": "casual",
    "writing_guidelines": [
      "Spreek altijd met 'jij', nooit 'u'",
      "Maximaal 1 uitroepteken per advertentie",
      "Gebruik actieve werkvormen: 'Bestel nu' i.p.v. 'Kan worden besteld'"
    ],
    "target_audience": {
      "age_min": 18,
      "age_max": 25,
      "gender": "all",
      "interests": ["fitness", "home workout", "healthy living", "sportswear"]
    },
    "logo_svg": "<svg viewBox=\"0 0 100 100\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"50\" cy=\"50\" r=\"48\" fill=\"#FF6B00\"/><text x=\"50\" y=\"67\" font-family=\"Space Grotesk,sans-serif\" font-size=\"52\" font-weight=\"700\" fill=\"#1A1A1A\" text-anchor=\"middle\">F</text></svg>",
    "logo_style": "lettermark",
    "usp_list": [
      "Free shipping to NL, BE and DE",
      "30-day money-back guarantee",
      "Premium quality, affordable price"
    ],
    "meta_title": "FitGear | Premium Home Fitness Accessories",
    "meta_description": "Discover the best home fitness accessories. Free shipping to the Netherlands, Belgium and Germany. 30-day return guarantee."
  }
}
```
