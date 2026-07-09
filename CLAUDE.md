# Dropshipping v0.1 Tool — Project Context

## Wat is dit?
AI agent pipeline die automatisch EU dropshipping webshops genereert en deployt.
Input: een niche keyword. Output: een live Next.js store + Meta ads, volledig autonoom.

## Repo structuur
```
d:\Dropshippingv0.1tool\          ← Windows dev machine
├── UIcontrol/                     ← Hoofdapp (alles zit hier)
│   ├── src/
│   │   ├── server/                ← Express API + WebSocket (port 3001)
│   │   │   ├── index.ts           ← Alle routes (26+), WS server
│   │   │   ├── db.ts              ← SQLite schema + migrations
│   │   │   ├── store.ts           ← In-memory run cache
│   │   │   ├── deepseek.ts        ← DeepSeek API wrapper
│   │   │   ├── pipeline/          ← Pipeline state machine
│   │   │   │   ├── engine.ts      ← Runt 11 stages sequentieel, persist na elke stage
│   │   │   │   ├── agent.ts       ← LLM executor + Zod validatie + retry backoff
│   │   │   │   ├── reviewer.ts    ← Reviewer schema: {verdict, reason, score, suggestions}
│   │   │   │   ├── stages.ts      ← Per-stage runners + Zod schemas
│   │   │   │   ├── store-builder.ts ← Content brief → Next.js template
│   │   │   │   ├── deployer.ts    ← SSH+rsync deploy naar store server
│   │   │   │   ├── events.ts      ← EventEmitter per runId
│   │   │   │   ├── types.ts       ← STAGES, PipelineState, StageState
│   │   │   │   └── index.ts       ← Publieke API: startRun, pauseRun, resumeRun, stopRun
│   │   │   ├── store-platform/
│   │   │   │   ├── deploy.ts      ← atomicDeploy via SSH naar 192.168.121.11
│   │   │   │   ├── build-validator.ts ← npm install + tsc + next build
│   │   │   │   └── template-engine.ts ← HTML generator
│   │   │   ├── suppliers/         ← SupplierAdapter pattern
│   │   │   │   ├── types.ts       ← SupplierAdapter interface + EU_WAREHOUSES
│   │   │   │   ├── cj-adapter.ts  ← CJ Dropshipping API v2 (token cache, rate limits, sandbox/mock)
│   │   │   │   └── index.ts       ← getSupplier('cj') registry
│   │   │   ├── fulfillment.ts     ← Mollie paid → CJ placeOrder (retry, tracking)
│   │   │   ├── wizard.ts          ← Store-wizard AI endpoints (vragen/richtingen/shortlist/structuur)
│   │   │   ├── meta-ads.ts        ← Meta Ads API
│   │   │   ├── mollie.ts          ← Mollie payment webhooks (+ customer_json, → fulfillment)
│   │   │   ├── whatsapp.ts        ← WhatsApp notificaties bij escalatie
│   │   │   ├── trendscraper.ts    ← Proxy naar Python trendscraper (port 8001)
│   │   │   ├── store-lifecycle.ts ← Store health + ROAS tracking
│   │   │   ├── ad-manager.ts      ← Ad campagne orchestratie
│   │   │   ├── component-lab.ts   ← A/B testing componenten
│   │   │   └── skills-updater.ts  ← Agent performance tracking
│   │   ├── components/
│   │   │   ├── wizard/            ← StoreWizard (4-staps AI wizard, vervangt niche-input)
│   │   │   ├── pipeline/          ← PipelineCanvas, StageNode, StageDrawer (@xyflow/react)
│   │   │   ├── trendscraper/      ← TrendScraper UI (5 componenten)
│   │   │   └── views/             ← PipelineCanvas, RunsView, StoresView, AdManagerView,
│   │   │                             ObservabilityView, SettingsView, TrendScraperView
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts    ← Auto-reconnect, heartbeat 25s
│   │   │   └── usePipeline.ts     ← Pipeline state
│   │   └── types/index.ts         ← Alle gedeelde TypeScript types
│   ├── data/dropship.db           ← SQLite database (WAL mode)
│   └── package.json
└── Skillslibrary/                 ← 15 agent SKILL.md bestanden
```

