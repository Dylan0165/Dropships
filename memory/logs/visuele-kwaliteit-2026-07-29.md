# Visuele kwaliteit over alle winkels — audit + fixes (29 juli 2026)

Doel: elke gegenereerde winkel op het niveau van het beste voorbeeld tot nu toe
(sculpt-fade.clynado.com). Merknaam-generatie is niet aangeraakt.

## Taak A — de audit

### De live referentie: wat maakt sculpt-fade sterk?

Gemeten in een echte browser op `https://sculpt-fade.clynado.com` (HTTP 200,
0 JS-fouten):

```
hero-afbeelding : https://cf.cjdropshipping.com/aed5014e-….jpg
                  1667×1667 bron, gerenderd 1440×880 (full-bleed, bijgesneden)
                  → DEZELFDE afbeelding als het enige product in het grid
h1              : "CANAMIN Beard Growth Liquid 30ml" · 79,2px · Playfair Display 700
subtekst        : "A small range we actually use ourselves, shipped from within Europe." · 17,3px
verhouding h1/sub: 4,58
body            : Lato 16px op rgb(25,22,29)
```

Twee dingen vallen op, en ze zijn allebei belangrijk:

1. **Het hero-beeld is géén sfeerbeeld van ons.** Het is de kale CJ-productfoto —
   maar CJ leverde daar toevallig een lifestyle-shot (man met baard, leren jas,
   betonnen muur) in plaats van een pakshot op wit. Sculpt-fade ziet er beter uit
   door geluk bij de leverancier, niet doordat de pipeline iets beters deed.
2. **De copy komt uit het vangnet, niet uit de LLM.** "A small range we actually
   use ourselves, shipped from within Europe." en "Sculpt & Fade — shipped across
   Europe" zijn letterlijk de regels uit `fallbackBrief()` (store-builder.ts).
   Deze winkel is dus gebouwd nádat de store-builder-agent faalde. De USP's
   ("Clinically tested ingredients that deliver visible growth in 30 days") komen
   wél van de brand-agent. De winkel die de gebruiker het mooist vindt, draait
   voor de helft op deterministische code.

Terzijde, maar het bevestigt een eerdere fix: `blendmate.clynado.com` geeft nu
**HTTP 404** in plaats van het kopersdashboard.

### Vijf teststores door de echte pipeline

Gebouwd met `renderStore` + `next build`, met SVG-pakshots op wit als
productfoto's — dat is wat CJ meestal levert.

| Store | Hero-component | Hero-beeld | h1 | h1/sub | Componenten |
|---|---|---|---|---|---|
| Trailform | hero.editorial | pakshot, 21:8 uitgesneden (1296×494) | 99,2px Playfair | 5,9 | 9 |
| Mealkind | hero.editorial | pakshot, 21:8 uitgesneden | 99,2px Archivo | 5,9 | 10 |
| Nightwell | hero.fullbleed-overlay | pakshot, 1440×792 achter de tekst | 79,2px Cormorant | 4,58 | 9 |
| Petloop | hero.fullbleed-overlay | pakshot, 1440×861 achter de tekst | 79,2px Playfair | 4,58 | 10 |
| Deskline | hero.editorial | pakshot, 21:8 uitgesneden | 99,2px Cormorant | 5,9 | 9 |

Scores per punt (1-5, mijn oordeel op basis van de gemeten waarden):

| Punt | Baseline | Waarom |
|---|---|---|
| Hero-afbeelding | **1/5** | 5 van 5 winkels tonen de kale productfoto. Full-bleed = een witte vlakte met een fragment product; bij `fullbleed-overlay` staat het product pal achter de kop. |
| Beeldconsistentie | **2/5** | Hero en grid gebruiken exact hetzelfde bestand. Eén vierkante 800×800 bron wordt uitgesneden naar 21:8 én getoond als 1:1 kaart. |
| Typografie | **4/5** | Dit was al goed: 79-99px koppen, ratio 4,6-5,9. Zwak punt: Mealkind kreeg Archivo als kop- én bodyfont (geen pairing). |
| Copy | **3/5** | De vaste copy was dun: 4 cta-banden, 5 verhaal-titels, en één generieke terugval ("everyday products should just work"). Eén cta-band claimde "Join thousands of happy customers" — een verzonnen aantal. |
| Componentbreedte | **2/5** | 28 van 106 componenten over 5 winkels (5,6 uniek per winkel). 4 van de 5 kregen `nav.split-links`, `footer.sitemap-columns` én `gallery.detail-pair`. |

