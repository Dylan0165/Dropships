# Verkleedkleding in niche-winkels + centrale contactgegevens (31 juli 2026)

Melding: een hondenwinkel (halsbanden/riemen) toonde een volwassen dalmatiër-pak
en een damesrokje. Vierde keer dat keyword-gestapelde titels door de
relevantiecheck kwamen.

## Taak B — waarom kwamen ze erdoorheen?

### Wat ik op de live winkel kon vaststellen

`trailpaw.clynado.com` (HTTP 200), zes producten, waarvan drie verkleedartikelen:

```
Dalmatian Costume Set, 3-Piece Dog Costume For Adults, … —Party Accessory Set   € 9,95
Dalmatian Dog Costume, … Polka-Dot Skirt … Polka-Dot Outfit For Women            €14,95
Multi-piece Party Gift Set, 1 Lion's Mane Dog Costume—adjustable …               €18,95
```

**Uitgesloten: "gebouwd vóór de fix".** De hero-afbeelding staat op
`oss-cf.cjdropshipping.com/product/2026/07/30/01/…` — deze winkel is op
**30 juli** gebouwd, twee dagen ná de relevantie-fix.

**Uitgesloten: de assortiment-route.** Sinds 28 juli krijgt elk product uit
`buildAssortment` een `productType`, en dat veld reist mee tot in `PRODUCTS` op
de pagina. Ik heb de live pagina uitgelezen:

```
"productType" in de paginadata : 0 keer
categorie-tabs                  : nee
```

Geen enkel product heeft een producttype. Deze producten zijn dus **niet** via
het assortiment binnengekomen.

Blijven over — allebei zonder producttype, allebei fout:

1. **Handmatig zoeken in de wizard** (`/api/suppliers/cj/search`, ook gebruikt
   door de "Vervang"-knop). Dat endpoint had **geen enkele relevantiecontrole** —
   alleen het grove woordfilter in `searchProducts`. Hetzelfde geldt voor
   `suggestProductsForStore` (producten bijzetten bij een live winkel).
2. **Het één-zoekterm-pad** (`buildShortlistSingleTerm`), waar de wizard op
   terugvalt als de producttype-generatie faalt. Dáár draait `scoreRelevance`
   wél — maar zonder enig besef van verkleedkleding.