## Tech stack
- **Frontend:** React 18, Vite 5, TypeScript, Tailwind CSS, @xyflow/react (pipeline canvas)
- **Backend:** Express 4, WebSocket, better-sqlite3, Zod 4, tsx
- **LLM:** DeepSeek (`deepseek-chat` voor executors, `deepseek-reasoner` voor reviewers + store-builder)
- **Deploy:** GitHub Actions → PM2 op 192.168.121.133, stores op 192.168.121.11 via SSH+rsync

## Pipeline (11 stages in volgorde)
```
1. trend-discovery     (deepseek-chat)     — EU niches ontdekken
2. niche-review        (deepseek-reasoner) — APPROVED/REJECTED/UNCERTAIN
3. product-research    (deepseek-chat)     — 3-5 producten sourcen
4. product-review      (deepseek-reasoner) — Beste product kiezen
5. brand-creation      (deepseek-chat)     — Naam, slogan, kleuren, USPs
6. content-generation  (deepseek-chat)     — Product beschrijvingen
7. store-build         (deepseek-reasoner) — Content brief voor Next.js template
8. build-validate      (geen LLM)          — npm install + tsc + next build
9. deploy              (geen LLM)          — SSH+rsync naar store server
10. health-check       (geen LLM)          — HTTP probe met retries
11. growth             (deepseek-chat)     — Groei analyse
```

Reviewer output schema (locked): `{ verdict: "APPROVED"|"REJECTED"|"UNCERTAIN", reason, score: 0-100, suggestions[] }`
- APPROVED → volgende stage
- UNCERTAIN → pause + human review via ApprovalApp
- REJECTED → pipeline failed

## Servers
| Server | IP | Doel |
|---|---|---|
| Tool server | 192.168.121.133 | Draait UIcontrol via PM2 |
| Store server | 192.168.121.11 | Gedeployde Next.js stores |

**PM2 services op tool server:**
- `uicontrol` — port 3001 (API+WS) + 5173 (UI)
- `store-platform` — port 3002
- `trendscraper` — port 8001 (Python FastAPI, aparte service)
- `inspector` — port 8002
- `approvalapp` — port 5174

**SSH key voor deploy:** `/home/student/.ssh/deploy_key` (user: `student`)

