# Fase 1 — verificatie-output

```
═══ 1. CATALOGUS ═══
totaal: 106 componenten
  badges       8
  content      12
  cta          9
  footer       9
  form         8
  gallery      8
  hero         12
  nav          9
  products     10
  testimonials 9
  topbar       12
✓ elke categorie heeft minstens 8 varianten

═══ 2. EMOJI-FILTER ═══
input : Boost your workout 🚀✨ — the ultimate gear 🔥 you need 💯
output: Boost your workout — the ultimate gear you need
bevat nog emoji: false
diep object → {"hero":"Fast delivery","usps":[{"title":"Quality","desc":"Real value"}],"price":19.95}
rapport: 3 velden, geblokkeerd: 🚀 ✅ 💯 , paden: hero, usps[0].title, usps[0].desc
legitieme tekens blijven staan: "Only EUR 19.95 — 100% cotton, ©2026"

═══ 3. DRIE STORES GENEREREN ═══
   Trailform: [assemble] 9 componenten (derived, thema sport, beweging editorial-fade): topbar.bold-statement[bold], nav.split-links[editorial], hero.editorial[editorial], badges.shipping-map[editorial], products.editorial-list[editorial], testimonials.stat-proof[bold], content.why-us-grid[minimal], content.faq-accordion[editorial], footer.sitemap-columns[minimal]
   Mealkind: [assemble] 9 componenten (derived, thema kitchen, beweging playful-pop): topbar.trust-mini[bold], nav.sticky-solid-on-scroll[bold], hero.split-left[bold], badges.icon-grid[bold], content.why-us-grid[bold], products.grid-3[bold], testimonials.timeline-list[minimal], gallery.scroll-strip[bold], footer.big-wordmark[bold]
   Nightwell: [assemble] 10 componenten (derived, thema wellness, beweging calm-glide): topbar.calm-line[editorial], nav.split-links[editorial], hero.split-left[editorial], badges.icon-grid[minimal], content.story-split[editorial], products.editorial-list[editorial], content.values-grid[editorial], testimonials.timeline-list[editorial], content.tabs-info[minimal], footer.sitemap-columns[minimal]

═══ 4. COMBINATIE-HASHES (moeten uniek zijn) ═══
Trailform  hash=35d050a4aaac74e5
           hero=hero.editorial  topbar=topbar.bold-statement  motion=editorial-fade
           fonts='Cormorant Garamond', Georgia, serif/'Jost', system-ui, sans-serif  palette=#fbfafc-#623b72-#6eba50-#3b313f
           layout=products>reviews>usps  (rotaties: geen)
Mealkind   hash=49f7c44aab066a14
           hero=hero.split-left  topbar=topbar.trust-mini  motion=playful-pop
           fonts='Archivo', system-ui, sans-serif/'Archivo', system-ui, sans-serif  palette=#110f14-#8e7cc0-#bd80d1-#2f2c3a
           layout=usps>products>reviews  (rotaties: geen)
Nightwell  hash=18ecb7e51e72d72e
           hero=hero.split-left  topbar=topbar.calm-line  motion=calm-glide
           fonts='Playfair Display', Georgia, serif/'Lato', system-ui, sans-serif  palette=#1a161d-#a57ac2-#a0d37e-#352a3c
           layout=story>products>usps>reviews  (rotaties: geen)
✓ 3 unieke combinatie-hashes
DB bevat nu 6 vastgelegde combinaties

═══ 5. ANIME.JS DAADWERKELIJK IN DE OUTPUT ═══
Trailform  package.json animejs=^4.5.0
           import('animejs') aanwezig: true
           data-am markeringen: 6
           reduced-motion afgevangen: true
           failsafe (am-armed verwijderen): true
           AM_PLAN families: words,chars,lift,grid,draw,count,mask,blur,scale,slide,float
Mealkind   package.json animejs=^4.5.0
           import('animejs') aanwezig: true
           data-am markeringen: 6
           reduced-motion afgevangen: true
           failsafe (am-armed verwijderen): true
           AM_PLAN families: words,chars,lift,grid,draw,count,mask,blur,scale,slide,float
Nightwell  package.json animejs=^4.5.0
           import('animejs') aanwezig: true
           data-am markeringen: 6
           reduced-motion afgevangen: true
           failsafe (am-armed verwijderen): true
           AM_PLAN families: words,chars,lift,grid,draw,count,mask,blur,scale,slide,float

═══ 6. GEEN EMOJI IN DE GEGENEREERDE PAGINA'S ═══
Trailform  emoji in page.tsx: false
Mealkind   emoji in page.tsx: false
Nightwell  emoji in page.tsx: false
```

## Alle 106 componenten compileren (`npm run verify:components`)

Elk component × elke ondersteunde stijl in één "kitchen sink"-store, gevolgd door
een echte `next build`:

```
106 componenten → 251 stijl-instanties
hoofdpagina: 181 instanties, 0 CSS-conflicten
28 chrome-pagina's geschreven (nav × footer × topbar)

▲ Next.js 14.2.35
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Static export — 40 routes
```

Dit vond drie echte fouten die een gewone store-generatie gemist zou hebben:
1. `data-am-to` werd twee keer op hetzelfde element gezet (dubbel JSX-attribuut).
2. De `BAR()`-helper voor topbars plakte de basis-stijl vóór de overrides, waardoor
   varianten die `padding` opnieuw zetten een dubbele objectsleutel kregen. In CSS
   wint de laatste; in een JS-object-literal is het een compile-fout. Helper
   herschreven zodat dubbele sleutels structureel onmogelijk zijn.
3. `content.story-split` (bestaande batch) emitteerde `"" || (…)` als er geen
   `image`-prop was — TypeScript ziet een altijd-falsy expressie en `next build`
   weigert. Elke store die dat component koos zou gefaald zijn.

## Anime.js draait echt (headless Chromium, Playwright)

Statische export geserveerd, echte browser, gemeten DOM-toestand:

```
am-armed direct na load           : true
animejs-chunk over het netwerk    : 2 (page-24653b2a…js, 338.80f59709…js — 119 KB)
elementen met data-am             : 106
hero-kop opgesplitst in spans     : 7   ← splitText() van Anime.js heeft gedraaid
hero innerHTML (fragment)         : <span style="position: absolute; overflow: hidden; clip: rect(0px,0px,0px,0px); …
am-armed staat nog op <html>      : true
JS-fouten op de pagina            : geen
verborgen elementen onder de vouw : 29
scroll-reveal (lift)              : opacity 0 → 0.9718 na scrollen
```

De `opacity 0 → 0.97` na scrollen is het bewijs dat het geen CSS-only reveal is:
het element stond verborgen, kwam in beeld, en Anime.js animeerde het.

### prefers-reduced-motion: reduce

```
am-armed gezet                    : false   ← runtime stopt meteen, niets wordt verborgen
alle elementen in beeld zichtbaar : true
```

Next prefetcht de route-chunk sowieso; dat de bytes binnenkomen zegt niets. Wat
telt is dat de runtime niet start — zichtbaar aan `am-armed=false`.

## Drie stores bouwen volledig

```
trailform: compiled=1
mealkind : compiled=1
nightwell: compiled=1
```

## Typecheck en tests

```
npx tsc --noEmit   → schoon
npx vitest run     → 9 geslaagd, 1 gefaald
```

De gefaalde test is `store.test.ts` ("agent ids bevatten security-agent") en is
**pre-existent** — die faalde al vóór deze fase en heeft niets met de
componentbibliotheek te maken.
