---
name: store-builder
description: >
  Generates Next.js webshop based on brand profile. Trigger keywords: store
  building, webshop generation, Next.js store, component selection, Tailwind theme,
  Framer Motion, store configuration, generate store, shop setup, deploy store.
version: 1.0.0
model: deepseek-chat
output_format: json
escalation: ui_only
---

# Store Builder

## Purpose

Generates a complete Next.js store configuration based on the brand profile and
product data. Selects components from the component library, applies Tailwind CSS
customization from the brand profile, adds Framer Motion animations, and calls
the platform API to deploy the store on a subdomain.

## Input (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "run_id": { "type": "string" },
    "brand": {
      "type": "object",
      "description": "Complete brand profile from brand-agent",
      "properties": {
        "name": { "type": "string" },
        "slogan": { "type": "string" },
        "colors": { "type": "object" },
        "typography": { "type": "object" },
        "tone_of_voice": { "type": "string" },
        "target_audience": { "type": "object" },
        "usp_list": { "type": "array" },
        "meta_title": { "type": "string" },
        "meta_description": { "type": "string" }
      }
    },
    "product": {
      "type": "object",
      "description": "Selected product from product-reviewer"
    }
  },
  "required": ["run_id", "brand", "product"]
}
```

## Steps

1. **Subdomain Assignment**: Generate subdomain based on brand name:
   `{brandname-lowercase}.{PLATFORM_DOMAIN}`. Remove special characters.

2. **Component Selection**: Choose based on tone_of_voice and product type:

   | Component | Variants | Selection Logic |
   |-----------|----------|-----------------|
   | Hero | 1=fullscreen, 2=split, 3=product-focus, 4=lifestyle, 5=animated | Premium→1/5, Sporty→4/5, Playful→5, Professional→2/3, Lifestyle→1/4 |
   | Productgrid | 1=grid, 2=carousel, 3=single-focus | 1 product→3, 2-4→2, 5+→1 |
   | USP | 1=icons, 2=numbers, 3=checklist, 4=comparison | Choose based on USP count |
   | Footer | 1=minimal, 2=columns, 3=newsletter | Premium→2, Other→1 or 3 |

3. **Tailwind Theme**: Generate complete Tailwind config object from brand
   profile colors and typography:
   ```json
   {
     "colors": { "primary": "...", "secondary": "...", "accent": "..." },
     "fontFamily": { "heading": ["Space Grotesk"], "body": ["Inter"] },
     "borderRadius": { "DEFAULT": "0.5rem" }
   }
   ```

4. **Framer Motion Configuration**: Per-component animation settings:
   - Hero: fade-in + slide-up (duration: 0.8s, delay: 0.2s)
   - Productgrid: stagger children (stagger: 0.1s)
   - USP: slide-in-left (duration: 0.5s, stagger: 0.15s)
   - Social proof: fade-in (duration: 0.6s)
   - CTA buttons: scale on hover (scale: 1.05)

5. **Page Structure**: Define 3 pages:
   - Homepage: Hero → USP → Productgrid → Social proof → Footer
   - Product page: Breadcrumb → Product detail → Reviews → Related → Footer
   - Checkout page: Cart → Stripe checkout embed → Order confirmation

6. **Platform API Call**: POST to `PLATFORM_API_URL/api/internal/generate-store`
   with the complete store configuration. Receive store_id and preview_url back.

## Output (Exact JSON Structure)

```json
{
  "run_id": "string",
  "subdomain": "fitgear.dropship.nl",
  "store_config": {
    "components": {
      "hero_variant": 5,
      "productgrid_variant": 3,
      "usp_variant": 1,
      "footer_variant": 2,
      "social_proof": true,
      "navigation": true
    },
    "tailwind_theme": {
      "colors": { "primary": "#6C63FF", "secondary": "#2D2B55", "accent": "#FF6584" },
      "fontFamily": { "heading": ["Space Grotesk"], "body": ["Inter"] },
      "borderRadius": { "DEFAULT": "0.5rem" }
    },
    "framer_motion": {
      "hero": { "initial": { "opacity": 0, "y": 20 }, "animate": { "opacity": 1, "y": 0 }, "transition": { "duration": 0.8, "delay": 0.2 } },
      "productgrid": { "staggerChildren": 0.1 },
      "usp": { "initial": { "opacity": 0, "x": -20 }, "animate": { "opacity": 1, "x": 0 }, "transition": { "duration": 0.5 } },
      "cta": { "whileHover": { "scale": 1.05 } }
    },
    "pages": {
      "homepage": { "sections": ["hero", "usp", "productgrid", "social_proof", "footer"] },
      "product": { "sections": ["breadcrumb", "product_detail", "reviews", "related", "footer"] },
      "checkout": { "sections": ["cart", "stripe_checkout", "order_confirmation"] }
    }
  },
  "platform_api_response": {
    "store_id": "store_abc123",
    "preview_url": "https://fitgear.dropship.nl"
  },
  "generated_at": "2024-01-15T11:00:00.000Z"
}
```

## Escalation

All escalations go exclusively to the internal UI via PIPELINE_EVENT events.
Never to external services.

On platform API error (4xx/5xx): send PIPELINE_EVENT with status "failed" and
error details. Store-reviewer can send a rewrite instruction; accept maximum 2
rewrites.

## Thresholds (Configurable via .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PLATFORM_API_URL` | http://localhost:3002 | URL of the Next.js platform |
| `STORE_MAX_RETRIES` | 2 | Maximum rewrites by reviewer |

