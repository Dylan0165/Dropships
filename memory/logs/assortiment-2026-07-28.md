# Assortiment per niche — verificatie (28 juli 2026)

Vijf taken: bredere producttype-generatie (A), alle types doorzoeken zonder
duplicaten (B), zoek-efficiëntie (C), het volledige assortiment door de
componentcatalogus (D), logging + shortlist-overzicht (E).

## Wat er mis was

De logs lieten zien dat het systeem voor "baard verzorging" wél meerdere
producttypes bedacht (beard grooming kit, beard oil, beard brush), maar alleen
de eerste afzocht. `discoverCandidates` in wizard.ts had een `for`-lus over de
zoektermen met `if (candidates.length > 0) break` — bedoeld als "probeer de
volgende term als deze niets oplevert", in de praktijk "stop na de eerste term
die iets geeft". Daarna vulde `fitProducts` de collectie op met KLONEN van de
gevonden producten (`--v1`-suffix) tot er zes stonden.

Netto: een winkel die vol leek en drie keer hetzelfde item toonde.

## Taak A + B + E — `npm run verify:assortment` → 23/23

Draait `suppliers/assortment.ts` + `suppliers/product-types.ts` met een
injecteerbare zoekfunctie en LLM (de DeepSeek-key op de dev-machine is ongeldig;
de geteste logica is de onze).

```
✓ 10-15 producttypes — 13 types
✓ allemaal distinct — 13 unieke zoektermen
✓ gespreid over prijsklassen — entry 3 / mid 6 / premium 4
✓ twee types met dezelfde zoekterm worden één — 3 aangeleverd → 2 overgehouden

✓ elk producttype is doorzocht — 13 pogingen voor 13 types
✓ niet gestopt na het eerste type — 13 types kregen een echte zoekopdracht
✓ 7-15 producten — 11 producten
✓ geen dubbele producten — 11 unieke product-ids
✓ geen --v duplicaat-suffix
✓ minstens 7 distincte producttypes — 11 types in de collectie
✓ ruis is niet in de collectie beland — ventilator en powerbank ontbreken
✓ ruis is wél zichtbaar afgewezen — Portable Leafless Cooling Fan (1), Portable Power Bank (1)
✓ prijsspreiding in het assortiment — inkoop €2.30 — €18.60
```

Het assortiment dat eruit komt:

```
beard oil            [mid    ]  9/10  $ 4.20  Beard Oil 30ml Argan & Jojoba
beard balm           [mid    ]  9/10  $ 5.40  Beard Balm Leave-In Conditioner 60g
beard trimmer        [premium]  9/10  $12.50  Cordless Beard Trimmer USB
beard comb           [entry  ]  9/10  $ 2.30  Sandalwood Beard Comb Anti-Static
beard brush          [entry  ]  9/10  $ 3.80  Boar Bristle Beard Brush Wooden Handle
beard shampoo        [mid    ]  9/10  $ 5.90  Beard Wash Shampoo Sulfate-Free 200ml
beard scissors       [entry  ]  9/10  $ 3.10  Stainless Steel Beard Scissors
beard growth serum   [premium]  9/10  $ 7.40  Beard Growth Serum Biotin 30ml
beard gift set       [premium]  9/10  $18.60  Beard Care Gift Set 6-Piece Box
beard storage bag    [mid    ]  9/10  $ 4.90  Beard Grooming Kit Travel Pouch
beard roller         [mid    ]  6/10  $ 3.40  Derma Roller Beard 0.5mm
```

Twee van de dertien types leverden niets op en staan er mét reden bij:
`beard straightener` → "geen kandidaten bij de leverancier",
`beard dye` → "kandidaten haalden de relevantie-drempel niet".

**De duplicate-opvulling is weg** (`design/layout.ts`):

```
✓ 3 producten blijven 3 producten — 3 terug (oud gedrag: 6, met a--v1/b--v1/c--v1)
✓ geen enkel gekloond id — a, b, c
✓ boven 15 wordt begrensd, niet gedupliceerd — 20 → 15
```

**Magere niche** (catalogus met 3 treffers) → uitbreidingsronde + eerlijke melding:

```
✓ uitbreidingsronde is gedraaid — 13 types → 16 na uitbreiding
✓ eerlijke melding i.p.v. opvulling:
  "Slechts 3 passende producten gevonden (streefgetal 7-15) over 16 producttypes:
   13 type(s) zonder kandidaten bij de leverancier, 0 type(s) waarvan de kandidaten
   de relevantie-drempel niet haalden. Er zijn bewust geen duplicaten of
   half-passende producten toegevoegd om het aantal te halen."
```

## Taak C — `npm run verify:efficiency` → 6/6

Echte `CJAdapter.searchProducts` tegen een onderschepte fetch; geteld worden de
werkelijke `/product/list`-calls. Twaalf producttypes, twee configuraties:

