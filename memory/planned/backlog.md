# Backlog

Wat er nog open staat. Afgerond werk verhuist naar `../changelog.md` en het
bijbehorende dossier.

## Componentbibliotheek — verdere uitbreiding

De catalogus is uitgebreid naar een veel groter aantal varianten per categorie
(zie `../dropships-components.md`). Wat daarna nog kan:

- **Meer productweergaven** voor grote collecties (12-15 producten): filterbare
  grid, categorie-tabs.
- **Per-niche icon-sets.** De custom SVG-iconen zijn nu thematisch gegroepeerd;
  een fijnere koppeling niche → icoonset zou de herkenbaarheid verhogen.
- **Componentprestatie meten.** Er is al een `component_experiments`-tabel en een
  `component-lab.ts`. Die is nog niet gekoppeld aan de nieuwe catalogus — de
  logische volgende stap is conversie per componentkeuze bijhouden en de selectie
  daarop laten sturen in plaats van alleen op toon en seed.
- **Uniqueness-check uitbreiden naar sectievolgorde.** De combinatiehash dekt nu
  layout × hero × topbar × animatie × palet × fontpaar. De volgorde van de body-
  secties zit er nog niet in.

## Store-beheer

- **Bulk-acties**: meerdere stores tegelijk pauzeren of verwijderen.
- **Diff-preview vóór redeploy**: laten zien wat er verandert voordat een
  tekst-/prijsbewerking live gaat.
- **Undo op prijswijzigingen** — nu is een verkeerde bulk-prijsactie alleen
  handmatig terug te draaien.

## Infrastructuur

- **`mollie.ts` verwijderen** zodra Stripe live is getest met een echte
  transactie. De webhook is nu nog gemount.
- **Staging-omgeving.** Nu is er alleen productie; elke geverifieerde tag gaat er
  direct op. Een tweede PM2-set op andere poorten zou tag-deploys eerst kunnen
  opvangen.
- **Backup van `dropship.db`.** Er is geen automatische backup. WAL-modus maakt
  een `sqlite3 .backup` tijdens runtime veilig; dat staat nog niet in cron.

## Observability

- De kosten-aggregatie (`/api/obs/costs`) telt LLM-kosten. Deploy- en
  hostingkosten per store zitten er niet in, waardoor ROAS per store een
  onvolledig beeld geeft.
