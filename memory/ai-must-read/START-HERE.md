# START HERE — Dropships

> Lees dit eerst. Daarna `architecture.md`. De rest van `memory/` is naslag per
> onderwerp; `../changelog.md` vertelt wat er recent veranderd is.

## Wat is dit project?

**Dropships** is een AI-agentpipeline die volledig autonoom EU-dropshipping
webshops genereert en deployt. Input: een niche (of een wizard-gesprek). Output:
een live Next.js-store op een eigen subdomein, met CJ Dropshipping als leverancier
en Stripe als betaalprovider.

Eén repo, één VPS, één database. Alles draait op `clynado.com`.

## De 30-seconden-kaart

| Wat | Waar |
|---|---|
| Admin-dashboard (achter 2FA) | `api.clynado.com` → Express :3001 + React-bundel |
| Publiek kopers-dashboard | `clynado.com` (apex) |
| Gegenereerde stores | `<sub>.clynado.com` → nginx :80 → Next.js op :4001-4999 |
| Code van de app | `UIcontrol/` (frontend én backend zitten hier samen) |
| Store-generatie | `UIcontrol/src/server/design/` |
| Database | `UIcontrol/data/dropship.db` (SQLite, WAL) |
| Geheimen | `UIcontrol/.env` op de VPS — **nooit in git** |

## Leeswijzer

1. **`architecture.md`** — mappenstructuur, de twee servers, en de volledige flow
   van wizard → CJ → build → deploy. Begin hier als je code gaat aanraken.
2. **`how-to-cut-a-release.md`** — wanneer je wél en niet een `deploy-*` tag zet.
   **Lees dit vóór je iets tagt.** Verkeerd taggen heeft eerder 500+ ongewenste
   deploy-runs veroorzaakt.
3. **`release-and-changelog.md`** — hoe `../changelog.md` bijgehouden wordt.
4. Onderwerp-dossiers in `memory/`:
   - `dropships-infra-and-ci.md` — VPS, DNS, tunnel, PM2, runner. **Handmatig
     opgezet buiten Claude Code om; die feiten staan vast.**
   - `dropships-pipeline.md` — de 11 stages en het state machine-model
   - `dropships-components.md` — de componentbibliotheek en hoe de LLM kiest
   - `dropships-cj-integration.md` — CJ REST + MCP, en waarom MCP nooit orders doet
   - `dropships-stripe-payments.md` — checkout → webhook → fulfillment
   - `dropships-auth.md` — de 2FA-flow (werkt en is getest; niet aanraken)
5. **`../planned/`** — backlog van wat er nog moet gebeuren.

## Harde regels die je niet mag overtreden

1. **Orders lopen NOOIT via MCP.** Product-discovery mag via MCP; order-plaatsing
   gaat uitsluitend via `CJAdapter.placeOrder()`. Zie `dropships-cj-integration.md`.
2. **Checkout is een vaste, niet-varieerbare uitzondering** in het component-
   systeem. Alleen kleur/font uit het design-DNA verschilt. Zie `checkout.ts`.
3. **Geen geheimen in git.** `.env` is gitignored én untracked.
4. **Auth niet aanraken.** De 2FA-gate is gebouwd en geverifieerd (28/28 e2e).
   Nieuwe routes zitten er automatisch achter — dat is de bedoeling.
5. **Deploy-protocol volgen.** Zie `how-to-cut-a-release.md` en de sectie
   "Deploy-protocol" in `../../CLAUDE.md` (dat bestand is leidend).
6. **Alle klant-facing content is Engels**, ook bij Nederlandse wizard-input.

## Ontwikkelen

```bash
cd UIcontrol
npm run dev    # Express :3001 + store-platform :3002 + Vite :5173
npm test       # vitest
npx tsc --noEmit
```

De gebruiker communiceert in het Nederlands, wil autonome uitvoering en korte
antwoorden. Windows is de dev-machine; de VPS draait Linux. De gebruiker kan
tijdens een sessie niet zelf SSH'en — verificatie moet uit echte commando-output
komen, niet uit beweringen.