**De oorzaak van de eentonigheid, exact:**

- Elke hero gebruikte letterlijk `PRODUCTS[0].image`, full-bleed met
  `object-fit: cover`.
- De afgeleide componentselectie koos uit **hardgecodeerde lijstjes van 3-4 id's**
  per gleuf; structureel bereikbaar: 55 van 106.
- Alles hangt aan `tone`, en `deriveTone` gaf **+3 voor `priceMax >= 55`** tegen
  een seed-jitter van hooguit 0,9. Vier van de vijf winkels werden daardoor
  "premium" — en dus hetzelfde palet, dezelfde fonts, dezelfde componentpools.

## Taak B — sfeerbeeld in de hero

`design/hero-visual.ts` (nieuw) kent twee soorten hero-beeld:

- **lifestyle** — een echt sfeerbeeld. Mag full-bleed bijgesneden worden, met een
  scrim voor leesbare tekst. Komt uit `generateHeroImage()` (image-gen, alleen
  als er een `OPENAI_API_KEY`/`REPLICATE_API_TOKEN` is) of uit een meegegeven
  beeld. Het bestand gaat mee de winkel in als `/img/hero.webp` — een
  provider-URL verloopt, een bestand niet.
- **staged** — geen sfeerbeeld. De productfoto wordt dan **niet uitgesneden**
  maar gepresenteerd: op een kleurverloop uit het design-DNA, volledig in beeld,
  met een schaduw. In full-bleed hero's gaat het product naar de rechterhelft en
  blijft links schone ruimte voor de kop.

Er is altijd één van beide; valt alles weg, dan blijft de sfeerlaag over. Een
lege of gebroken hero kan niet meer voorkomen.

Onderweg gevonden en gerepareerd: `downloadFile` in image-gen.ts sprak
hardgecodeerd `https`. Een http-redirect (of een lokale test-provider) mislukte
daardoor stil, waarna de verlopende provider-URL in de winkel belandde.

## Taak C — de volle catalogus

- De pools per gleuf zijn nu de **hele categorie** in plaats van 3-4 id's.
- `design/component-usage.ts` (nieuw) houdt per component bij in hoeveel winkels
  het al staat; `pickFresh` kiest eerst wat nog nergens gebruikt is.
- De hero uit het layout-plan blijft de voorkeur, tenzij die al vaker gebruikt is
  dan het minst gebruikte alternatief.
- `catalogForPrompt()` geeft de LLM per component een `used`-teller mee, gesorteerd
  met de minst gebruikte bovenaan; de SKILL vraagt expliciet om een lage teller te
  kiezen.
- `deriveTone`: prijs telt nog mee (≥85 → +1,5; ≥55 → +0,75) maar beslist niet
  meer; jitter van 0,9 → 1,8.

## Taak D — copy

