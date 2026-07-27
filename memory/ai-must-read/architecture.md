# Architectuur

## Mappenstructuur

```
d:\Dropshippingv0.1tool\            (dev, Windows)  ↔  /opt/dropships/app (VPS)
├── CLAUDE.md                       ← leidende projectinstructies
├── memory/                         ← dit geheugen-systeem
├── scripts/
│   ├── provision-vps.sh            ← hardening + install + nginx-model
│   ├── cloudflared-named-tunnel.md ← named tunnel + wildcard DNS
│   └── cloudflared-manager.cjs     ← LEGACY (quick tunnel, schoolomgeving)
├── .github/workflows/deploy.yml    ← self-hosted runner, tag/dispatch-only
├── Skillslibrary/                  ← 15 agent SKILL.md-bestanden (prompts)
└── UIcontrol/                      ← de hele applicatie
    ├── data/dropship.db            ← SQLite (WAL), single source of truth
    ├── .env                        ← geheimen (gitignored + untracked)
    └── src/
        ├── server/                 ← Express + WebSocket
        └── components/ hooks/ types/  ← React-frontend
```

**Belangrijk:** frontend en backend zitten in dezelfde `UIcontrol/`-map en delen
`src/types/index.ts`. Vite bouwt de frontend naar `UIcontrol/dist/`; Express
serveert die map statisch (SPA-fallback voor niet-`/api/*` GET-routes).

## uicontrol vs store-platform

Twee PM2-processen, twee verantwoordelijkheden:

| | `uicontrol` (:3001) | `store-platform` (:3002) |
|---|---|---|
| Entrypoint | `src/server/index.ts` | `src/server/store-platform.ts` |
| Doet | API + WebSocket + auth-gate + serveert de React-bundel + draait de pipeline | Build/deploy-machinerie voor gegenereerde stores |
| Publiek via | `api.clynado.com` (tunnel) | niet publiek — intern |

De gegenereerde stores zelf zijn een derde categorie: elk een eigen Next.js-app
met een eigen PM2-proces op een eigen poort in 4001-4999.

## Servermodel (één VPS)

```
internet
   │  Cloudflare (DNS + TLS)
   ▼
cloudflared named tunnel 'dropships'  (systemd)
   ├── api.clynado.com  →  127.0.0.1:3001   (uicontrol: admin + API + webhooks)
   └── *.clynado.com    →  127.0.0.1:80     (nginx)
                                │
                                ├── clynado.com (apex)   → kopers-dashboard
                                └── <sub>.clynado.com    → store op :4001-4999
```

Stores luisteren op 127.0.0.1:<poort> en zijn **niet** direct van buiten
bereikbaar — alleen nginx praat met ze. TLS eindigt bij Cloudflare.

## Deploy-architectuur

`store-platform/deploy.ts` is een **dispatcher**. `deployTargetKind()` bepaalt:

| Modus | Wanneer | Wat er gebeurt |
|---|---|---|
| `preview` | `DEPLOY_MODE` leeg (dev-machine) | build wel, geen nginx |
| `local` | `DEPLOY_MODE=local` (VPS, default) | `deploy-local.ts`: lokale fs-operaties |
| `ssh` | `DEPLOY_MODE=ssh` (legacy school) | `deploy-ssh.ts`: SSH + rsync |

**Lokale deploy** (het normale pad): release-directory wegschrijven onder
`STORES_ROOT`, dan een **atomaire symlink-swap** van `current`. Eén
`<sub>.conf` in `NGINX_CONF_DIR` (een app-owned include-dir; nginx.conf doet
`include .../dropships.d/*.conf`). De enige sudo-actie is `NGINX_RELOAD_CMD`.
Poort-conflictdetectie, scan en audit lezen de lokale conf-bestanden — geen SSH.

## Pipeline-flow: wizard → CJ → build → deploy

