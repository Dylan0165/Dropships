# Dropshipping Automatisering — Projectcontext

Plak dit aan het begin van elke nieuwe chat zodat Claude direct weet waar we staan.

---

## Servers

| Rol            | IP                | User      |
|----------------|-------------------|-----------|
| Tool server    | 192.168.121.133   | student   |
| Store server   | 192.168.121.8     | student   |

## Repository
- **GitHub**: `Dylan0165/Dropships` (privé)
- **Lokatie op server**: `~/Dropships/`
- **Deploy**: push naar `main` → GitHub Actions → automatisch live in ~23s

## PM2 Services (tool server)

| Service        | Poort |
|----------------|-------|
| uicontrol      | 3001  |
| store-platform | 3002  |
| trendscraper   | 8001  |
| inspector      | 8002  |
| approvalapp    | 5174  |

Frontend bereikbaar via: `http://192.168.121.133:8080`

## Mapstructuur (tool server ~/Dropships/)
```
UIcontrol/
├── src/server/
│   ├── agent-runner.ts      # Agent uitvoering + JSON validatie + retry (max 3x)
│   ├── coordinator.ts       # Pipeline orchestratie + store deploy trigger
│   ├── store-platform.ts    # Next.js store generatie + SSH deploy naar 192.168.121.8
│   ├── store-monitor.ts     # Health checks elke 5 min + AI diagnose bij down store
│   └── db.ts                # SQLite schema + idempotente migraties
├── data/dropship.db          # SQLite database
└── .env                      # LLM + SSH + API config

Skillslibrary/               # Agent SKILL.md bestanden (één per agent)
Websitecomponentscodes/      # React componenten voor gegenereerde webshops
```

## Pipeline Volgorde
```
trend-agent → niche-reviewer → product-agent → product-reviewer
  → brand-agent → store-builder → store-reviewer → ads-agent → ads-reviewer
```
Security-agent en growth-agent bestaan maar draaien NIET automatisch.

## LLM / API
- **Model**: `deepseek-chat` via `https://api.deepseek.com`
- **Kosten**: ~€0.007 per volledige pipeline run (9 agents)
- **API key**: staat al in `.env` op de tool server

## Store Deployment
- Stores worden gegenereerd als Next.js static export (`output: 'export'`)
- Gedeployed naar store server via SSH + rsync
- Elke store krijgt een poort (4001, 4002, ...) en een subdomain
- Bereikbaar via `http://192.168.121.8:<port>`
- Nginx configs worden automatisch aangemaakt op store server

## SQLite Commando's (tool server)
```bash
cd ~/Dropships/UIcontrol
sqlite3 data/dropship.db
SELECT subdomein, port, health_status, status FROM stores ORDER BY created_at DESC;
SELECT run_id, niche, status, started_at FROM runs ORDER BY started_at DESC LIMIT 5;
```

## Validator Architectuur (agent-runner.ts)
Elke agent heeft een eigen validator. Ze zijn bewust permissief:
- `trend-agent`: vereist `niches[]` met `name` + `trend_score`
- `product-agent`: vereist `products[]` of `top_3[]` met `name` + `buy_price`
- `brand-agent`: accepteert `brand.name` (genest) OF root-level `brand_name`
- `ads-agent`: vereist `hooks[]` + (`primary_text` OF `ad_copy_variants[]`)
- Alle 4 reviewers: accepteert elk niet-leeg JSON object

## Component Import Regels (KRITIEK)
Alle componenten in `Websitecomponentscodes/` importeren uit shared/ ZONDER `.js`:
```typescript
// ✅ Correct
import { addToCart } from '../shared/checkout'
// ❌ Breekt Next.js build
import { addToCart } from '../shared/checkout.js'
```

## Openstaande Issues (stand: mei 2026)
- **Tailwind CSS**: fix gepusht maar nog niet bevestigd bij live store run
- **Stores in DB**: `run_id` fix gepusht — stores zouden nu correct worden opgeslagen
- **Store deletion UI**: nog niet gebouwd — handmatig via sqlite3 + SSH

## Debug Commando's
```bash
pm2 logs uicontrol --lines 100          # pipeline logs
pm2 logs store-platform --lines 50     # store build/deploy logs
curl -I http://192.168.121.8:4001      # store bereikbaar?
ssh student@192.168.121.8 "sudo nginx -t"  # nginx config check
```