## Model

Uses `deepseek-chat` for fast store configuration generation.

---

## Specialisaties

### 1. CRO Specialist

**Trigger:** Stap 5 (Page Structure) — bij het samenstellen van elke pagina.

- **Hero CTA above-the-fold (verplicht):** De hero-sectie MOET een primaire CTA-knop bevatten die zichtbaar is zonder te scrollen op een 1080p monitor (binnen de eerste 800px). Knoptekst: maximaal 4 woorden, actief werkwoord (bv. "Bestel Nu", "Ontdek de Deal").
- **Social proof binnen 2 scrolls (verplicht):** Social proof elementen (reviews, ratings, klantaantal) moeten binnen 1600px van de bovenkant van de homepage staan. Als de gekozen componentvolgorde dit niet garandeert, verplaats het sociale bewijs naar direct na de hero.
- **Urgentie-element op productpagina (verplicht):** Voeg een urgentie-signaal toe op elke productpagina:
  - Voorraadteller: "Nog maar X op voorraad" (default: random 7-15)
  - Of tijdslimiet banner: "Bestel vóór 22:00 voor morgen bezorgd"
- Voeg `cro_checklist` toe aan de output met de status van elk CRO-element.

---

### 2. Core Web Vitals Optimalisatie

**Trigger:** Stap 3 (Tailwind Theme) en stap 4 (Framer Motion Configuration).

- Zorg dat gegenereerde componentconfiguraties voldoen aan:
  - **LCP < 2.5s:** Hero-afbeelding toevoegen als `<link rel="preload">`. Zet `fetchpriority="high"` op het hero-img-element. Gebruik WebP-formaat.
  - **CLS < 0.1:** Alle afbeeldingen in de config moeten expliciete `width` en `height` attributen hebben om layout shifts te voorkomen.
  - **FID < 100ms:** Framer Motion animations moeten `will-change: transform` bevatten en alle JS-animaties mogen niet blocking zijn (gebruik `requestAnimationFrame`).
- Voeg Framer Motion overrides toe:
  ```json
  { "willChange": "transform", "layout": true }
  ```
  aan alle animated components.
- Noteer `cwv_targets` in de output als verificatie.

---

### 3. Mobile-First Enforcement

**Trigger:** Stap 3 (Tailwind Theme) — bij het genereren van alle layout-klassen.

- Alle Tailwind CSS klassen in de store config MOETEN mobile-first schrijven:
  - Begin met base styles (geen prefix = 375px viewport).
  - Voeg `sm:`, `md:`, `lg:` breakpoints toe voor grotere schermen.
  - Voorbeeld: `className="text-sm sm:text-base lg:text-lg"`.
- **Minimum viewport 375px** (iPhone SE-breedte) als designbasis.
- Controleer in de gegenereerde page structure:
  - Navigatie: hamburger menu op mobile (< `sm:`).
  - Product grid: 1 kolom op mobile, 2 op `sm:`, 3 op `lg:`.
  - Buttons: `min-height: 44px` (Apple HIG aanraakdoelgrootte).
- Voeg `mobile_first_verified: true` toe aan de output.

---

### 4. SEO Structured Data

**Trigger:** Stap 5 (Page Structure) — bij het definiëren van elke pagina.