Dat de hero-copy van deze winkel letterlijk `fallbackBrief()` is ("TrailPaw — a
short, honest selection"), betekent dat de store-builder-agent tijdens die run
faalde. Bij zo'n hapering faalt `generateProductTypes` ook, en dat maakt route 2
het waarschijnlijkst. Welke van de twee het precies was, kan ik zonder de
run-logs op de VPS niet hard maken; beide zijn nu dicht.

### Waarom de semantische laag ze niet ving

Twee oorzaken, allebei aantoonbaar zonder de VPS:

**(a) De beoordelaar kreeg een afgekapte titel.** `compact()` stuurde
`title.slice(0, 110)`. Keyword-stapelaars zetten de lokwoorden vooraan en wát
het product écht is achteraan:

```
op 110 tekens: "Dalmatian Dog Costume, 3-Piece Dalmatian Costume Set With
                Polka-Dot Skirt, Ears & Tail, Animal Costume For Cos"
                                        ↑ "Polka-Dot Outfit For Women" valt eraf
```

**(b) Niets in de prompt vroeg wie het draagt.** De vraag was "past dit bij de
niche". Een *dog costume* past ogenschijnlijk prima bij een hondenwinkel — de
prompt maakte nergens onderscheid tussen een artikel voor het dier en kleding
voor de eigenaar. De eerdere successen (ventilator 1/10, piratenhoed 1/10) waren
producten zonder woordoverlap met de niche; hier is de overlap juist het
probleem.

## Taak A — harde diskwalificatie

`costumeDisqualification(niche, product)` in `product-relevance.ts` draait
**vóór** de LLM. Signaalwoorden: costume, cosplay, fancy dress, halloween,
carnival, masquerade, dress-up, party accessory, theme party, mascot, onesie,
kigurumi, role play. Mens-signalen daarbovenop: for adults / for women / for men
/ outfit / skirt / dress / gloves / wig / jumpsuit / cape / tutu.

- Eén kostuumsignaal is genoeg als de niche niet over verkleden gaat.
- `nicheIsAboutCostumes()` (kijkt ook naar de persona) zet de regel uit voor een
  verkleedwinkel — daar is een kostuum juist het product.
- Afgewezen producten worden niet aan de LLM voorgelegd: het model kan er dan
  ook geen 7 van maken.
- Titels gaan nu op 240 tekens mee in plaats van 110, beschrijvingen op 200.
- De prompt zelf kreeg de regel er ook bij ("vraag jezelf af: wie draagt dit?"),
  als tweede laag voor gevallen die de woordenlijst mist.

Alle drie de instroom-paden gebruiken nu dezelfde poort:

| Pad | Voor | Na |
|---|---|---|
| assortiment / één-zoekterm | `scoreRelevance` zonder kostuumbesef | harde poort + aangescherpte prompt |
| `/api/suppliers/cj/search` (handmatig zoeken, "Vervang") | géén controle | markeert met reden; de wizard toont een rode waarschuwing |
| `suggestProductsForStore` (live winkel aanvullen) | géén controle | filtert ze eruit |

Handmatig zoeken blokkeert bewust niet: dat is een gerichte actie van de
operator. Het wordt wél zichtbaar gemarkeerd.

## Verificatie — `npm run verify:costume` → 22/22

Met de exacte titels van de live winkel.

```
═══ 3. HARDE DISKWALIFICATIE ═══
  AFGEWEZEN  Dalmatian Costume Set, 3-Piece Dog Costume For…
             Verkleedkleding voor mensen ("costume", "cosplay", "for adults", "for adult")
             — niet bedoeld voor deze niche, ondanks de woordovereenkomst.
             signalen: costume, cosplay, carnival, party accessory, theme part, for adults, gloves
  AFGEWEZEN  Dalmatian Dog Costume, 3-Piece Dalmatian Costu…
             Verkleedkleding voor mensen ("costume", "cosplay", "for women", "outfit")
             signalen: costume, cosplay, halloween, carnival, party accessory, for women, outfit, skirt
  AFGEWEZEN  Multi-piece Party Gift Set, 1 Lion's Mane Dog …
             Verkleed-/kostuumartikel ("costume") terwijl deze niche niet over verkleden gaat.
  ✓ halsband komt gewoon door · riem-set komt gewoon door
  ✓ hondenspeelgoed komt door ondanks "Birthday"/"Party"-achtige woorden
  ✓ kostuum-niche herkend → daar blijven kostuums staan (ook via de persona)

═══ 4. ZWAARDER DAN TREFWOORD-OVERLAP ÉN DAN DE LLM ═══
  (judge geeft expres 7 met "Bevat dog — lijkt te passen")
    ✗  1/10  Dalmatian Costume Set …          ✓  7/10  Engraved Dog Collar And Leash
    ✗  1/10  Dalmatian Dog Costume …          ✓  7/10  Blue Agate Dog Collar …
    ✗  1/10  Multi-piece Party Gift Set …     ✓  7/10  Dog Toys Soccer Ball …
  ✓ kostuums worden niet eens aan de LLM voorgelegd
  ✓ LLM onbereikbaar → kostuums blijven alsnog geweerd
```

Het echte endpoint, door de 2FA-gate heen op een draaiende server:

```
zoekterm "dalmatian dog costume for adults"
  zonder niche          → niet gemarkeerd (operator zoekt bewust)
  niche=dog collars…    → gemarkeerd: "Verkleedkleding voor mensen ("costume", "for adults"…)"
  niche=halloween…      → niet gemarkeerd
```

## Taak C — contactgegevens centraal

Wat er stond, op élke gebouwde winkel:

```
contactpagina : support@<subdomein>.example     ← .example is geen bestaande TLD
footer        : hello@example.com               ← default uit de componentcatalogus
```

Allebei onbereikbaar. Nu komt alles uit `server/company.ts`, gevoed door
`COMPANY_*`-env-variabelen (gedocumenteerd in `.env.example`). Niet-ingevulde
velden worden **weggelaten** — een verzonnen adres is erger dan geen adres.
Standaard: Clynado / support@clynado.com / Mon-Fri 09:00-17:00 CET.

Geverifieerd in een echt gebouwde winkel (`next build`, screenshot
`contact-gamma.png`):

```
Email: support@clynado.com          (mailto:support@clynado.com)
Phone: +31 20 123 4567              (tel:+31201234567)
Support hours: Mon-Fri, 09:00-17:00 CET
Postal address: Clynado / Keizersgracht 1 / 1015 CJ Amsterdam / Nederland
VAT: NL000000000B01
Gamma is operated by Clynado.
```

De merknaam van de winkel (GAMMA) staat gewoon in de nav en in de zin
"Gamma is operated by Clynado" — merknaam-generatie is niet aangeraakt.

`npm run verify:quality` → **34/34**, waaronder: twee winkels tonen hetzelfde
adres, geen `.example`, geen `hello@example.com`, en lege velden verschijnen niet.

## Regressie

`tsc --noEmit` schoon · `npm run build` 8,11s · verify: costume 22 · quality 34 ·
collection 15 · small 27 · assortment 23 · efficiency 6 · relevance 14 ·
`vitest` 9/10 (`store.test.ts`, bestond al).

## Wat nog openstaat

- **De drie kostuumproducten staan nog op trailpaw.clynado.com.** Deze fix
  voorkomt nieuwe gevallen; de bestaande winkel moet je opschonen via het
  beheerscherm (producten verwijderen → rebuild).
- **`COMPANY_PHONE`, `COMPANY_ADDRESS`, `COMPANY_VAT`, `COMPANY_REGISTRATION`
  staan nog niet op de VPS.** Tot die tijd tonen de winkels alleen e-mail en
  supporttijden. Ik heb bewust geen adres of telefoonnummer verzonnen. Voor
  verkoop op afstand binnen de EU zijn die gegevens verplicht.
- **Welke van de twee routes** de kostuums in TrailPaw bracht, is zonder de
  run-logs op de VPS niet hard te maken. Beide zijn dicht.
