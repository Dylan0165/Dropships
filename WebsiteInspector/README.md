# WebsiteInspector

Crawlt succesvolle dropshipping stores, analyseert hun design en copy patronen via een lokale LLM, en slaat die inzichten op als design inspiratie voor de store-builder.

**Poort:** `8002`  
**DB:** `inspector.db`  
**Screenshots:** `data/screenshots/`

## Quick Start

```bash
cd WebsiteInspector

# 1. Kopieer en pas aan
cp .env.example .env

# 2. Installeer dependencies
pip install -r requirements.txt

# 3. Installeer Playwright browsers
playwright install chromium --with-deps

# 4. Start de service
python main.py
```

API beschikbaar op `http://localhost:8002/docs`

## Endpoints

| Method | Path | Beschrijving |
|--------|------|--------------|
| GET | `/health` | Service status |
| GET | `/status` | Laatste run, volgende run, aantal stores |
| GET | `/runs` | Laatste 20 crawl runs |
| GET | `/stores?niche=fitness` | Gecrawlde stores |
| GET | `/patterns?niche=fitness` | Design/copy patronen per niche |
| GET | `/inspiration?niche=fitness` | **Beste inspiratie** (gebruikt door store-builder) |
| POST | `/run/trigger` | Start handmatig een inspectiecyclus |

## Architectuur

```
Trendscraper (8001) → approved niches
                              ↓
                      runner.py (cycle)
                    ↙           ↘
         google_shopping     myip_ms (seedlist)
                    ↘           ↙
               page_crawler (Playwright)
                         ↓
                   analyzer.py (LLM)
                    ↙           ↘
            store_patterns   design_inspirations
                                    ↓
                    UIcontrol store-platform.ts
                    (GET /inspiration → primary_color, section_order)
```

## LLM Configuratie

De service werkt met elk OpenAI-compatible endpoint:

**Lokaal (Ollama, geen kosten):**
```env
LLM_BASE_URL=http://192.168.121.122:11434/v1
LLM_MODEL=qwen2.5:14b
LLM_API_KEY=
```

**DeepSeek (productie):**
```env
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-jouw-key
```

## Privacy

- Slaat alleen publieke design patronen op — geen persoonlijke data
- Screenshots zijn van publieke homepages
- Analyseert structuur en stijl, kopieert nooit tekst letterlijk
