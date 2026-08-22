"""
On-demand ingredient and product search service.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from scraper.client.session import TransgourmetSession, TransgourmetClient
from scraper.models.product import ProductItem
from scraper.parsers.turbostream import parse_articles_from_html
from scraper.security import sanitize_search_query, validate_category_slug

logger = logging.getLogger(__name__)

CATEGORY_MAP = {
    "food": 1,
    "tabak": 2,
    "wein": 3,
    "spirituosen": 4,
    "getraenke": 5,
    "molkerei-backwaren": 6,
    "molkerei": 6,
    "fruechte-gemuese": 7,
    "gemuese": 7,
    "fruechte": 7,
    "fleisch": 8,
    "fisch-seafood": 8,
    "nonfood": 9,
    "non-food": 9,
    "nearfood": 10,
}


class SearchExtractor:
    """
    Service for on-demand ingredient keyword querying and SKU lookups.
    """

    def __init__(self, client: Optional[TransgourmetSession] = None) -> None:
        self.client = client if client is not None else TransgourmetSession()

    def search(
        self,
        query: str,
        category: Optional[str] = None,
        hwg_id: Optional[int] = None,
        is_action: bool = False,
        limit: int = 100,
    ) -> List[ProductItem]:
        """
        Search catalog products matching free-text ingredient, brand, or SKU query.
        """
        safe_raw = str(query).replace("\x00", "") if query is not None else ""
        clean_query = sanitize_search_query(safe_raw, allow_empty=True)
        if not clean_query:
            return []

        resolved_hwg = hwg_id
        if category and resolved_hwg is None:
            cat_slug = validate_category_slug(category)
            resolved_hwg = CATEGORY_MAP.get(cat_slug)

        page_size = min(100, max(1, limit))
        html = self.client.get_catalog_html(
            search_term=clean_query,
            page=0,
            page_size=page_size,
            hwg_id=resolved_hwg,
            is_action=is_action,
        )

        if not html:
            return []

        articles = parse_articles_from_html(html)
        return articles[:limit]

    def search_articles(
        self,
        query: str,
        category: Optional[str] = None,
        hwg_id: Optional[int] = None,
        is_action: bool = False,
        limit: int = 100,
    ) -> List[ProductItem]:
        """Alias for search method."""
        return self.search(
            query=query,
            category=category,
            hwg_id=hwg_id,
            is_action=is_action,
            limit=limit,
        )

    def lookup_article(self, article_number: str) -> Optional[ProductItem]:
        """
        Lookup exact product record by 6-digit article number.
        """
        clean_sku = sanitize_search_query(article_number, allow_empty=True)
        if not clean_sku:
            return None

        results = self.search(query=clean_sku, limit=10)
        for r in results:
            if r.article_number == clean_sku:
                return r

        return results[0] if results else None


SearchService = SearchExtractor

__all__ = ["SearchExtractor", "SearchService"]
