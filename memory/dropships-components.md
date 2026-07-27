# Componentbibliotheek — "combineren in plaats van genereren"

Het uitgangspunt: de store-builder-LLM schrijft **geen** ruwe JSX. Hij **kiest en
configureert** vooraf gebouwde, geteste componenten uit een catalogus. Dat maakt
de output betrouwbaar (geen syntaxfouten, geen kapotte layouts) én stuurbaar.

## Waar

`UIcontrol/src/server/design/components/`

| Bestand | Wat |
|---|---|
| `types.ts` | `ComponentDef`, `RenderCtx`, gedeelde helpers (`txt`, `j`, `reveal`, `styleTokens`, `dnaCssVars`) |
| `registry.ts` | verzamelt alle definities; `catalogForPrompt()` levert de LLM-facing catalogus (metadata, **geen** broncode) |
| `heroes.ts` `products.ts` `sections.ts` `chrome.ts` | de componentdefinities per groep |
| `base-css.ts` | kwaliteitsbodem: focus-ring, reveal-varianten, hero-orkestratie, reduced-motion |
| `selection.ts` | valideert de LLM-keuze tegen de registry; leidt anders een selectie af |
| `assemble.ts` | voegt deterministisch samen tot `app/page.tsx` + CSS-ontdubbeling + conflict-audit |
| `checkout.ts` | de vaste uitzondering (zie onder) |

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

De skill-prompt verbiedt expliciet de drie herkenbare AI-default looks:
crème+terracotta+serif, near-black+één neon, krantenstijl. `detectDefaultLook()`
in `design-plan.ts` is de heuristische controle daarop. Er is een verplichte
zelfcheck in `design_rationale`.

Alle klant-facing content is **Engels**, ook bij Nederlandse wizard-input.

## Debug

Per store wordt `design-dna.json` weggeschreven met het DNA, het toegepaste
design-plan, de gebruikte componenten, de bron van de selectie (`llm` of
`derived`) en eventuele CSS-conflicten. Dat is het eerste bestand om te openen
als een store er niet uitziet zoals bedoeld.
