"""
LLM pattern analyser — extracts design/copy patterns from crawled pages
and synthesises design inspirations from multiple store patterns.
"""
import json
import re
from loguru import logger

import config
from models import CrawledPage, StorePattern, DesignInspiration

MAX_RETRIES = 2

_STORE_SYSTEM_PROMPT = (
    "Je bent een e-commerce design expert. "
    "Analyseer deze dropshipping store data en extraheer patronen voor gebruik als inspiratie. "
    "Geef ALLEEN JSON terug — geen uitleg, geen markdown, geen codeblokken. "
    "Kopieer geen tekst letterlijk — beschrijf alleen patronen en formules."
)

_INSPIRATION_SYSTEM_PROMPT = (
    "Je bent een conversion rate optimization expert voor dropshipping. "
    "Combineer de beste elementen van de aangeleverde stores tot één optimale template aanbeveling. "
    "Geef ALLEEN JSON terug — geen uitleg, geen markdown."
)


async def _call_llm(system: str, user: str) -> str:
    """Call the configured LLM endpoint and return raw text response."""
    import httpx

    headers = {"Content-Type": "application/json"}
    if config.LLM_API_KEY:
        headers["Authorization"] = f"Bearer {config.LLM_API_KEY}"

    payload = {
        "model": config.LLM_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
        "max_tokens": 1024,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{config.LLM_BASE_URL}/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


def _extract_json(text: str) -> dict:
    """Strip markdown fences and parse the first JSON object found."""
    # Remove ```json ... ``` fences
    text = re.sub(r"```(?:json)?", "", text).strip("` \n")
    # Find first {...}
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(match.group())


async def analyze_store(crawled: CrawledPage, niche: str) -> StorePattern | None:
    """Analyse a crawled store page and return a StorePattern, or None on failure."""
    trust_list = []
    if crawled.has_countdown_timer:
        trust_list.append("countdown timer")
    if crawled.has_social_proof:
        trust_list.append("social proof / reviews")
    if crawled.has_money_back:
        trust_list.append("geld-terug-garantie")
    if crawled.has_free_shipping:
        trust_list.append("gratis verzending")
    if crawled.has_whatsapp:
        trust_list.append("WhatsApp support")

    user_prompt = f"""Store URL: {crawled.url}
Niche: {niche}

Zichtbare tekst (eerste 2000 tekens):
{crawled.text_content[:2000]}

Dominante kleuren: {', '.join(crawled.colors) if crawled.colors else 'onbekend'}
Secties op pagina: {', '.join(crawled.sections) if crawled.sections else 'onbekend'}
Producten op homepage: {crawled.product_count}
Trust elementen aanwezig: {', '.join(trust_list) if trust_list else 'geen gedetecteerd'}

Geef JSON terug met exact deze structuur:
{{
  "primary_color": "#hex",
  "secondary_color": "#hex",
  "accent_color": "#hex",
  "font_style": "sans|serif|display",
  "layout_type": "minimal|bold|luxury|playful",
  "hero_type": "image|video|split|fullscreen",
  "tone": "urgent|premium|friendly|technical",
  "headline_pattern": "beschrijf het patroon (niet de letterlijke tekst)",
  "cta_text_pattern": "beschrijf het CTA patroon",
  "usp_count": 3,
  "has_countdown_timer": false,
  "has_social_proof": true,
  "has_money_back": true,
  "has_free_shipping_banner": true,
  "section_order": ["nav","hero","usp","products","reviews","footer"],
  "product_count_on_homepage": 4,
  "quality_score": 75,
  "reasoning": "Waarom deze score — max 2 zinnen"
}}"""

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 2):
        try:
            raw = await _call_llm(_STORE_SYSTEM_PROMPT, user_prompt)
            data = _extract_json(raw)
            pattern = StorePattern.model_validate(data)
            logger.debug("[analyzer] {} — score {} (attempt {})", crawled.domain, pattern.quality_score, attempt)
            return pattern
        except Exception as exc:
            last_error = exc
            logger.warning("[analyzer] attempt {}/{} mislukt voor {}: {}", attempt, MAX_RETRIES + 1, crawled.domain, exc)
            user_prompt += "\n\nGeef ALLEEN geldige JSON terug — geen andere tekst."

    logger.error("[analyzer] alle pogingen mislukt voor {}: {}", crawled.domain, last_error)
    return None


async def generate_inspiration(niche: str, patterns: list[StorePattern], store_ids: list[int]) -> DesignInspiration | None:
    """Synthesise multiple StorePatterns into a single DesignInspiration."""
    if not patterns:
        return None

    patterns_json = json.dumps([p.model_dump() for p in patterns], ensure_ascii=False, indent=2)
    user_prompt = f"""Niche: {niche}
Aantal geanalyseerde stores: {len(patterns)}

Store patronen:
{patterns_json[:4000]}

Combineer de beste elementen en geef JSON terug met exact deze structuur:
{{
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "recommended_layout": "minimal|bold|luxury|playful",
  "recommended_tone": "urgent|premium|friendly|technical",
  "headline_formula": "beschrijf de formule (bijv: Emotionele haak + kwantitatief voordeel)",
  "section_order": ["nav","hero","usp","products","reviews","footer"]
}}"""

    try:
        raw = await _call_llm(_INSPIRATION_SYSTEM_PROMPT, user_prompt)
        data = _extract_json(raw)
        insp = DesignInspiration(
            niche=niche,
            color_palette=data.get("color_palette", []),
            recommended_layout=data.get("recommended_layout", "minimal"),
            recommended_tone=data.get("recommended_tone", "friendly"),
            headline_formula=data.get("headline_formula", ""),
            section_order=data.get("section_order", ["nav", "hero", "usp", "products", "reviews", "footer"]),
            source_store_ids=store_ids,
        )
        logger.info("[analyzer] inspiratie gegenereerd voor niche '{}'", niche)
        return insp
    except Exception as exc:
        logger.error("[analyzer] inspiratie generatie mislukt voor '{}': {}", niche, exc)
        return None