- Genereer automatisch de volgende JSON-LD blokken per pagina:

  **Homepage:**
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "{brand.name}",
    "url": "https://{subdomain}",
    "logo": "https://{subdomain}/logo.svg",
    "sameAs": []
  }
  ```

  **Productpagina:**
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "{product_name}",
    "image": "{image_url}",
    "description": "{product_description}",
    "offers": {
      "@type": "Offer",
      "price": "{retail_price}",
      "priceCurrency": "EUR",
      "availability": "https://schema.org/InStock",
      "shippingDetails": { "@type": "OfferShippingDetails", "deliveryTime": { "@type": "ShippingDeliveryTime", "businessDays": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 5 } } }
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "{review_score}",
      "reviewCount": "{review_count}"
    }
  }
  ```

  **FAQPage** (als er FAQ-sectie is):
  ```json
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [{ "@type": "Question", "name": "{vraag}", "acceptedAnswer": { "@type": "Answer", "text": "{antwoord}" } }]
  }
  ```

  **BreadcrumbList** (op product- en categoriepagina's):
  ```json
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://{subdomain}" },
      { "@type": "ListItem", "position": 2, "name": "{niche}", "item": "https://{subdomain}/categorie" },
      { "@type": "ListItem", "position": 3, "name": "{product_name}", "item": "https://{subdomain}/product/{slug}" }
    ]
  }
  ```

- Sla alle JSON-LD blokken op in `structured_data` per pagina.

---

### 5. Interne Linkstructuur

**Trigger:** Stap 5 (Page Structure).

- Definieer de interne linkstructuur expliciet:
  - Homepagina → categoriepagina (via navigatie + hero CTA)
  - Categoriepagina → individuele productpagina's (via productgrid)
  - Productpagina → gerelateerde producten (via "related" sectie)
  - Productpagina → categoriepagina (via breadcrumb)
- Voeg `internal_links` toe per pagina in de output, met `from`, `to`, en `anchor_text`.
- Zorg dat elke pagina minimaal 2 interne links heeft.

---

### 6. Image Optimization Pipeline

**Trigger:** Bij elk image_url dat voorkomt in de store config (product afbeeldingen, hero, USP iconen).

- Genereer een `image_optimization_config` per afbeelding:
  ```json
  {
    "src": "{original_url}",
    "format": "webp",
    "lazy": true,
    "fetchpriority": "auto",
    "sizes": "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
    "srcset": [
      { "width": 400, "url": "{url}?w=400&fm=webp" },
      { "width": 800, "url": "{url}?w=800&fm=webp" },
      { "width": 1200, "url": "{url}?w=1200&fm=webp" }
    ]
  }
  ```
- **Hero afbeelding uitzondering:** `lazy: false`, `fetchpriority: "high"` (LCP optimalisatie).
- Voeg `alt_text` toe op basis van `product_name` + brand naam.

---

## Output Format

De store-builder retourneert een uitgebreid JSON-object. Naast het bestaande schema worden de volgende velden toegevoegd:

```json
{
  "run_id": "string",
  "subdomain": "fitgear.dropship.nl",
  "store_config": {
    "components": { "hero_variant": 5, "productgrid_variant": 3, "usp_variant": 1, "footer_variant": 2, "social_proof": true, "navigation": true },
    "tailwind_theme": { "colors": { "primary": "#FF6B00" }, "fontFamily": { "heading": ["Space Grotesk"] } },
    "framer_motion": { "hero": { "willChange": "transform", "layout": true } },
    "mobile_first_verified": true,
    "cwv_targets": { "lcp_target_ms": 2500, "cls_target": 0.1, "fid_target_ms": 100 },
    "cro_checklist": {
      "hero_cta_above_fold": true,
      "social_proof_within_2_scrolls": true,
      "urgency_element_on_product_page": true
    },
    "pages": {
      "homepage": {
        "sections": ["hero", "usp", "productgrid", "social_proof", "footer"],
        "internal_links": [
          { "from": "hero", "to": "/categorie/fitness", "anchor_text": "Bekijk alle producten" }
        ],
        "structured_data": { "organization": {} }
      },
      "product": {
        "sections": ["breadcrumb", "product_detail", "reviews", "related", "footer"],
        "structured_data": { "product": {}, "breadcrumb": {}, "faq": {} },
        "internal_links": [
          { "from": "breadcrumb", "to": "/categorie", "anchor_text": "Fitness accessoires" },
          { "from": "related", "to": "/product/item2", "anchor_text": "Klanten kochten ook" }
        ]
      },
      "checkout": { "sections": ["cart", "stripe_checkout", "order_confirmation"] }
    },
    "image_optimization": [
      {
        "src": "https://cdn.zendrop.com/products/12345.jpg",
        "format": "webp",
        "lazy": false,
        "fetchpriority": "high",
        "alt_text": "Resistance Bands Set Premium - FitGear"
      }
    ]
  },
  "platform_api_response": { "store_id": "store_abc123", "preview_url": "https://fitgear.dropship.nl" },
  "generated_at": "2026-04-02T11:00:00.000Z"
}
```

## Design Quality Standards (taste-skill integration)

The store-builder must produce brands that feel **premium, specific, and trustworthy** — not generic AI output.
These rules override vague defaults every time. Derived from the taste-skill anti-slop framework.

---

### DESIGN_VARIANCE — Deterministic layout via niche hash

The `selectLayout(niche)` function maps each niche to a layout index (0–4) using character sum modulo 5.
This ensures:
- **Same niche always produces the same visual identity** — reproducible, not random
- **Different niches look genuinely distinct** — no one-size-fits-all template
- Layout selection is invisible to users but encodes brand personality into the page structure

Layouts: 0=NOIR (black editorial), 1=BLANC (Scandinavian luxury), 2=BOLT (high-energy sport),
3=DUSK (warm organic lifestyle), 4=GRID (dark tech data-driven)

Never override this with a random choice — the hash is the source of truth.

---

### VISUAL_DENSITY — Niche-matched information density

- **Lifestyle niches** (beauty, home, wellness, food): Open layout. Generous whitespace. Single hero product. Emotion-first.
- **Tech niches** (gadgets, electronics, devices): Dense info. Stats bar. Specs visible. Grid layout. Data earns trust.
- **Sport/fitness**: High energy, bold type, urgency signals (countdown, stock counter), minimal copy.
- **Fashion/accessories**: Editorial grid, large images, minimal text, serif/geometric pairing.

Match density to how the buyer makes decisions — tech buyers compare specs, lifestyle buyers feel first.

---

### COLOR_HARMONY — Deliberate palette, never defaults

The brand-agent MUST choose a palette that fits the niche. **Never default to `#7c3aed` (generic purple) or `#f59e0b` (generic amber).**

Niche → deliberate palette guide:
- Fitness → electric blue `#0066ff`, signal red `#e63946`, or forest green `#2d6a4f`
- Beauty → deep rose `#c9184a`, dusty mauve `#9b5de5`, or champagne `#e9c46a`
- Tech → slate navy `#1e3a5f`, electric cyan `#00b4d8`, or graphite `#2d3436`
- Food/drink → espresso `#3d1e00`, citrus `#f4a261`, or sage `#6b9e7a`
- Home/decor → terracotta `#c77b58`, linen `#f2e9d8`, or sage `#87a989`

Always provide `primary`, `secondary`, and `accent`. The secondary sets the text/background relationship; the accent drives CTAs and badges.

---

### MOTION_INTENSITY — Functional animation only

Animations must serve a purpose. No gratuitous movement.

**Allowed:**
- Product image scale on hover (transform: scale 1.04, 0.3s ease) — signals interactivity
- CTA button subtle lift (translateY -1px, 0.15s) — confirms clickability
- Countdown timer number flip — creates urgency

**Forbidden:**
- Page-load entrance animations that delay content visibility (hurts LCP)
- Parallax scrolling on product images — causes CLS
- Auto-playing carousels — kills user trust
- Spinning loaders or skeleton shimmer beyond 300ms

All CSS transitions must use `will-change: transform` and be hardware-accelerated.

---

### TYPOGRAPHY — Font pairing reflects brand personality

Font pairings are deterministically assigned via the same niche hash as layouts. Each pair has a personality:

| Index | Name | Heading | Body | Personality |
|-------|------|---------|------|-------------|
| 0 | Studio | Space Grotesk | DM Sans | Geometric, bold, modern (tech/sport) |
| 1 | Maison | Playfair Display | Lato | Editorial, luxury, serif (beauty/fashion) |
| 2 | Volt | Syne | Outfit | High energy, wide tracking (sport/streetwear) |
| 3 | Pure | DM Serif Display | DM Sans | Minimal, Scandinavian (home/wellness) |
| 4 | Origin | Fraunces | Figtree | Warm, organic, lifestyle (food/nature) |

Never mix two serif fonts. Never use system-ui as a heading font. Font pairing must reinforce brand personality — a sport brand should never get a luxury serif.

---

### Brand Identity Rules

**Brand name**: Never generic (no "ShopX", "BestStore", "QuickBuy"). Must reflect the niche.
Good: `BlendJet`, `GripKick`, `FloatHome` — Bad: `FitnessShop`, `MyStore`, `BestProducts`

**Slogan**: Specific benefit + emotional hook. Max 6 words. No filler words ("quality", "premium", "best").
Good: `"Blend anywhere. Fuel your day."` — Bad: `"Premium quality products for you."`

**Primary color** must be intentional. Provide `colors.primary`, `colors.secondary`, `colors.accent` in the output.

### Copy Rules

**Hero headline**: The brand name. Short. Punchy.
**Hero subheadline (slogan)**: Why someone should care in one breath. No adjectives without proof.
**USP titles**: Max 3-4 words. Action-oriented.
**CTA text**: Not "Klik hier" or "Meer info". Verb + benefit: `"Ontdek de collectie"`, `"Shop nu"`, `"Probeer vandaag"`.

### What to Avoid

- Generic emoji icons (🚚, ⭐, 💪) — the scaffold replaces these with SVG
- Lorem ipsum or placeholder copy
- Overly long slogans (>8 words)
- Duplicate words in brand name and slogan
- Colors that clash with the product photos
- The word "premium", "kwaliteit", "beste" without a specific reason
- Page-entry animations that block LCP
- Two serif fonts in the same design
- Random layout assignment — always use the niche hash
