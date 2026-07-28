# Te klein assortiment — nette afhandeling (28 juli 2026)

Melding: niche "baard groei stimuleren en verzorging voor bestaande baard +
minoxidil" leverde na 24 doorzochte producttypes terecht maar 2 relevante
producten op. De wizard toonde daarna ~3 minuten niets en eindigde met
"brief generation failed", zonder uitleg of vervolgstap.

## Wat de oorzaak wél en niet was

**De hypothese — "de brief-prompt gaat uit van een minimum aantal producten" —
klopt niet.** Er staat nergens in de code of in `store-builder/SKILL.md` een
ondergrens op het aantal producten; `StoreBriefSchema` bevat helemaal geen
productveld en `stages.ts` faalt alleen bij **nul** producten.

Wat er wél mis was, in twee delen:

1. **De echte reden werd weggegooid.** `generateBrief()` gaf `StoreBrief | null`
   terug. `runAgent` levert `error` én `validationErrors` op, maar `buildStore`
   zag alleen `null` en maakte daar de letterlijke tekst `'brief generation
   failed'` van. Daardoor was op geen enkele manier na te gaan wát er misging —
   ook niet voor mij, achteraf. Dit is de reden dat de melding onbruikbaar was.

2. **Eén mislukte LLM-call legde de hele run om.** Stage 7 heeft al vangnetten
   voor het design-DNA (`applyDesignPlan`) en voor de componentassemblage
   (`build-page.ts`), maar niet voor de brief zelf.

Wat een smalle niche daarbovenop lastig maakt: de store-builder krijgt ~10k
tokens componentcatalogus mee (34.631 tekens) en draait op `deepseek-reasoner`
met `max_tokens: 8000`. Dat budget dekt bij dit model óók het redeneren. Loopt
dat vol, dan komt er alleen `reasoning_content` terug en nooit JSON — drie keer
achter elkaar, wat exact de ~3 minuten verklaart die de gebruiker zag. Dat kan ik
niet als DE oorzaak van hun run bewijzen (die logs staan op de VPS en de oude
code bewaarde de reden niet), maar het is nu wél een herkenbare, benoemde
uitkomst in plaats van stilte.

## Wat er veranderd is

| | |
|---|---|
| `agent.ts` | `compactInput`: vanaf poging 2 gaat de catalogus uit de prompt (41k → 2k tekens). Alleen-redenering-terug wordt herkend en met zoveel woorden gerapporteerd. |
| `store-builder.ts` | `generateBrief` geeft `{brief, error, validationErrors}`. Nieuw: `collectionContext()` (de brief weet hoe groot de collectie is) en `fallbackBrief()` (geldige brief uit de brand-stage). `buildStore` valt daarop terug in plaats van de run te laten sneuvelen. |
| `stages.ts` | `brief_source` + `brief_error` in de stage-output; USP's uit brand-creation gaan mee als vangnet-materiaal. |
| `StoreWizard.tsx` | Keuzemoment direct na de assortiment-fase bij < 5 producten. "Volgende" blijft dicht tot er gekozen is. |
| `wizard.ts` / `index.ts` | `broaden`-optie: zoekt bredere producttypes bij dezelfde doelgroep. |

## Verificatie — `npm run verify:small` → 27/27

Draait de echte `buildStore` tegen een lokaal nagebootst LLM-endpoint, met de
2 producten uit de melding.

