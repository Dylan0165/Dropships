# Skillslibrary

Eén map per agent: `<naam>/SKILL.md`. De pipeline laadt die via
`loadSkillPrompt(skillName)` in `UIcontrol/src/server/pipeline/agent.ts` en zet
de inhoud als system-prompt boven de stage-instructie.

Naast de pipeline-agents staan hier **design-skills**: regels voor het maken van
interfaces die niet als "AI-standaardwerk" aanvoelen.

## Herkomst van de design-skills

Gekopieerd op 8 augustus 2026 uit `~/.agents/skills/` (de skill-bibliotheek van
de DeepSeek Harness-installatie op de dev-machine), in het kader van FASE 1 van
`RAPPORT-DSH-INTEGRATIE.md`. Ze zijn hier ongewijzigd overgenomen zodat ze
traceerbaar blijven; zie per bestand de eigen frontmatter voor de beschrijving.

| Skill | Omvang | Gericht op |
|---|---|---|
| `taste-skill` | 40 regels | Beweging, hover, typografie, kleurdiscipline |
| `typeset` | 85 regels | Letterkeuze, hiërarchie, leesbaarheid |
| `colorize` | 108 regels | Paletopbouw, accentstrategie |
| `frontend-design` | 42 regels | Conceptuele richting, anti-generieke esthetiek |
| `high-end-visual-design` | 98 regels | "Dure" visuele taal, micro-details |
| `design-taste-frontend` | 187 regels | Componentarchitectuur, meetbare regels |
| `gpt-taste` | 63 regels | AIDA-structuur, layoutvariatie, motion |
| `critique` (+3 referenties) | 159 regels | Beoordelingskader, scoring, persona-tests |
| `audit` | 104 regels | Technische kwaliteitscontrole |
| `polish` | 170 regels | Laatste afwerkingsronde |
| `image-taste-frontend` | 806 regels | Beeld-eerst ontwerpen (vision) |

## Welke daadwerkelijk in een prompt terechtkomen

De store-builder schrijft **geen code**: hij kiest componenten uit een catalogus
en vult een design-plan (palet, typografie, signature-element, copy). Skills die
uitleggen hoe je Tailwind-bento-grids of box-shadows bouwt, zijn daarvoor niet
alleen nutteloos maar schadelijk — ze vragen om ontwerpen die de catalogus niet
kan maken.

Daarom laadt de store-builder alleen de skills waarvan de regels op zijn
*beslissingen* slaan:

- `taste-skill` — typografie- en kleurdiscipline, verboden defaults
- `typeset` — welke lettercombinaties werken
- `colorize` — hoe je een palet met rollen opbouwt

De overige skills staan klaar voor het moment dat een agent wél code of beeld
beoordeelt: de visuele keuringsloop (FASE 2) gebruikt `critique`, `audit` en
`polish`, en `image-taste-frontend` is pas zinvol met een vision-model.

## Let op: tegenstrijdige regels

`high-end-visual-design` en `frontend-design` verbieden lettertypes die het
project juist toestaat (Inter staat in de body-allowlist van
`design/design-plan.ts`). De allowlist in code is leidend: een font dat daar niet
in staat wordt door `applyDesignPlan()` vervangen. Laad die twee skills dus niet
in de store-builder-prompt zonder de allowlist te herzien — vandaar dat ze hier
alleen als referentie staan.