| | warehouse-passes | opties | calls | per type | wachttijd op productie |
|---|---|---|---|---|---|
| **voor** | DE,NL,FR,IT,ES,PL,CZ + globaal | `maxResults:30` | **48** | 4.0 | 52,8s |
| **na** | DE,FR,PL + globaal | `maxResults:4, minResults:2` | **12** | 1.0 | 13,2s |

```
✓ minder calls dan voorheen — 48 → 12 calls (75% minder)
✓ één call per producttype in het gunstige geval
✓ tijdwinst op productie — 40s per assortiment
✓ er komen nog steeds producten terug — 48 producten over 12 zoektermen
✓ herhaalde zoekopdracht raakt CJ niet — 0 calls, 1 cache-treffer
✓ tussenruimte gaat omhoog na een rate limit — 0ms → 250ms
```

Let op de omvang van de verandering: mét twaalf producttypes in plaats van één
zoekterm kost een assortiment nu 12 calls, waar de OUDE code met één zoekterm al
8 calls kostte. Twaalf keer zoveel productonderzoek voor anderhalf keer de calls.

Waarom drie warehouses volstaan: de globale pass ziet álle voorraad. De
landen-passes bestaan alleen om het warehouse (en dus de levertijd) te kunnen
taggen. Zeven landen taggen niet meer dan drie + globaal, ze kosten alleen vier
extra calls per zoekterm.

## Taak D — `npm run verify:collection` → 15/15

Vier echte stores gebouwd via `renderStore()` (hetzelfde pad als de pipeline):

```
1. 12 producten, 12 producttypes
   ✓ renderer blijft de componentcatalogus — renderer=component-catalog
   ✓ ALLE 12 producten staan in de pagina — 12/12 producttitels in app/page.tsx
   ✓ elk producttype staat in de paginadata — 12/12 types in PRODUCTS
   ✓ een productweergave voor grote, diverse collecties — products.category-tabs
   ✓ de collectie is per categorie te doorlopen — ProductTabs filtert op productType

2. 4 producten
   ✓ renderer blijft de componentcatalogus
   ✓ geen catalogus-weergave voor 4 producten — products.featured-grid
   ✓ alle 4 producten zichtbaar

3. LLM kiest products.editorial-list (few-products) voor 12 producten
   ✓ de mismatch is gecorrigeerd → products.category-tabs
   ✓ de correctie is gelogd
   ✓ renderer blijft de componentcatalogus
   ✓ alle 12 producten nog steeds zichtbaar

4. LLM kiest products.grid-4 voor 12 producten
   ✓ grid-4 blijft grid-4 — geen onnodige correctie
```

De eerste store is daarna écht gebouwd (`next build`, exit 0) en in een browser
gecontroleerd:

```
zichtbaar in #products : 12 producten, 12 "Order now"-knoppen
categorie-tabs         : All · Beard oil · Beard balm · Beard trimmer · Beard comb ·
                         Beard brush · Beard shampoo · Beard scissors ·
                         Beard growth serum · Beard gift set · Beard storage bag ·
                         Beard roller · Shaving razor
per tab                : All: 12 · elke categorie-tab: 1
JS-fouten              : geen
```

## Taak E — shortlist-UI

Screenshot van de echte build (`npm run build` → server op :3320, Playwright):

```
diversiteit  : "11 producttypes over 11 geselecteerde producten" + alle type-chips
per kaart    : type-badge (blauw) + prijsklasse (instap/midden/premium)
zoeklog      : "13 producttypes doorzocht · 13 zoekopdrachten · 11 raak"
               uitklapbaar: per type de zoekterm, het aantal kandidaten en het
               gekozen product; lege types met reden
afgewezen    : "4 kandidaat/kandidaten weggefilterd op relevantie" met score + reden
geselecteerd : 11 / 15 (het hele assortiment staat standaard aan)
```

## Regressie

- `npx tsc --noEmit` — schoon
- `npm run build` — 1680 modules, 4.71s
- `npx vitest run` — 9 geslaagd, 1 gefaald (`store.test.ts` verwacht
  'growth-agent'/'security-agent'; bestond al vóór dit werk)
- `npm run verify:relevance` → 14/14, `npm run verify:subdomain` → 15/15

## Niet hier te verifiëren

- **Een echte CJ-zoekopdracht.** De CJ-key op deze machine staat in mock-modus;
  de efficiëntie-meting gebruikt een onderschepte fetch. Wat bewezen is: het
  aantal calls dat onze code maakt, geteld op HTTP-niveau.
- **De LLM-producttypelijst van DeepSeek zelf.** De key is lokaal ongeldig.
  Daarom is de judge injecteerbaar en is `normalizeTypes` los getest op
  ontdubbeling en prijsklasse-spreiding.
