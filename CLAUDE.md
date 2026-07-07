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
│   │   │   ├── pipeline/          ← PipelineCanvas, StageNode, StageDrawer (@xyflow/react)
│   │   │   ├── trendscraper/      ← TrendScraper UI (5 componenten)
│   │   │   └── views/             ← PipelineCanvas, RunsView, StoresView, AdManagerView,
│   │   │                             ObservabilityView, SettingsView, TrendScraperView
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts    ← Auto-reconnect, heartbeat 25s
│   │   │   └── usePipeline.ts     ← Pipeline state
│   │   └── types/index.ts         ← Alle gedeelde TypeScript types
│   ├── data/dropship.db           ← SQLite database (WAL mode)
│   ├── store-templates/           ← Next.js store template broncode
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

## Bekende gotcha's
- `.env` is gitignored — wijzigingen moeten direct op de server via `sed + pm2 restart`
- `STORE_SERVER_HOST` moet `192.168.121.11` zijn (oud: `192.168.121.8` — fix: `sed -i 's/192.168.121.8/192.168.121.11/' .env && pm2 restart all`)
- Auto-push git hook zit in `.claude/settings.json` — elke Edit/Write commit+pusht automatisch
- Stores deployen naar port pool 4001, 4002, ... op de store server
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
