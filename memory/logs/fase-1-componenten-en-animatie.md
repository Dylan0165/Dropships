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
   Trailform: [assemble] geen echte reviews aangeleverd — testimonials-sectie overgeslagen
   Trailform: [assemble] 10 componenten (derived, thema sport, beweging playful-pop): topbar.energy-ticker[bold], nav.sidebar-drawer[bold], hero.animated-gradient[bold], badges.ribbon-highlight[bold], content.timeline-story[editorial], products.featured-grid[bold], content.story-split[editorial], cta.inline-strip[bold], cta.sticky-bottom[bold], footer.big-wordmark[bold]
   Trailform: [assemble] collectie: 8 producten over 0 producttype(s)
   Mealkind: [assemble] geen echte reviews aangeleverd — testimonials-sectie overgeslagen
   Mealkind: [assemble] 9 componenten (derived, thema kitchen, beweging playful-pop): topbar.free-shipping-progress[bold], nav.mega-menu[bold], hero.editorial[editorial], badges.payment-icons[bold], products.grid-3[bold], content.feature-alternating[bold], form.question-box[minimal], gallery.grid-uniform[minimal], footer.contact-block[minimal]
   Mealkind: [assemble] collectie: 8 producten over 0 producttype(s)
   Nightwell: [assemble] geen echte reviews aangeleverd — testimonials-sectie overgeslagen
   Nightwell: [assemble] 10 componenten (derived, thema wellness, beweging calm-glide): topbar.rotating-soft[editorial], nav.icon-compact[minimal], hero.badge-row[bold], badges.press-logos[editorial], content.stats-showcase[bold], products.featured-grid[editorial], content.values-grid[editorial], gallery.full-bleed-band[editorial], cta.stock-indicator[bold], footer.multi-column[minimal]
   Nightwell: [assemble] collectie: 8 producten over 0 producttype(s)

═══ 4. COMBINATIE-HASHES (moeten uniek zijn) ═══
Trailform  hash=bcfb6dce7f877adb
           hero=hero.animated-gradient  topbar=topbar.energy-ticker  motion=playful-pop
           fonts='Anton', system-ui, sans-serif/'Inter', system-ui, sans-serif  palette=#110f14-#9487b5-#b6c78a-#302d39
           layout=usps>products>story>reviews  (rotaties: geen)
Mealkind   hash=cb2dc8fb228ac036
           hero=hero.editorial  topbar=topbar.free-shipping-progress  motion=playful-pop
           fonts='Archivo', system-ui, sans-serif/'Archivo', system-ui, sans-serif  palette=#110f14-#8e7cc0-#bd80d1-#2f2c3a
           layout=products>reviews>usps  (rotaties: geen)
Nightwell  hash=2afde6b218a2bcf9
           hero=hero.badge-row  topbar=topbar.rotating-soft  motion=calm-glide
           fonts='Fraunces', Georgia, serif/'Figtree', system-ui, sans-serif  palette=#f7f9f6-#6eb93c-#9537d2-#354a27
           layout=story>products>usps>reviews  (rotaties: geen)
✓ 3 unieke combinatie-hashes
DB bevat nu 41 vastgelegde combinaties

═══ 5. ANIME.JS DAADWERKELIJK IN DE OUTPUT ═══
Trailform  package.json animejs=^4.5.0
           import('animejs') aanwezig: true
           data-am markeringen: 5
           reduced-motion afgevangen: true
           failsafe (am-armed verwijderen): true
           AM_PLAN families: words,chars,lift,grid,draw,count,mask,blur,scale,slide,float
Mealkind   package.json animejs=^4.5.0
           import('animejs') aanwezig: true
           data-am markeringen: 7
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
