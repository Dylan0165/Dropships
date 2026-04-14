# Trendscraper

AI-powered dropshipping niche discovery service. Scrapes Reddit, Google Trends, and TikTok every 6 hours, feeds the data to DeepSeek V3 for niche analysis, and stores results in SQLite. Exposes a REST API on port 8001.

## Quick Start

```bash
cd Trendscraper

# 1. Copy and fill in the environment file
cp .env.example .env
# Edit .env — add DEEPSEEK_API_KEY, optionally CJ_API_KEY and Reddit credentials

# 2. Create virtual environment and install dependencies
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

pip install -r requirements.txt

# 3. Start the service
python main.py
```

The service starts:
- FastAPI server → http://localhost:8001
- APScheduler → runs scraper pipeline every 6 hours

## Environment Variables

See `.env.example` for all variables. Required:

| Variable | Description |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek V3 API key (platform.deepseek.com) |
| `CJ_API_KEY` | CJ Dropshipping API key (optional — products tab) |
| `REDDIT_CLIENT_ID` | Reddit app client ID (optional — Reddit scraping) |
| `REDDIT_CLIENT_SECRET` | Reddit app client secret |
| `REDDIT_USER_AGENT` | Reddit API user agent string |
| `PORT` | Server port (default: 8001) |

Reddit credentials are optional — the scraper gracefully skips Reddit if not configured.

## API Docs

FastAPI provides interactive documentation at:

```
http://localhost:8001/docs
```

## Available Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health check |
| GET | `/status` | Last run, next run, niche counts |
| GET | `/runs` | Last 20 scraper runs |
| GET | `/niches?status=pending` | Niches filtered by status |
| POST | `/niches/{id}/approve` | Approve a niche |
| POST | `/niches/{id}/reject` | Reject a niche |
| POST | `/run/trigger` | Trigger a manual scraper run |
| GET | `/products?niche_id={id}` | Products for a niche |

## File Structure

```
Trendscraper/
├── main.py            # Entry point (FastAPI + scheduler)
├── config.py          # All configuration from .env
├── database.py        # SQLite layer
├── api.py             # FastAPI routes
├── scheduler.py       # APScheduler (every 6h)
├── runner.py          # Full pipeline orchestration
├── analyzer.py        # DeepSeek AI niche analysis
├── models.py          # Pydantic v2 data models
├── requirements.txt
├── .env.example
├── trendscraper.db    # SQLite database (auto-created)
├── logs/
│   └── scraper.log    # Rotating log file
└── scrapers/
    ├── reddit.py      # PRAW Reddit scraper
    ├── google_trends.py # pytrends scraper
    ├── cj_products.py # CJ Dropshipping product search
    └── tiktok.py      # TikTok public hashtag scraper
```

## Dashboard

The UIcontrol dashboard at http://localhost:5173 includes a **Trendscraper** view (TrendingUp icon in sidebar). Start this service first, then open the dashboard.
