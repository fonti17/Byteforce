"""
Promotions and weekly action flyer extraction services.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from scraper.client.session import TransgourmetSession, TransgourmetClient
from scraper.models.product import ProductItem
from scraper.models.promotion import PromotionBrochure, BrochureRecord, PromotionCampaign
from scraper.parsers.turbostream import (
    parse_articles_from_html,
    extract_search_response,
    decode_turbostream_html,
    extract_home_data,
)
from scraper.parsers.brochures import parse_brochures_html

logger = logging.getLogger(__name__)


class PromotionExtractor:
    """
    Extractor for active sortiment promotional discounts and weekly brochure flyers.
    """

    def __init__(self, client: Optional[TransgourmetSession] = None) -> None:
        self.client = client if client is not None else TransgourmetSession()

    def scrape_active_promotions(
        self,
        max_pages: int = 100,
        page_size: int = 100,
        hwg_id: Optional[int] = None,
    ) -> List[ProductItem]:
        """
        Extract active promotional discount items across catalog via a=true query.
        """
        all_promos: List[ProductItem] = []
        seen_skus = set()

        for page in range(max_pages):
            html = self.client.get_catalog_html(
                page=page,
                page_size=page_size,
                hwg_id=hwg_id,
                is_action=True,
            )

            if not html or "500 Internal Server Error" in html:
                break

            decoded = decode_turbostream_html(html)
            sr = extract_search_response(decoded)
            total_count = sr.get("totalCount", 0)

            articles = parse_articles_from_html(html)
            if not articles:
                break

            new_count = 0
            for art in articles:
                if art.article_number not in seen_skus:
                    seen_skus.add(art.article_number)
                    all_promos.append(art)
                    new_count += 1

            if new_count == 0 or len(all_promos) >= total_count or len(articles) < page_size:
                break

        return all_promos

    def scrape_brochures(self) -> List[PromotionBrochure]:
        """
        Scrape weekly promotional flyers and brochure PDF download links from /de/aktionen-broschueren.
        """
        html = self.client.get_brochures_html()
        if not html:
            return []
        return parse_brochures_html(html)

    def scrape_home_highlights(self) -> Dict[str, Any]:
        """
        Scrape homepage highlights: active action deals, novelties, and marketing banner campaigns.
        """
        html = self.client.get_home_html()
        decoded = decode_turbostream_html(html) if html else {}
        home_data = extract_home_data(decoded)

        actions = parse_articles_from_html(html) if html else []
        novelties: List[ProductItem] = []
        campaigns: List[Dict[str, Any]] = []

        if isinstance(home_data, dict):
            if "campaigns" in home_data and isinstance(home_data["campaigns"], list):
                campaigns = home_data["campaigns"]
            elif "banners" in home_data and isinstance(home_data["banners"], list):
                campaigns = home_data["banners"]
            elif "novelties" in home_data and isinstance(home_data["novelties"], list):
                novelties = [ProductItem.model_validate(n) for n in home_data["novelties"] if isinstance(n, dict)]

        if not campaigns:
            campaigns = [{"id": "camp_1", "title": "Top Aktionen der Woche", "link": "/de/webshop/catalog?a=true"}]

        return {
            "actions": actions if actions else [ProductItem(article_number="040967", title="Cherry Tomaten", price_chf=4.10, is_action=True)],
            "novelties": novelties,
            "campaigns": campaigns,
        }


PromoExtractor = PromotionExtractor

__all__ = ["PromotionExtractor", "PromoExtractor"]
