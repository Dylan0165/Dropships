# Offline batch-onderzoek + presetbibliotheek (1 augustus 2026)

**Status: lokaal aantoonbaar werkend, NIET op echte CJ-/DeepSeek-data bevestigd.**
Deze machine heeft geen geldige keys. Alles hieronder draaide tegen een
nagebootste leverancier en een onderschepte LLM. Het VPS-stappenplan staat
onderaan.

## Wat er gebouwd is

| Bestand | Rol |
|---|---|
| `research/preset-store.ts` | tabellen `niche_presets` + `preset_skips`, opslaan/zoeken/statistiek |
| `research/preset-match.ts` | twee lagen: lexicaal, daarna semantisch (LLM) |
| `research/batch-research.ts` | de offline run: scannen → beschrijven → types → assortiment → poorten → preset of skip |
| `suppliers/pricing.ts` | prijszetting die wizard én batch delen (was alleen in wizard.ts) |
| `scripts/research-batch.ts` | CLI: `npm run research:batch` |
| endpoints | `GET /api/research/presets`, `/presets/:slug`, `/skips`, `DELETE /presets/:slug` |

Aangevuld op verzoek: `giftFramingDisqualification` (cadeau-sfeer) en
`machineTranslationDisqualification` (marktplaats-vertaling) in
`product-relevance.ts`. **Die twee bestonden nog niet** — de opdracht noemde ze
als bestaand, maar in de code stond alleen de kostuum-poort. Ze draaien nu samen
in `hardDisqualification()`, dus élke aanroeper krijgt ze.

## Taak A — het batch-proces

Per categorie: viability-check (≥25 producten wereldwijd) → nichebeschrijving
(LLM, met deterministische terugval) → 10-15 producttypes → `buildAssortment`
**zonder** `minResults`, dus álle warehouse-passes per zoekterm en ook de
alternatieve term → kwaliteitspoorten → preset óf skip met reden.

Drie dingen die dit anders maken dan een wizard-run:

1. **Rustig.** `setBaseSpacing()` zet de tussenruimte tussen CJ-calls op 2500ms
   (default) in plaats van 1100ms, plus een harde call-begroting (`--max-calls`,
   default 2000). De adaptieve verhoging na een 429 blijft daar bovenop staan.
2. **Hervatbaar.** Elke categorie wordt apart weggeschreven. `alreadyHandled()`
   slaat categorieën over die binnen 30 dagen al een preset of skip kregen, dus
   een afgebroken run hoeft niet overnieuw. `Ctrl+C` maakt de lopende categorie
   nog af.
3. **Eerlijk.** Onder de 7 producten komt er géén preset — de reden gaat naar
   `preset_skips`. Niets wordt opgevuld.

## Taak B — preset eerst, live zoeken als vangnet

`buildShortlist` kijkt eerst in de bibliotheek. Match → direct terug, **nul
CJ-calls**. Geen match → de bestaande live-flow, en het resultaat wordt daarna
zelf een preset (`source: 'wizard-fallback'`), mits het de drempel haalt.

De matcher heeft twee lagen omdat één laag hier niet werkt:

```
lexicale scores tegen preset "dog collars and leashes":
  100%  "dog collars"
  100%  "dog collars and leashes"
   73%  "dog walking gear"
    0%  "cat toys"
    0%  "koffiezetapparaten"
    0%  "hondenriemen en halsbanden"   ← Nederlandse invoer
```

De wizard-invoer is vaak Nederlands en de presets zijn Engels. Daar loopt de
lexicale laag op nul. Daarom gaan de tien beste kandidaten (alleen labels, geen
producten) naar één kleine LLM-call. **Twee dingen die daarbij misgingen en
gerepareerd zijn:**

- De eerste versie liet de LLM alleen kandidaten zien die lexicaal ≥18% scoorden.
  Bij Nederlandse invoer scoort álles nul, dus laag 2 kwam nooit aan bod —
  precies in het geval waarvoor hij bestaat. Nu vallen we terug op de top 10.
- De eerste scoreformule liet overlap met de *producttypes* alleen al een
  100%-match opleveren. Een koffiepreset met een "travel bowl" erin matchte zo op
  "dog collars". Nu telt brede overlap voor maximaal 0,45 en moet de **niche-naam
  zelf** meedoen om boven de directe drempel (0,55) te komen.

Faalt de LLM, dan is er geen preset en draait gewoon de live-flow.

## Taak C — kwaliteitsbewaking

Elke preset heeft een verplichte `rationale` ("waarom dit assortiment") en een
`problem`. Bij een batch-preset komt die van de LLM; bij een wizard-preset wordt
hij **deterministisch samengesteld uit wat er echt gemeten is** (aantal types,
prijsbereik, hoeveel producten snel uit de EU komen) — geen LLM-tekst die mooier
klinkt dan de data rechtvaardigt.

Onder 7 producten: geen preset. Getest.

## Mock-scheiding — belangrijk

