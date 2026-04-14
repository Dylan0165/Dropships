# UIcontrol — Dropship Pipeline Dashboard

Real-time dashboard for managing the AI dropshipping pipeline. Built with React 18, @xyflow/react v12, Express, WebSocket, and SQLite persistence.

## Architecture

```
UIcontrol/
├── src/
│   ├── main.tsx                      # React entry
│   ├── App.tsx                       # Root layout + routing
│   ├── types/index.ts                # All TypeScript types
│   ├── constants/pipeline.ts         # Shared agent configs & edges
│   ├── lib/api.ts                    # REST API client
│   ├── styles/globals.css            # Tailwind + ReactFlow dark theme
│   ├── hooks/
│   │   ├── useWebSocket.ts           # WS connection with auto-reconnect
│   │   └── usePipeline.ts            # Pipeline state management
│   ├── components/
│   │   ├── layout/Sidebar.tsx        # 64px icon nav
│   │   ├── layout/TopBar.tsx         # Status bar with cost + escalations
│   │   ├── pipeline/PipelineCanvas.tsx  # ReactFlow canvas
│   │   ├── pipeline/AgentNode.tsx    # Custom node (200×80px)
│   │   ├── panels/LogPanel.tsx       # 380px right panel
│   │   ├── panels/OutputPanel.tsx    # JSON viewer with syntax highlighting
│   │   ├── panels/ApprovalPanel.tsx  # Approve/reject UI with resolved states
│   │   └── views/
│   │       ├── RunsView.tsx          # Pipeline run history (auto-refresh)
│   │       ├── StoresView.tsx        # Launched stores with ROAS (auto-refresh)
│   │       └── ComponentsView.tsx    # Browse components with file tabs + copy
│   └── server/
│       ├── index.ts                  # Express + WS server (port 3001)
│       ├── db.ts                     # SQLite database (better-sqlite3)
│       ├── store.ts                  # Persistent pipeline state + hot cache
│       ├── parser.ts                 # PIPELINE_EVENT stream parser
│       ├── coordinator.ts            # Spawn bun coordinator process
│       └── store-platform.ts         # Store platform stub (port 3002)
├── data/                             # SQLite database file (auto-created)
```

## Setup

```bash
cd UIcontrol
npm install
```

`.env` file is included with all settings:

```env
DEEPSEEK_API_KEY=sk-your-key-here
PORT=3001
PLATFORM_API_URL=http://localhost:3002
DATABASE_PATH=./data/dropship.db
```

Optional overrides:
```env
CLAUDE_CODE_MAIN=../claude-code-main/src/main.tsx
SKILLS_PATH=../Skillslibrary
COMPONENTS_PATH=../Websitecomponentscodes
```

## Development

```bash
npm run dev
```

Starts three services concurrently:
- **Vite** dev server on port 5173 (frontend)
- **Express + WS** API on port 3001 (backend)
- **Store platform stub** on port 3002 (store creation service)

## Testing

```bash
npm test           # Run all tests once
npm run test:watch # Watch mode
```

## Production

```bash
npm run build
npm run server
```

## Communication Flow

```
claude-code-main (bun)                UIcontrol Server              React UI
  ├── stdout ─── PIPELINE_EVENT:{}  →  parser.ts → store.ts  →  WS broadcast
  ├── stderr ─── error logs  ────────→  parser  → store  ────→  WS broadcast
  └── stdin  ←── TEAM_BESLISSING:{}  ←  coordinator.ts  ←────  ApprovalPanel
```

### System Prompt Wiring

When `PIPELINE_RUN_ID` and `PIPELINE_NICHE` env vars are set, `systemPrompt.ts` calls `getDropshipPipelinePrompt()` instead of the default coordinator prompt. This gives the coordinator full knowledge of:
- The 11-agent pipeline order
- The PIPELINE_EVENT protocol
- TEAM_BESLISSING escalation handling
- Available skills and components paths

### Persistence

Pipeline runs are stored in SQLite (`data/dropship.db`). Active runs are also kept in a hot memory cache for performance. The database uses WAL mode for concurrent reads.

Tables:
- `runs` — Pipeline runs with JSON data blob (agents, tokens, costs)
- `stores` — Store records with ROAS tracking

## Pipeline Flow

1. Enter a niche in the Pipeline view and click **Start Pipeline**
2. The server spawns `bun run main.tsx` with `CLAUDE_CODE_COORDINATOR_MODE=1`
3. The coordinator runs agents sequentially: trend → niche-reviewer → product → product-reviewer → brand → store-builder → store-reviewer → ads → ads-reviewer
4. Each agent emits `PIPELINE_EVENT` lines parsed by the server and broadcast via WebSocket
5. Reviewers may escalate — the UI shows an approval panel with approve/reject buttons
6. Growth and security agents run in parallel after store-builder completes

## Protocol

Agents communicate via `PIPELINE_EVENT` JSON lines on stdout:

```
PIPELINE_EVENT:{"type":"agent_started","runId":"...","agentId":"trend-agent","payload":{},"timestamp":"..."}
```

Event types: `pipeline_started`, `agent_started`, `agent_log`, `agent_completed`, `agent_failed`, `agent_escalation`, `pipeline_completed`, `pipeline_failed`, `store_live`

Escalation approval is sent via stdin:

```
TEAM_BESLISSING:{"agentId":"niche-reviewer","decision":"approve","opmerking":"looks good"}
```

## Website Components

Real Next.js/React components are stored in `Websitecomponentscodes/`:

| Folder | Category | Description |
|--------|----------|-------------|
| hero-banner | hero | Full-width hero with gradient + CTA |
| product-grid | productgrid | Product cards with pricing + badges |
| usp-section | usp | USP icons row |
| navigation | navigation | Responsive navbar + mobile menu |
| footer | footer | Multi-column footer + newsletter |
| social-proof | social_proof | Review cards with star ratings |
| checkout-flow | checkout | Cart summary + promo code + CTA |

The Components view in the UI shows these with actual source code preview and copy functionality.

---

## Trendscraper Integration

The dashboard includes a **Trendscraper** view (TrendingUp icon in the sidebar) for AI-powered niche discovery.

### Start the dashboard
```bash
cd UIcontrol
npm run dev
```

URL: **http://localhost:5173**
Trendscraper page: **http://localhost:5173** (click the TrendingUp icon in the sidebar)

### Requirements

The Python Trendscraper service must be running on port 8001 for data to load:

```bash
cd Trendscraper
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Environment

`.env` already contains:
```
VITE_TRENDSCRAPER_URL=http://localhost:8001
```

### Features

- Real-time scraper status (online/offline indicator)
- Run history with status badges
- Niche cards with trend score, competition level and market size
- One-click approve/reject with optimistic UI updates
- Product table per niche (sorted by margin)
- Manual "Nu uitvoeren" trigger button
- Auto-polling: status every 30s, niches every 10s
