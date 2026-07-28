# Pipeline

De pipeline is een state machine die 11 stages sequentieel draait en na élke
stage persisteert. Een run kan dus gepauzeerd, hervat of hersteld worden zonder
vanaf nul te beginnen.

## Bestanden

| Bestand | Verantwoordelijkheid |
|---|---|
| `pipeline/engine.ts` | draait de stages, persist na elke stage |
| `pipeline/agent.ts` | LLM-executor + Zod-validatie + retry met backoff, per-stage temperature |
| `pipeline/reviewer.ts` | reviewer-schema (vast, niet wijzigen) |
| `pipeline/stages.ts` | per-stage runners + Zod-schema's |
| `pipeline/store-builder.ts` | content-brief → Next.js-project |
| `pipeline/deployer.ts` | deploy-aanroep |
| `pipeline/events.ts` | EventEmitter per runId (voedt de WebSocket) |
| `pipeline/types.ts` | `STAGES`, `PipelineState`, `StageState` |
| `pipeline/index.ts` | publieke API: `startRun`, `pauseRun`, `resumeRun`, `stopRun` |

## De 11 stages

| # | Stage | Model | Wat |
|---|---|---|---|
| 1 | trend-discovery | deepseek-chat | EU-niches ontdekken |
| 2 | niche-review | deepseek-reasoner | APPROVED / REJECTED / UNCERTAIN |
| 3 | product-research | deepseek-chat | 8-15 producten sourcen via CJ |
| 4 | product-review | deepseek-reasoner | beste producten kiezen |
| 5 | brand-creation | deepseek-chat | naam, slogan, kleuren, USP's |
| 6 | content-generation | deepseek-chat | productbeschrijvingen, copy |
| 7 | store-build | deepseek-reasoner | design-plan + componentkeuze → Next.js |
| 8 | build-validate | — | npm install + tsc + next build |
| 9 | deploy | — | lokale fs-deploy + nginx reload |
| 10 | health-check | — | HTTP-probe met retries |
| 11 | growth | deepseek-chat | groei-analyse |

Bij een **wizard-run** worden stage 1-4 ge-short-circuit: de keuzes staan al vast
uit het wizard-gesprek, en de persona gaat mee naar de brand- en content-agents.

## Reviewer-schema (vastgezet — niet wijzigen)

```ts
{ verdict: "APPROVED" | "REJECTED" | "UNCERTAIN", reason: string, score: 0-100, suggestions: string[] }
```

- `APPROVED` → door naar de volgende stage
- `UNCERTAIN` → pauzeer, escaleer naar menselijke review
- `REJECTED` → pipeline faalt

## Temperature per stage

Bewust gedifferentieerd in `agent.ts`: creatieve stages hoog (brand 0.95,
content 0.85, store-build 0.9), datastages laag (product 0.3). Een creatieve
stage op lage temperature gaf herkenbaar-generieke output; een datastage op hoge
temperature verzon productgegevens.

## Events

Agents communiceren via stdout:

```
PIPELINE_EVENT:{"type":"agent_completed","runId":"...","agentId":"trend-agent","payload":{...},"timestamp":"..."}
```

Types: `pipeline_started`, `agent_started`, `agent_log`, `agent_completed`,
`agent_failed`, `agent_escalation`, `pipeline_completed`, `pipeline_failed`,
`store_live`.

## API

```
POST /api/pipeline/start            { niche } of { wizardConfig } → { runId, state }
POST /api/pipeline/:runId/pause|resume|stop
GET  /api/pipeline/:runId/state
GET  /api/pipeline/runs             laatste 20 runs
GET  /api/approvals/pending         openstaande escalaties
POST /api/pipeline/approve          { runId, agentId, decision, opmerking }
GET  /api/obs/logs?run_id=          agent execution logs
GET  /api/obs/costs?run_id=         kostenaggregatie
```

## Aandachtspunten

- **Alle klant-facing content is Engels**, ook bij Nederlandse wizard-input. De
  skill-prompts zeggen dat expliciet. Ruwe Nederlandse wizard-input mag nooit
  ongefilterd in de site-copy belanden — die gaat altijd eerst door de
  content-agent.
- De collectiegrootte komt uit het assortiment: 7-15 **verschillende** producten
  over evenzoveel producttypes (`suppliers/assortment.ts`). `fitProducts`
  begrenst alleen op 15. De oude opvulling met klonen (`--v1`-suffix) is op
  28 juli 2026 verwijderd — die verhulde dat er maar één producttype doorzocht
  werd. Levert een niche te weinig op, dan zegt de wizard dat met het echte
  aantal in plaats van de lijst vol te maken.
- `productType` (Engels) reist mee van de wizard tot in `PRODUCTS` op de pagina
  en wordt daar de categorie-indeling (`products.category-tabs`).
- Stage 7 valt terug op de oude renderer als de component-assemblage faalt. Een
  store crasht dus nooit door een slechte LLM-keuze.