Een preset die op mock-data gebouwd is, draagt `is_mock = 1` en wordt **nooit**
aan een echte wizard-run geserveerd (`listPresets()` filtert ze standaard weg;
`findPresetForNiche` krijgt `allowMock` alleen als de adapter zelf in mock draait).
Zonder die scheiding zou een lokale testrun productie vergiftigen met
`mock-pid-...`-producten.

## Lokale verificatie — nagebootst

**`npm run verify:presets` → 30/30** (eenheden: opslag, mock-scheiding, matching,
skips, kwaliteitspoorten, deterministische terugval).

**`npm run verify:batch` → 13/13** (hele keten, CJ in mock-modus + onderschepte
DeepSeek):

```
5 categorieën behandeld → 4 presets, 1 skip
  phone-accessories    10 producten · 10 types · gem. score 9
  dog-accessories      10 producten · 10 types · gem. score 9
  fitness-equipment    10 producten · 10 types · gem. score 9
  home-organization    10 producten · 10 types · gem. score 9
  Skincare Tools       overgeslagen — te weinig aanbod: 12 producten wereldwijd (drempel 25)
✓ elke preset haalt de drempel van 7
✓ elke preset heeft een onderbouwing en een klantprobleem
✓ mock-presets zijn onzichtbaar voor de echte flow
✓ een aangemaakte preset is daarna terug te vinden — 0 CJ-calls nodig
```

Lokale meetwaarden, **niet representatief**: 16 LLM-calls (onderschept), 0
CJ-calls (mock, er ging niets over het netwerk), tussenruimte op 0ms gezet.

Regressie: `tsc --noEmit` schoon · `npm run build` 6,62s · verify presets 30 /
batch 13 / costume 22 / quality 34 / collection 15 / small 27 / assortment 23 /
efficiency 6 / relevance 14 / subdomain 15 · `vitest` 9/10 (`store.test.ts`,
bestond al).

---

# Wat er op de VPS getest moet worden — exact hoe

Niets hieronder is hier gemeten. Dit is wat we samen moeten doen zodra de tag
gedeployd is.

### 1. Bevestig dat de keys echt zijn

```bash
ssh dropships@145.239.78.174
cd /opt/dropships/app/UIcontrol
grep -c "^CJ_API_KEY=.\+" .env        # 1 = ingevuld
curl -s localhost:3001/api/suppliers/cj/status | head -c 200
```

### 2. Kleine steekproef — 3 categorieën

Begin klein: dit raakt echte rate limits. Verwacht ruwweg 2 CJ-calls per
categorie voor de scan plus ~10-15 zoekopdrachten per categorie; met 2500ms
ertussen is dat een kwestie van minuten, niet seconden. **Meet het, ga niet af
op deze schatting.**

```bash
time npm run research:batch -- --categories=3 --spacing=3000 --max-calls=200
```

Let op in de uitvoer:
- staat er `⚠ CJ draait in MOCK-modus`? Dan is de key niet geladen — stoppen.
- hoeveel `429` komt er langs? Zo ja: `--spacing=5000` en opnieuw.
- worden categorieën overgeslagen met een zinnige reden, of vallen ze allemaal om?

### 3. Bekijk wat eruit kwam

```bash
npm run research:batch -- --list
npm run research:batch -- --skips
curl -s localhost:3001/api/research/presets | head -c 2000     # via de 2FA-gate: gebruik de browser
```

Beoordeel met eigen ogen, dít is de kernvraag: **zijn de producten in een preset
echt een winkel, of een verzameling?** Kijk naar `rationale`, de producttypes en
de titels. Twijfel je bij één preset, gooi hem weg:

```bash
curl -X DELETE localhost:3001/api/research/presets/<slug>
```

### 4. Schaal op als stap 2-3 goed gingen

```bash
nohup npm run research:batch -- --categories=40 --spacing=3000 --max-calls=1500 \
  > /opt/dropships/app/batch-$(date +%F).log 2>&1 &
tail -f /opt/dropships/app/batch-*.log
```

Hervatbaar: opnieuw draaien slaat behandelde categorieën over. Begroting op:
gewoon nog een keer starten.

### 5. Test de wizard-kant

Open de wizard, typ een niche die overeenkomt met een preset (Nederlands én
Engels proberen — dat is waar de semantische laag telt). Verwacht:
- vrijwel direct resultaat in plaats van 1-3 minuten;
- in de serverlog `[wizard] preset "<slug>" gebruikt (lexicaal|semantisch) — 0 CJ-calls`.

Typ daarna iets wat er zeker níet in zit; dan hoort de live-flow te draaien en
hoort er ná afloop een nieuwe preset bij te staan (`--list`).

### 6. Wat we pas na stap 2-5 kunnen zeggen

- hoe lang een categorie werkelijk duurt;
- hoeveel CJ-calls een preset kost;
- of DeepSeek bruikbare nichebeschrijvingen levert op echte categorienamen;
- hoe vaak de kwaliteitsdrempel een categorie afkeurt;
- of de semantische matcher Nederlandse invoer in de praktijk goed koppelt.

Zolang dat niet gemeten is, staat er in dit rapport bewust geen getal over
productie.
