# Changelog-afspraken

## Waar

`memory/changelog.md`. Eén bestand, nieuwste bovenaan.

## Wanneer bijwerken

Bij elke **afgeronde, geverifieerde fase of taak** — hetzelfde moment waarop je
volgens `how-to-cut-a-release.md` een `deploy-*` tag zet. Changelog-regel en tag
horen bij elkaar: als er een tag is, hoort er een regel te zijn.

Niet bij tussentijdse commits. De `auto: <timestamp>`-commits zijn ruis en horen
niet in de changelog.

## Formaat

```markdown
## <YYYY-MM-DD> — <korte titel>
**Tag:** `deploy-YYYYMMDD-HHMMSS`

- Wat er is toegevoegd/veranderd, in gewone taal.
- Waarom, als dat niet vanzelf spreekt.
- **Breaking:** wat er stukgaat als je oude aannames houdt (alleen als van toepassing).
- **Geverifieerd:** welke check daadwerkelijk gedraaid heeft, met de kern van de output.
```

## Regels

1. **Schrijf voor je toekomstige zelf, niet voor een release-notes-pagina.**
   "Poort-allocatie kiest nu de laagste vrije poort" is nuttig. "Diverse
   verbeteringen" is dat niet.
2. **Noem het bestand of de module** waar de verandering zit. Dan is de link naar
   de code één grep ver.
3. **Vermeld beslissingen, niet alleen wijzigingen.** Als je iets bewust níet
   hebt gedaan, of een alternatief hebt afgewogen, hoort dat erbij — dat is
   precies wat je over drie maanden kwijt bent.
4. **"Geverifieerd" is letterlijk.** Zet erbij wat er echt gedraaid heeft
   (`28/28 e2e`, `tsc schoon`, `3 stores gebouwd`). Als iets niet te verifiëren
   was, zet dat er ook bij.
5. Geen versienummers. Tags zijn tijdstempels; `UIcontrol/package.json` blijft
   op `0.1.0` en wordt niet als versiebron gebruikt.

## Verhouding tot de onderwerp-dossiers

De changelog is **chronologisch**: wat er wanneer gebeurde. De dossiers
(`memory/dropships-*.md`) zijn **actueel**: hoe het nu werkt. Bij een wijziging
werk je allebei bij — de changelog krijgt een regel, het dossier wordt herschreven
naar de nieuwe waarheid. Laat geen verouderde beschrijvingen in de dossiers staan
"omdat het historisch klopte"; daar is de changelog voor.