```
═══ 1. DE BRIEF WEET NU HOE GROOT DE COLLECTIE IS ═══
  2 producten  → This store has only 2 product(s). Design a focused
                 single-product-style store … Do NOT pick a catalog or grid layout
  12 producten → This store has 12 products across 12 product type(s). Use a
                 catalog-style layout.
  ✓ collectie-grootte staat in de prompt — product_count=2
  ✓ kleine collectie krijgt eigen instructie
  ✓ geen catalogus-layout bij 2 producten
  ✓ grote collectie krijgt catalogus-instructie

═══ 2. STORE-BUILDER AGENT FAALT (proza i.p.v. JSON), 2 PRODUCTEN ═══
  ⚠ store-builder agent gaf na 3 poging(en) geen bruikbare brief —
    geen parseerbare JSON in het antwoord (7980 output-tokens, begint met: Hier is…)
  → terugval: brief samengesteld uit de brand-stage
  ✓ de run gaat NIET onderuit — ok=true (was: ok=false, "brief generation failed")
  ✓ brief komt uit het vangnet — briefSource=fallback
  ✓ de ECHTE reden is bewaard
  ✓ de reden is diagnosticeerbaar — noemt wat er terugkwam en hoeveel tokens
  ✓ beide producten staan in de winkel — 2/2 producttitels
  ✓ renderer blijft de componentcatalogus
  ✓ een weergave die bij 2 producten past — products.editorial-list
  duur: 10.1s (3 pogingen + backoff), daarna gewoon een winkel

═══ 3. RETRY MET VERKORTE INVOER ═══
  catalogus in de invoer per poging: 1=ja · 2=nee · 3=nee
  invoergrootte per poging: 1=41k · 2=2k · 3=2k

═══ 4. MODEL GEEFT ALLEEN REDENERING TERUG (max_tokens op) ═══
  ✓ de melding wijst naar de oorzaak — "model gaf alleen redenering terug, geen
    antwoord (7980 output-tokens) — waarschijnlijk max_tokens bereikt tijdens het denken"

═══ 5. GOEDE BRIEF → GEEN VANGNET ═══  briefSource=llm, geen foutmelding
═══ 6. ZES PRODUCTEN ═══               6/6 zichtbaar, renderer=component-catalog
═══ 7. DE SAMENGESTELDE BRIEF ZELF ═══ gebruikt de USP's uit de brand-stage,
                                       geen design/components (seeded DNA neemt over),
                                       verzint geen producten
```

De winkel uit scenario 2 (vangnet-brief, 2 producten) is daarna écht gebouwd:
`next build` → exit 0, 8 statische routes (`/`, `/checkout`, `/about`, `/contact`,
`/faq`, `/returns`, `/thank-you`, `/_not-found`).

## Verificatie — het keuzemoment in de echte UI

`npm run build` → server op :3320 → Playwright, met een onderschepte
shortlist-respons van 2 producten over 24 doorzochte types.

```
tijd tot de keuze          : 854 ms na "Volgende" (was: ~3 min en dan een crash)
melding                    : "Deze niche leverde maar 2 relevante producten op."
keuzes                     : Doorgaan met een kleinere winkel (2) ·
                             Niche breder maken · Andere niche proberen
"Volgende" vóór de keuze   : disabled
na "Doorgaan"              : enabled, met "Kleine winkel gekozen — 2 producten."
na "toch nog even kijken"  : weer disabled
na "Andere niche proberen" : terug op stap 1, producten weg (het idee blijft in
                             het veld staan, klaar om aan te passen)
na "Niche breder maken"    : broaden=true meegestuurd → 6 producten, melding weg,
                             "Volgende" enabled
```

Screenshots: `small-keuze.png`, `small-akkoord.png`, `small-breder.png`.

## Regressie

- `npx tsc --noEmit` — schoon
- `npm run build` — 5,11s
- `npx vitest run` — 9 geslaagd, 1 gefaald (`store.test.ts`, bestond al)
- `verify:assortment` 23/23 · `verify:efficiency` 6/6 · `verify:collection` 15/15

## Niet hier te verifiëren

- **De oorspronkelijke run.** Die logs staan op de VPS en de oude code bewaarde
  de faalreden niet. Wat nu vaststaat: dezelfde situatie levert voortaan een
  benoemde reden op én een werkende winkel.
- **Of `max_tokens: 8000` daadwerkelijk de oorzaak was.** Ik heb die waarde
  bewust NIET verhoogd: dat kan ik zonder geldige key niet tegen de echte API
  testen, en een verkeerd gekozen limiet zou élke store-build breken. In plaats
  daarvan is de invoer op de retry kleiner en wordt de situatie herkenbaar
  gerapporteerd. Zie de melding hierboven — als dit op de VPS de oorzaak is,
  staat het er nu letterlijk.