## Store generatie & variatie (sinds juli 2026)
- Stores worden NIET meer uit 5 vaste `.tmpl` templates gekozen, maar programmatisch
  gegenereerd door `server/design/`:
  - `tokens.ts` — design-DNA per store (palette/typografie/radius/spacing/**tone**) afgeleid
    van de persona (prijsklasse/leeftijd/niche/interesses), seeded op runId → reproduceerbaar
  - `layout.ts` — hero/product/sectie-varianten + **anti-herhaling** via `layout_history` tabel
  - `render-page.ts` — genereert `app/page.tsx`; 5 hero-varianten, 4 product-weergaven,
    6 sectie-volgordes, 3 nav- + 3 footer-stijlen. Structuur verschilt letterlijk per store.
  - `content-en.ts` — Engelse reviews/story/cta/badges/nav (seeded)
  - `design-plan.ts` — **LLM art-direction** (sinds 9 juli 2026): de store-builder LLM levert per
    store een `design`-blok in de brief (4-6 benoemde kleuren mét rollen, display+body font uit een
    gecureerde Google-Fonts allowlist, hero/product/sectie-voorkeur, één signature-element uit:
    ticker-band / outline-word / floating-badge / gradient-orb / pattern-divider / numbered-collection).
    `applyDesignPlan()` valideert (WCAG-contrast-guard, font-allowlist) en legt het over het seeded
    DNA (dat vangnet blijft). SKILL.md verbiedt de 3 AI-default looks (crème+terracotta+serif /
    near-black+één neon / krantenstijl) + verplichte zelf-check in design_rationale.
    Renderer heeft: hero-orkestratie (gefaseerde opkomst hi-1..4 + hi-img), reveal-varianten per
    sectietype (up/fade + stagger, niet alles fade-up), subtiele hovers, `:focus-visible` ring,
    `prefers-reduced-motion` support. Plan + warnings staan in design-dna.json.
  - Collectie-grootte varieert **6-15 producten per store** (`deriveProductCount` in layout.ts,
    seeded; impulse 6-10 / considered 9-15). `fitProducts` vult thin sourcing aan tot min. 6
    met unieke display-ids (supplier-velden gelijk → fulfillment blijft correct). `MAX_PRODUCTS_PER_STORE`
    default nu 15; product-agent sourcet 8-15, wizard-shortlist idem.
- **Alle klant-facing content is Engelstalig**, ook bij Nederlandse wizard-input. Skill-prompts
  (brand/content/store-builder) zeggen expliciet "all text in English" + anti-generiek.
- Per-stage temperature in `agent.ts`: creatief (brand 0.95 / content 0.85 / store-build 0.9),
  data laag (product 0.3). `renderStore` en `writeNextScaffold` (CMS-rebuild) delen dezelfde renderer.
- `design-dna.json` wordt per store weggeschreven (debug/reproduceerbaarheid).
- Store slugs zijn Engels: `/checkout/ /thank-you/ /about/ /contact/ /faq/ /returns/`.

## Supplier / checkout flow (sinds juli 2026)
- `CJ_EMAIL`/`CJ_API_KEY`/`CJ_ENV` in .env — geen key = mock-modus; `sandbox` = orders aanmaken maar nooit betalen; `production` = payBalance na createOrderV2
- Checkout: store `/checkout/` pagina (adresformulier) → POST `/api/checkout/session` (met `customer` + `redirectUrl`) → Mollie → webhook paid → `fulfillment.ts` → `getSupplier('cj').placeOrder()`
- Wizard-run: POST `/api/pipeline/start` met `wizardConfig` → trend/niche/product stages worden ge-short-circuit, persona gaat mee naar brand/content agents
- Key endpoints: `/api/wizard/*`, `/api/suppliers/cj/*`, `/api/orders` (+ `/:id/fulfill`, `/:id/tracking`), `DELETE /api/stores/:storeId`
- Gegenereerde stores hebben nu ook `/bedankt/`, `/over/`, `/contact/`, `/faq/`, `/retour/` en `trailingSlash: true`

## CJ MCP integratie — ALLEEN product-discovery (sinds juli 2026)
- **MCP is read-only discovery, NOOIT orders.** Orders/tracking blijven 100% op `CJAdapter.placeOrder()/getTracking()` REST (`fulfillment.ts` raakt MCP niet).
- `suppliers/cj-mcp-client.ts`: remote HTTPS StreamableHTTP (`https://developers.cjdropshipping.cn/mcp/<token>`), SDK `@modelcontextprotocol/sdk`. Token = `CJ_MCP_TOKEN` óf (default) `CJ_API_KEY`. Uitzetten met `CJ_MCP_DISABLED=1`.
- **Harde allowlist** `CJ_MCP_DISCOVERY_TOOLS` = {search_products, query_sku_details, calculate_freight, get_logistics_timeliness, get_warehouses}. `callDiscoveryTool()` gooit `McpForbiddenToolError` op alles daarbuiten (create_order/add_to_cart/*_dispute/merge_orders/get_order_list…) — default-deny, vóór servercontact. `listDiscoveryTools()` filtert order-tools weg zodat de LLM ze nooit ziet.
- `suppliers/cj-mcp-search.ts`: `mcpProductDiscovery()` — DeepSeek roept zelf `search_products` aan (agentic loop, max 5 rondes); onze `isRelevantToQuery` + EU-warehouse voorkeur draaien er bovenop. Faalt MCP → `McpUnavailableError`.
- `wizard.ts buildShortlist` → `discoverCandidates`: **MCP eerst, val terug op REST** (deriveSearchTerms + `adapter.searchProducts`). Response bevat `source: 'mcp'|'rest'|'mock'`. Status: `GET /api/suppliers/cj/mcp/status`. Handmatig "Zelf zoeken" blijft REST (directe keyword).

## Niche-discovery / CJ-catalogus verkenning (sinds juli 2026)
- **Warehouse-scope is WERELDWIJD; EU is een label/voorkeur, geen filter** (sinds 9 juli 2026).
  `searchProducts` doet EU-passes + één globale pass; resultaten EU-eerst gesorteerd
  (`sortByShippingPreference`). `shippingDaysFor(warehouse)`: EU 3-8d, US/UK 7-14d, CN/onbekend 15-30d.
  UI toont per product een verzend-badge ("3-8d · DE" groen / "15-30d · CN" amber) + "Alleen snelle
  EU-verzending" weergave-toggle (filtert alleen wat je ziet). `options.warehouseCountries` expliciet
  meegeven = wél strikt.
- `server/niche-discovery.ts`: `scanCatalog()` meet per CJ level-2 categorie (round-robin over
  hoofdcategorieën, cap `NICHE_SCAN_MAX_CATEGORIES`=24) **globaal totaal + EU(DE) totaal** →
  `shippingProfile: eu-fast|mixed|mostly-cn` (EU-aandeel ≥40% / ≥12% / minder). Verder: `sellPrice`-sample
  → marge bij 2.8× markup, `listedNum` → populariteit, top-8 ook FR-spreiding. Varianten/trending
  bewust niet (rate limit / geen endpoint). Scan = 2 calls per categorie (~1-2 min).
- Adapter-probes: `CJAdapter.getCategoryTree()` (`/product/getCategory`) en `probeCategory()`
  (`/product/list`; countryCode optioneel — weglaten = wereldwijd) — met mock-varianten.
- LLM clustert categorieën ≥25 producten (wereldwijd) tot 5-8 niche-thema's mét persona én
  shippingProfile in de onderbouwing (`generateNicheSuggestions`); deterministische fallback zonder
  LLM/mock-modus. Overlap-check tegen bestaande live stores. Niche-kaarten tonen het verzendprofiel-badge.
- Cache: settings-key `niche_discovery_cache`, 24h TTL. `GET /api/wizard/niches` (+`?refresh=1`);
  antwoord `status: ready|scanning|stale-refreshing`. Scan duurt ~30-60s (1 req/s CJ-limit), draait async.
- Wizard stap 1 heeft nu twee entries: "Eigen idee" (bestaand) en "AI-niches uit CJ-voorraad" —
  kaart kiezen zet idea+persona (chosenDirection) en springt direct naar stap 2.

## Cloudflare Tunnel / Mollie webhook (sinds juli 2026)
- **Probleem:** Mollie weigert LAN-webhook-URLs met 422 "unreachable" — 192.168.121.x is niet publiek.
- **Opzet:** één gedeelde Quick Tunnel (gratis, geen account/domein/open poorten) naar de UIcontrol
  API (:3001) op de tool-server. PM2-service `cloudflared-api` = `scripts/cloudflared-manager.cjs`:
  spawnt `cloudflared tunnel --url http://127.0.0.1:3001`, parset de trycloudflare-URL en POST hem
  naar `/api/admin/public-url` (settings-tabel, runtime — geen restart nodig; heartbeat 60s).
  Quick-tunnel-URLs wisselen bij herstart → CI start de service alleen als hij nog niet draait.
- `server/public-url.ts`: `getPublicBaseUrl()` (settings → env `PUBLIC_BASE_URL` → null),
  `isPubliclyReachableUrl()` weigert privé-IP/localhost/.local. `mollie.ts` stuurt webhookUrl
  ALLEEN mee als er een publiek adres is — zonder tunnel wordt de payment zonder webhook aangemaakt
  (checkout werkt, geen 422; fulfillment dan handmatig via `/api/orders/:id/fulfill`).
- Endpoints: `GET/POST /api/admin/public-url` (POST alleen localhost of `TUNNEL_TOKEN`),
  `GET /api/admin/tunnel-selftest` (maakt echte €0.01 Mollie test-payment mét webhookUrl → bewijst 422-fix).
- CI (deploy.yml) doet: cloudflared-diagnose (tool + store server), binary-install naar `~/bin`
  (geen sudo), PM2-start, en de selftest — resultaat in de Actions-log.
- Stores zelf publiek maken (klant-facing) kan een Quick Tunnel NIET voor meerdere port-vhosts
  tegelijk — daarvoor is een eigen domein + named tunnel (wildcard ingress per store) nodig.

## Bekende gotcha's
- `.env` is gitignored én untracked (sinds juli 2026) — wijzigingen moeten direct op de server via `sed + pm2 restart`
- **Env-loading:** de server laadt via `server/load-env.ts` (niet meer kaal `dotenv/config`)
  ZOWEL `UIcontrol/.env` als de repo-root `.env` — echte waarden winnen, lege/placeholder
  (`your_..._here`) tellen niet als geconfigureerd. Een CJ-key mag dus in root óf UIcontrol/.env.
  `isConfigured()` bepaalt overal of een key echt is (CJAdapter.isMock gebruikt dit).
- `STORE_SERVER_HOST` moet `192.168.121.11` zijn (oud: `192.168.121.8` — fix: `sed -i 's/192.168.121.8/192.168.121.11/' .env && pm2 restart all`)
- Auto-push git hook zit in `.claude/settings.json` — elke Edit/Write commit+pusht automatisch
- Stores deployen naar port pool 4001-4999 op de store server. **Port-allocatie loopt
  centraal via `allocatePort(storeId, reservedPorts)` in db.ts** (single source of truth):
  range-scan tegen `stores.port` + `port_allocations` + de ECHTE server-poorten
  (`scanDeployedStores()` wordt bij elke deploy meegegeven als `reservedPorts` — cruciaal
  want de DB kan stale zijn), atomaire claim, UNIQUE index op `stores.port` als race-vangnet.
  Redeploy van een bestaand subdomain hergebruikt z'n server-poort via `reservePort()`
  (heelt de DB). NOOIT meer `MAX(port)+1`. `atomicDeploy` doet een poort-conflict pre-flight
  tegen nginx vhosts; `/api/admin/nginx-audit` meldt orphans + conflicten. Port wordt
  vrijgegeven bij `DELETE /api/stores/:id` (releasePort).
- GitHub Actions CI/CD: push naar `main` → live in ~23s

## Development starten
```bash
cd UIcontrol
npm run dev   # start: Express (3001) + store-platform (3002) + Vite (5173) concurrent
```

## Key API endpoints
```
POST /api/pipeline/start          { niche } → { runId, state }
POST /api/pipeline/:runId/pause|resume|stop
GET  /api/pipeline/:runId/state
GET  /api/pipeline/runs           — laatste 20 runs
GET  /api/approvals/pending       — openstaande escalaties
POST /api/pipeline/approve        { runId, agentId, decision, opmerking }
GET  /api/obs/logs?run_id=        — agent execution logs
GET  /api/obs/costs?run_id=       — kosten aggregatie
GET  /api/dashboard               — overzicht + revenue charts
```

## Communicatieprotocol
Agents sturen events via stdout:
```
PIPELINE_EVENT:{"type":"agent_completed","runId":"...","agentId":"trend-agent","payload":{...},"timestamp":"..."}
```
Event types: `pipeline_started`, `agent_started`, `agent_log`, `agent_completed`, `agent_failed`, `agent_escalation`, `pipeline_completed`, `pipeline_failed`, `store_live`

## Werkwijze gebruiker
- Communiceert in het **Nederlands**
- Wil autonome uitvoering — niet bij elke stap om toestemming vragen
- Korte responses, geen lange samenvattingen
- Windows (dev) + Linux servers (runtime). Kan niet direct SSH'en tijdens chat — visuele bevestiging via screenshots
