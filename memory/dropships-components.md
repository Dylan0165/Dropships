# Componentbibliotheek — "combineren in plaats van genereren"

Het uitgangspunt: de store-builder-LLM schrijft **geen** ruwe JSX. Hij **kiest en
configureert** vooraf gebouwde, geteste componenten uit een catalogus. Dat maakt
de output betrouwbaar (geen syntaxfouten, geen kapotte layouts) én stuurbaar.

## Waar

`UIcontrol/src/server/design/components/`

| Bestand | Wat |
|---|---|
| `types.ts` | `ComponentDef`, `RenderCtx`, gedeelde helpers (`txt`, `j`, `reveal`, `am`, `styleTokens`, `dnaCssVars`) |
| `registry.ts` | verzamelt alle definities; `catalogForPrompt()` levert de LLM-facing catalogus (metadata, **geen** broncode); gooit bij dubbele id's |
| `heroes.ts` `products.ts` `sections.ts` `sections-extended.ts` `chrome.ts` `topbars.ts` | de componentdefinities per groep |
| `icons.ts` | eigen SVG-lijniconen per nichethema (`stroke`, dus animeerbaar) |
| `base-css.ts` | kwaliteitsbodem: focus-ring, reveal-varianten, hero-orkestratie, reduced-motion |
| `selection.ts` | valideert de LLM-keuze tegen de registry; leidt anders een selectie af |
| `assemble.ts` | voegt deterministisch samen tot `app/page.tsx` + CSS-ontdubbeling + conflict-audit |
| `checkout.ts` | de vaste uitzondering (zie onder) |

Daarnaast, één niveau hoger in `design/`:

| Bestand | Wat |
|---|---|
| `anime-presets.ts` | bewegingskarakters + de Anime.js-runtime die in elke pagina komt |
| `sanitize.ts` | emoji-filter en stijlruimte-definitie |
| `uniqueness.ts` | combinatie-hash + botsingsafhandeling |

## Omvang

**106 componenten**, minstens 8 varianten per categorie:

| Categorie | Aantal | | Categorie | Aantal |
|---|---|---|---|---|
| hero | 12 | | testimonials | 9 |
| topbar | 12 | | cta | 9 |
| content | 12 | | nav | 9 |
| products | 10 | | footer | 9 |
| badges | 8 | | gallery | 8 |
| form | 8 | | | |

Met stijl- en animatievarianten erbij zijn dat 251 concrete instanties.

## Topbars — per niche, niet willekeurig

De topbar is een eigen categorie boven de nav, en een van de sterkste signalen
van wat voor winkel dit is. `TOPBAR_BY_THEME` in `topbars.ts` koppelt elk
nichethema aan de passende varianten: sport krijgt `energy-ticker` of
`bold-statement`, wellness `calm-line` of `rotating-soft`, huishouden
`practical-columns`, tech `status-strip`. De LLM mag zelf kiezen; dit is de
bodem, niet het plafond.

Het thema komt uit `iconThemeFor(niche, interests)` en stuurt óók de iconen.

## Beweging — Anime.js v4

`anime-presets.ts` definieert zes **bewegingskarakters** (calm-glide, crisp-snap,
warm-swell, bold-sweep, playful-pop, editorial-fade), elk een samenhangende set
parameters voor elf families (`words`, `chars`, `lift`, `grid`, `draw`, `count`,
`mask`, `blur`, `scale`, `slide`, `float`).

Componenten markeren elementen declaratief met `data-am="<familie>"`. Eén
generieke runtime leest het per-store plan (`AM_PLAN`) en voert het uit. Twee
stores die dezelfde componenten kiezen bewegen dus tóch anders — beweging is een
eigen variatie-as.

Waarom karakters en niet losse parameters per familie: losse randomisatie gaf
incoherente sites (trage zware hero, stuiterende kaarten eronder).

**Veiligheid gaat vóór effect:**

- `prefers-reduced-motion` → de runtime doet **niets**. Geen kortere animatie,
  géén animatie.
- Elementen zijn zichtbaar in de basis-CSS. Pas als Anime.js aantoonbaar geladen
  is wordt de verbergende class `am-armed` gezet — een mislukte import laat dus
  niets onzichtbaar achter.
- Een failsafe-timer (1,8s) haalt `am-armed` er sowieso af.
- `splitText` draait met `accessible: true`, dus screenreaders lezen de kop als
  één zin.

`animejs@^4.5.0` staat in de `package.json` van elke gegenereerde store.

## Uniciteit is afgedwongen, niet gehoopt

`uniqueness.ts` hasht zes assen — layout × hero × topbar × animatiekarakter ×
palet × fontpaar — naar een sleutel met een UNIQUE-index in `store_combinations`.
Botst een nieuwe store, dan draait `ensureUniqueCombination` achtereenvolgens aan
hero, topbar en bewegingskarakter tot de hash vrij is.

Palet en fonts blijven bewust ongemoeid: die komen uit de persona en de
art-direction, en dáár aan sleutelen zou de store minder passend maken dan een
andere hero-variant.

De anti-herhaling in `layout.ts` blijft bestaan, maar kijkt alleen naar de laatste
tien layouts en per as apart. Dat voorkomt "de vorige twee zagen er zo uit", niet
dat store 3 en store 40 identiek uitvallen.

## Hoe een store tot stand komt

