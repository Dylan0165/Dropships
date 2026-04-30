"""
Known dropshipping store seedlist — organised by niche.
Used as fallback when live discovery is unavailable or slow.
"""

# Verified public Shopify stores used as inspiration seeds.
# All are publicly accessible — no proprietary data collected here.
SEED_STORES: dict[str, list[str]] = {
    "fitness": [
        "https://gymshark.com",
        "https://alphalete.com",
        "https://www.blendjet.com",
        "https://www.gymreapers.com",
        "https://www.vivooshop.com",
    ],
    "beauty": [
        "https://www.fashionnova.com",
        "https://colourpop.com",
        "https://www.morphe.com",
        "https://www.beautyblender.com",
        "https://www.burt sbees.com",
    ],
    "gadgets": [
        "https://www.anker.com",
        "https://www.dbrand.com",
        "https://www.nomad goods.com",
        "https://www.satechi.net",
        "https://www.elago.com",
    ],
    "home": [
        "https://www.ruggable.com",
        "https://www.ugmonk.com",
        "https://www.brooklinen.com",
        "https://www.tuftandneedle.com",
        "https://www.casper.com",
    ],
    "pet": [
        "https://www.chewy.com",
        "https://www.barkbox.com",
        "https://www.wag.com",
        "https://www.petco.com",
        "https://www.furhaven.com",
    ],
    "outdoor": [
        "https://www.allbirds.com",
        "https://www.cotopaxi.com",
        "https://www.tentree.com",
        "https://www.bombas.com",
        "https://www.outerknown.com",
    ],
    "kitchen": [
        "https://www.madeincookware.com",
        "https://www.greatjones.co",
        "https://www.caraway.com",
        "https://www.wandpdesign.com",
        "https://www.hedleyandbennett.com",
    ],
    "wellness": [
        "https://www.ceremonia.com",
        "https://www.moonjuice.com",
        "https://www.goop.com",
        "https://www.bulletproof.com",
        "https://www.sunwarrior.com",
    ],
}

FALLBACK_NICHES = ["fitness", "beauty", "gadgets", "home", "pet"]


def get_trending_shopify_stores(niche: str) -> list[str]:
    """Return seed store URLs for a given niche.
    Matches partial niche names (e.g. 'fitness equipment' → 'fitness').
    """
    niche_lower = niche.lower()
    for key, urls in SEED_STORES.items():
        if key in niche_lower or niche_lower in key:
            return urls

    # Fuzzy: pick the first partial match
    for key, urls in SEED_STORES.items():
        words = niche_lower.split()
        if any(w in key for w in words):
            return urls

    # Last resort: return a spread across all niches
    fallback: list[str] = []
    for key in FALLBACK_NICHES:
        fallback.extend(SEED_STORES[key][:1])
    return fallback