- `store-builder/SKILL.md` heeft een sectie **"Copy that works"** met vijf goede
  en vijf slechte voorbeelden, en vier concrete tests ("kan een concurrent in een
  andere niche deze zin ook gebruiken?"). De goede voorbeelden zijn de regels die
  op sculpt-fade daadwerkelijk staan.
- `content-en.ts`: cta-banden 4 → 8 (allemaal met een controleerbaar feit:
  termijn, plek, betaalmethode), verhaal-titels 5 → 8, openers 4 → 6, slotzinnen
  4 → 6, en vier concrete varianten voor de terugval zonder `storyAngle`.
- "Join thousands of happy customers" is weg: een verzonnen klantaantal.

## Verificatie — na de fixes

### `npm run verify:quality` → 26/26

```
✓ soort beeld is "staged" · wordt NIET bijgesneden · sfeerlaag uit het design-DNA
✓ geen hero die rechtstreeks de productfoto uitsnijdt
✓ mét provider: kind=lifestyle, fill=true, src=/img/hero.webp (meegekopieerd)
✓ provider faalt → null, winkel bouwt gewoon, terugval op de sfeerlaag
✓ zonder ENKELE productfoto: nog steeds geen gebroken beeld
✓ 6 winkels op rij → 51 unieke componenten, gemiddeld 9,5 per winkel
✓ geen twee winkels met dezelfde nav   (centered-logo · sidebar-drawer · announcement-bar ·
                                        icon-compact · sticky-solid-on-scroll · split-links)
✓ geen twee winkels met dezelfde footer (newsletter · dark-compact · trust-badges ·
                                        simple · sitemap-columns · social-strip)
✓ 7 verschillende cta-koppen over 40 seeds, 33 verschillende brand-stories
✓ geen verzonnen klantaantallen, geen generieke vulzinnen
```

### Drie nieuwe teststores, gebouwd met `next build`

| Store | Toon | Hero | Hero-beeld | h1 | Componenten |
|---|---|---|---|---|---|
| Brewhand | premium | hero.fullbleed-overlay | **staged**, product rechts op donkere sfeerlaag | 79,2px Cormorant | 9 |
| Rootside | urban | hero.editorial | **staged**, volledig in beeld | 99,2px Archivo | 10 |
| Sidestreet | urban | hero.split-left | **staged**, product als kaart | 82,8px Anton | 9 |

`object-fit` van het hero-beeld: **contain** in alle drie (was `cover` in alle
vijf de baseline-winkels).

| Punt | Baseline | Na | Bewijs |
|---|---|---|---|
| Hero-afbeelding | 1/5 | **4/5** | 0 van 3 winkels snijdt de productfoto uit; product volledig zichtbaar op een DNA-sfeerlaag, tekst vrij |
| Beeldconsistentie | 2/5 | **4/5** | hero toont hetzelfde product ongesneden i.p.v. een uitsnede; met key een eigen 16:9 sfeerbeeld |
| Typografie | 4/5 | 4/5 | ongewijzigd goed (ratio 4,58-5,9); drie verschillende fontparen over drie winkels |
| Copy | 3/5 | **4/5** | 7 cta-varianten, 33 verhaal-varianten, geen verzonnen aantallen |
| Componentbreedte | 2/5 | **4/5** | 9,5 uniek per winkel (was 5,6); 51/106 over 6 winkels; nav/footer nergens dubbel; bereik van de afgeleide selectie 55 → 102 van 106 (96%) |

Screenshots: `audit/baseline-*-hero.png` (voor) en `audit/na-*-hero.png` (na),
plus `live-sculpt-fade-hero.png` als referentie.

## Regressie

- `npx tsc --noEmit` schoon
- `verify:quality` 26/26 · `verify:collection` 15/15 · `verify:small` 27/27 ·
  `verify:assortment` 23/23 · `verify:efficiency` 6/6 · `verify:relevance` 14/14

## Niet hier te verifiëren

- **Een echt gegenereerd sfeerbeeld.** Er is geen `OPENAI_API_KEY` of
  `REPLICATE_API_TOKEN` op deze machine; het pad is geverifieerd tegen een lokaal
  nagebootste provider (inclusief downloaden en meekopiëren). Zonder key blijft
  het staged-pad actief — dat is de bedoeling, niet een gebrek.
- **Wat DeepSeek met de nieuwe SKILL-instructies doet.** De lokale key is
  ongeldig. De `used`-teller in de catalogus en de copy-voorbeelden zijn
  aantoonbaar aanwezig in de prompt; of het model ze volgt is pas op de VPS te
  zien.
- De audit-productfoto's zijn SVG-pakshots die een CJ-foto nabootsen. De
  geometrie (vierkant, wit, gecentreerd) klopt met de praktijk; de pixels zijn
  een stand-in.