```
persona ──► tokens.ts        seeded design-DNA (palet, typografie, radius, toon)
            design-plan.ts   LLM-artdirection eroverheen, gevalideerd
            layout.ts        layout-varianten + anti-herhaling (layout_history)
                 │
                 ▼
     catalogForPrompt() gaat als input mee naar de store-builder-LLM
                 │
        LLM levert { nav, sections[], footer, style }
                 │
            selection.ts     valideert tegen de registry; ongeldig → afgeleide keuze
                 ▼
            assemble.ts      → app/page.tsx
                 │  faalt de audit of te weinig componenten
                 ▼
            render-page.ts   terugval op de oude renderer (store crasht nooit)
```

## Design-DNA en CSS-variabelen

Alles hangt aan **CSS-variabelen** uit het design-DNA — nooit hardgecodeerde
kleuren of fonts:

```
--c-bg --c-surface --c-surface-alt --c-text --c-muted
--c-primary --c-primary-text --c-secondary --c-accent --c-border
--f-head --f-body --fw-head --fw-body --tt-head --ls-head
--r-sm --r-md --r-lg --r-pill --r-btn --bw --shadow
```

`dnaCssVars(dna)` genereert die declaraties. Eén store = één DNA = consistente
kleuren en typografie over álle componenten, ongeacht welke gekozen zijn.

## Varianten-assen

Elk component heeft meerdere assen, waardoor dezelfde keuze er anders uit kan zien:

| As | Waarden |
|---|---|
| **Stijl** | `minimal` / `bold` / `playful` / `editorial` |
| **Animatie** | `none` / `subtle` / `expressive` |
| **Structuur** | de component-id zelf (bv. `hero.split-left` vs `hero.editorial`) |

`styleTokens(style)` vertaalt de stijl naar concrete spacing-, schaal- en
gewichtstokens, zodat "bold" overal hetzelfde betekent.

## De catalogus is metadata-only

`buildCatalog()` strípt de `render`-functie eruit. De LLM ziet id, label,
ondersteunde stijlen, tags en de props-namen — nooit de broncode. Dat houdt de
prompt klein en maakt het onmogelijk dat de LLM de rendering "een beetje aanpast".

## Kwaliteitsbodem (altijd aanwezig, ongeacht keuze)

- Zichtbare `:focus-visible`-ring voor toetsenbordnavigatie
- `prefers-reduced-motion: reduce` schakelt álle beweging uit; content blijft staan
- Responsive bodem: multi-kolom grids vallen onder 820px terug naar één kolom
- CSS wordt ontdubbeld en op conflicten geaudit (`auditCss`: dezelfde
  selector+property met een andere waarde)

## Checkout — de vaste uitzondering

`components/checkout.ts` documenteert waarom: checkout zit **niet** in de
catalogus, kent **geen** LLM-keuze en **geen** varianten.
`buildCheckoutAndInfoPages` in `template-engine.ts` voegt het altijd toe. Alleen
kleur en font komen uit het DNA — structuur, velden en flow zijn in élke store
identiek.

Reden: de checkout is het enige punt waar geld en adresgegevens langskomen.
Variatie daar levert geen merkwaarde op en wél conversierisico en een groter
testoppervlak.

## Anti-generiek

**Emoji worden hard geweerd.** `sanitizeCopyDeep()` in `design/sanitize.ts` loopt
door de complete brief vóór er iets gerenderd wordt en strípt elk emoji uit elke
string, met een rapport van wat er geblokkeerd is. De skill-prompts vragen er ook
om, maar een prompt-instructie is een verzoek — dit is de garantie. Legitieme
typografie (€, ©, %, —) blijft staan.

**De drie AI-default looks** zijn verboden in de skill-prompt en meetbaar
gecontroleerd door `detectDefaultLook()` in `design-plan.ts`:

| | Look | Detectie |
|---|---|---|
| a | crème + terracotta | lichte warme bg + terracotta accent/primary |
| b | near-black + één neon | zeer donkere bg + hoog-verzadigd accent op dezelfde hue |
| c | krantenstijl | bijna-wit + bijna-zwart + kleurloos palet + serif-kop |

Variant (c) kijkt naar palet én lettertype: elk element apart is prima, de
combinatie is wat elke AI-webshop krijgt als er geen richting gekozen wordt.

**Stijlruimte.** `ALLOWED_STYLE_SPACE` in `sanitize.ts` legt vast wat een store
mag zijn: clean, modern, warm, premium, playful-but-polished. Buiten de grenzen:
brutalist, anti-design, glitch, grunge, chaotisch. Een webshop moet vertrouwd
worden, niet bewonderd.

**Iconen** zijn eigen SVG-lijntekeningen per nichethema (`icons.ts`), geen
icon-font en geen stock-set — precies die uitwisselbaarheid willen we vermijden.

Alle klant-facing content is **Engels**, ook bij Nederlandse wizard-input.

## Regressietests

```bash
npm run verify:components   # elk component × elke stijl → 1 store → next build
npm run verify:variation    # 3 stores → unieke hashes, anime.js, emoji-filter
```

`verify:components` is de belangrijkste: een gewone store kiest maar ~10 van de
106 componenten, dus zonder deze test blijft een JSX-fout in een zelden gekozen
variant jarenlang onopgemerkt. Hij heeft bij invoering direct drie echte
compileerfouten gevonden.

## Debug

Per store wordt `design-dna.json` weggeschreven met het DNA, het toegepaste
design-plan, de gebruikte componenten, de bron van de selectie (`llm` of
`derived`) en eventuele CSS-conflicten. Dat is het eerste bestand om te openen
als een store er niet uitziet zoals bedoeld.
