# Samen aan Dropships werken

Eén repo, twee mensen. Dit is wat je moet weten voordat je begint.

## Waarom niet opgesplitst?

De frontend en de server praten alleen via HTTP — technisch zou een knip
kunnen. Maar ze worden als één geheel gedeployd (de server serveert de
gebouwde UI achter de 2FA-gate), en we werken allebei overal aan. In dat
geval kost opsplitsen meer dan het oplevert: één wijziging wordt dan een
pull request in drie repo's tegelijk.

## Opzetten

```bash
git clone https://github.com/Dylan0165/Dropships.git
cd Dropships/UIcontrol
npm install
```

Daarna `.env` aanmaken. Die staat **niet** in git (en dat blijft zo).
Kopieer `.env.example` uit de hoofdmap en vraag Dylan om de waarden:

```bash
cp ../.env.example .env
```

Zonder echte sleutels werkt alles nog steeds:

| Ontbreekt | Gedrag |
|---|---|
| `CJ_API_KEY` | mock-producten, geen echte leverancier |
| `LLM_API_KEY` | de agents falen met een duidelijke melding |
| `STRIPE_SECRET_KEY` | checkout in mock-modus |

Starten:

```bash
npm run dev     # Express :3001 + store-platform :3002 + Vite :5173
```

Eerste keer inloggen: ga naar `/setup/<jouwnaam>` en scan de QR met je
authenticator. Er zijn drie vaste accounts (dylan, claumi, fernando);
open registratie bestaat niet.

## De auto-push hook

`.claude/settings.json` bevat een hook die na élke Edit/Write commit en
pusht. Sinds 2 september 2026:

- hij pusht naar de **huidige branch**, niet hardgecodeerd naar `main`;
- wordt de push geweigerd omdat de ander net iets pushte, dan haalt hij
  op met `--rebase --autostash` en probeert opnieuw;
- fouten worden **niet** meer weggeslikt. Zie je een rebase-conflict, los
  het op voordat je verder werkt.

Daarvóór ging alles hardgecodeerd naar `main` met `2>$null` erachter:
bij een botsing stopte het pushen stilletjes en dacht je dat je werk
online stond terwijl het lokaal bleef liggen.

## Werken zonder elkaar in de weg te zitten

Voor kleine dingen kun je allebei op `main` werken — de hook lost
botsingen nu zelf op. Voor iets groters:

```bash
git checkout -b jouwnaam/waar-het-over-gaat
# werken; de hook pusht automatisch naar die branch
gh pr create --fill
```

Spreek af wie welk bestand oppakt. De grootste bestanden
(`src/server/index.ts`, `wizard.ts`, `product-relevance.ts`) zijn het
gevoeligst voor conflicten.

## Verifiëren voordat je iets aflevert

```bash
cd UIcontrol
npx tsc --noEmit          # moet schoon zijn
npm run build             # als je de UI hebt aangeraakt
npm run verify:costume    # en de andere verify:* die je raakt
npx vitest run
```

Er staan elf `verify:*`-scripts in `package.json`. Raak je de
relevantie-poorten aan, draai dan minstens `verify:costume`,
`verify:assortment` en `verify:relevance`.

**`store.test.ts` faalt al langer** (verwacht 'growth-agent' en
'security-agent'). Dat is geen regressie van jou.

## Deployen

Niet elke push deployt. De productie-workflow draait alleen op een
`deploy-*`/`v*` tag of handmatig via `workflow_dispatch`. Push nooit een
tag per commit — dat gaf eerder 500+ ongewenste deploy-runs.

Een tag zet je pas als alle drie waar zijn:

1. je commit staat op `origin/main`;
2. `npx tsc --noEmit` is schoon;
3. je hebt tests of runtime-checks **echt gedraaid**, met output.

```bash
git tag deploy-$(date +%Y%m%d-%H%M%S)
git push origin --tags
```

## Waar staat wat?

| Map | Inhoud |
|---|---|
| `UIcontrol/src/server/` | Express API, pipeline, suppliers, research, marketing |
| `UIcontrol/src/components/` | React-dashboard |
| `UIcontrol/scripts/` | verificatie- en onderzoeksscripts |
| `Skillslibrary/` | de agent-prompts (SKILL.md per agent) |
| `memory/` | projectgeheugen: changelog, dossiers, verificatie-logs |
| `scripts/` | VPS-provisioning |

Begin bij `CLAUDE.md` in de hoofdmap en daarna
`memory/ai-must-read/START-HERE.md`.