```
1. WIZARD (UIcontrol/src/components/wizard/, server/wizard.ts)
   niche-keuze → AI-vragen → richtingen → shortlist → structuur
   Optioneel: AI-niches uit CJ-voorraad (server/niche-discovery.ts, 24h cache)
        │  wizardConfig
        ▼
2. PIPELINE START  POST /api/pipeline/start
   pipeline/engine.ts draait 11 stages sequentieel, persist na elke stage
   Bij wizard-run worden stage 1-4 ge-short-circuit (keuzes staan al vast)
        │
        ├─ CJ PRODUCT-SOURCING (suppliers/)
        │    MCP-discovery eerst (cj-mcp-search.ts) → REST-fallback (cj-adapter.ts)
        │    Wereldwijde warehouse-scope; EU is voorkeur/label, geen filter
        │
        ├─ BRAND + CONTENT (deepseek-chat, hoge temperature)
        │    Alles Engelstalig, ook bij Nederlandse input
        │
        ▼
3. STORE-BUILD (pipeline/store-builder.ts + server/design/)
   design/tokens.ts       → seeded design-DNA uit persona
   design/design-plan.ts  → LLM-artdirection eroverheen (gevalideerd)
   design/layout.ts       → layout-varianten + anti-herhaling (layout_history)
   design/components/     → LLM KIEST componenten uit de catalogus
   design/components/assemble.ts → deterministische samenvoeging → app/page.tsx
   Faalt de assemblage → terugval op design/render-page.ts (oude renderer)
   store-platform/template-engine.ts voegt checkout + infopagina's toe
        ▼
4. BUILD-VALIDATE  npm install + tsc + next build (build-validator.ts)
        ▼
5. DEPLOY  poort via db.allocatePort() → release-dir → symlink-swap → nginx reload
        ▼
6. HEALTH-CHECK  HTTP-probe met retries → store status live
```

## Kernbestanden per verantwoordelijkheid

| Verantwoordelijkheid | Bestand |
|---|---|
| Alle API-routes + WS-server | `server/index.ts` |
| DB-schema, migraties, **poort-allocatie** | `server/db.ts` |
| Auth (bcrypt + TOTP + sessies) | `server/auth.ts`, `server/auth-routes.ts` |
| Pipeline state machine | `server/pipeline/engine.ts` |
| LLM-executor + Zod-validatie + retry | `server/pipeline/agent.ts` |
| Design-DNA / artdirection / layout | `server/design/tokens.ts`, `design-plan.ts`, `layout.ts` |
| Componentbibliotheek | `server/design/components/` |
| CJ-leverancier | `server/suppliers/cj-adapter.ts` (+ `cj-mcp-*.ts`) |
| Betaling | `server/stripe.ts` (Mollie = legacy) |
| Order → CJ | `server/fulfillment.ts` |
| Env-loading (root + UIcontrol) | `server/load-env.ts` |
| Publieke URL / tunnel | `server/public-url.ts` |

## Beslissingen die vastliggen (en waarom)

- **Lokale fs-deploy i.p.v. SSH-naar-jezelf.** Bij één server is SSH naar
  localhost onnodige complexiteit en een extra faalpunt. De SSH-implementatie
  blijft bestaan als `deploy-ssh.ts` voor de legacy-schoolomgeving.
- **Named tunnel i.p.v. quick tunnel.** Quick tunnels geven bij elke herstart een
  nieuwe URL, waardoor betaalprovider-webhooks braken. De named tunnel + wildcard
  DNS is stabiel en dekt élke store zonder per-store DNS-werk.
- **Auth-pagina's zijn server-rendered HTML**, geen React-routes. Daardoor kan de
  hele SPA-bundel achter de gate; een niet-ingelogde bezoeker krijgt het
  dashboard nooit binnen.
- **De database is de bron voor poort-allocatie**, niet de nginx-conf. De conf
  wordt wel meegelezen als `reservedPorts` zodat een stale DB geen poort uitdeelt
  die de server al gebruikt.
- **CI deployt niet op push.** De auto-push-hook commit bij elke edit; push-
  triggered deploys leverden 500+ ongewenste runs op.
