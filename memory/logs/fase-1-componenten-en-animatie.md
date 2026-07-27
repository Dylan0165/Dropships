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
   Trailform: [assemble] 10 componenten (derived, thema sport, beweging editorial-fade): topbar.bold-statement[bold], nav.split-links[editorial], hero.editorial[editorial], badges.shipping-map[editorial], content.why-us-grid[minimal], products.grid-3[editorial], content.big-statement[editorial], testimonials.stat-proof[bold], content.faq-accordion[editorial], footer.sitemap-columns[minimal]
   Mealkind: [assemble] 9 componenten (derived, thema kitchen, beweging playful-pop): topbar.trust-mini[bold], nav.sticky-solid-on-scroll[bold], hero.split-left[bold], badges.icon-grid[bold], products.carousel[bold], content.why-us-grid[bold], testimonials.timeline-list[minimal], gallery.scroll-strip[bold], footer.big-wordmark[bold]
   Nightwell: [assemble] 10 componenten (derived, thema wellness, beweging calm-glide): topbar.calm-line[editorial], nav.split-links[editorial], hero.fullbleed-overlay[editorial], badges.icon-grid[minimal], products.featured-grid[editorial], content.story-split[editorial], testimonials.timeline-list[editorial], cta.stock-indicator[bold], content.tabs-info[minimal], footer.sitemap-columns[minimal]

═══ 4. COMBINATIE-HASHES (moeten uniek zijn) ═══
Trailform  hash=8819ae71f646ddc6
           hero=hero.editorial  topbar=topbar.bold-statement  motion=editorial-fade
           fonts='Cormorant Garamond', Georgia, serif/'Jost', system-ui, sans-serif  palette=#fbfafc-#623b72-#6eba50-#3b313f
           layout=usps>products>story>reviews  (rotaties: geen)
Mealkind   hash=71cdd01dc8e1cb87
           hero=hero.split-left  topbar=topbar.trust-mini  motion=playful-pop
           fonts='Archivo', system-ui, sans-serif/'Archivo', system-ui, sans-serif  palette=#110f14-#8e7cc0-#bd80d1-#2f2c3a
           layout=products>usps>reviews  (rotaties: geen)
Nightwell  hash=2b5e8b79e1ff51c4
           hero=hero.fullbleed-overlay  topbar=topbar.calm-line  motion=calm-glide
           fonts='Playfair Display', Georgia, serif/'Lato', system-ui, sans-serif  palette=#1a161d-#a57ac2-#a0d37e-#352a3c
           layout=products>story>reviews>cta-band  (rotaties: geen)
✓ 3 unieke combinatie-hashes
DB bevat nu 3 vastgelegde combinaties

═══ 5. ANIME.JS DAADWERKELIJK IN DE OUTPUT ═══
Trailform  package.json animejs=^4.5.0
           import('animejs') aanwezig: true
           data-am markeringen: 7
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
           data-am markeringen: 5
           reduced-motion afgevangen: true
           failsafe (am-armed verwijderen): true
           AM_PLAN families: words,chars,lift,grid,draw,count,mask,blur,scale,slide,float

═══ 6. GEEN EMOJI IN DE GEGENEREERDE PAGINA'S ═══
Trailform  emoji in page.tsx: false
Mealkind   emoji in page.tsx: false
Nightwell  emoji in page.tsx: false
```
