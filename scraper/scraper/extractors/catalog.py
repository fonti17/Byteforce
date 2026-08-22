"""Catalog extraction services for Transgourmet food and beverage categories."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

from scraper.client.session import TransgourmetClient, TransgourmetSession
from scraper.models.category import STANDARD_HAUPTWARENGRUPPEN, resolve_category_id
from scraper.models.product import ProductItem
from scraper.parsers.turbostream import decode_turbostream_html, extract_search_response, parse_articles_from_html

logger = logging.getLogger(__name__)


def _category_name(hwg_id: Optional[int]) -> Optional[str]:
    """Read the display name from the project's `(name, slug)` taxonomy."""
    if hwg_id is None:
        return None
    category = STANDARD_HAUPTWARENGRUPPEN.get(hwg_id)
    return category[0] if category else None


class CatalogExtractor:
    """Extractor for scraping paginated commodity group (HWG) catalog listings."""

    def __init__(self, client: Optional[TransgourmetSession] = None) -> None:
        self.client = client if client is not None else TransgourmetSession()

    def get_page(
        self,
        page: int,
        hwg_id: Optional[int] = None,
        page_size: int = 100,
        search_term: str = "",
        is_action: bool = False,
    ) -> List[ProductItem]:
        """Fetch a single catalog page and return parsed articles."""
        try:
            html = self.client.get_catalog_html(
                search_term=search_term,
                page=page,
                page_size=page_size,
                hwg_id=hwg_id,
                is_action=is_action,
            )
            if not html or "500 Internal Server Error" in html:
                return []
            cat_name = _category_name(hwg_id)
            return parse_articles_from_html(html, category_id=hwg_id, category_name=cat_name)
        except Exception as e:
            logger.warning("Error fetching catalog page %d for HWG %s: %s", page, hwg_id, e)
            if "500" in str(e):
                return []
            raise

    def scrape_category(
        self,
        hwg_id: Optional[Union[int, str]] = None,
        category: Optional[Union[str, int]] = None,
        max_pages: int = 100,
        page_size: int = 100,
    ) -> List[ProductItem]:
        """Scrape all products within a specific Hauptwarengruppe (HWG) category up to max_pages.
        Accepts hwg_id integer or category string/slug/id.
        """
        raw_target = hwg_id if hwg_id is not None else category
        if raw_target is None:
            raw_target = 1

        target_hwg = resolve_category_id(raw_target)
        if target_hwg is None:
            return []

        cat_name = _category_name(target_hwg)

        all_articles: List[ProductItem] = []

        for page in range(max_pages):
            html = self.client.get_catalog_html(
                page=page,
                page_size=page_size,
                hwg_id=target_hwg,
            )

            if not html or "500 Internal Server Error" in html:
                break

            decoded = decode_turbostream_html(html)
            sr = extract_search_response(decoded)
            total_count = sr.get("totalCount", 0)

            articles = parse_articles_from_html(html, category_id=target_hwg, category_name=cat_name)
            if not articles:
                break

            all_articles.extend(articles)

            if len(articles) < page_size:
                break
            if isinstance(total_count, int) and total_count > 0 and len(all_articles) >= total_count:
                break

        return all_articles

    def scrape_all_categories(
        self,
        categories: Optional[List[Union[str, int]]] = None,
        category_ids: Optional[List[int]] = None,
        max_pages_per_cat: int = 100,
        max_pages_per_category: Optional[int] = None,
        page_size: int = 100,
    ) -> Dict[Any, List[ProductItem]]:
        """Scrape multiple categories in sequence. Default: core food HWGs (1, 5, 6, 7, 8)."""
        effective_pages = max_pages_per_category if max_pages_per_category is not None else max_pages_per_cat
        input_list = categories if categories is not None else category_ids
        if input_list is None:
            input_list = [1, 5, 6, 7, 8]

        results: Dict[Any, List[ProductItem]] = {}

        for cat_item in input_list:
            hwg = resolve_category_id(cat_item)
            if hwg is None:
                continue

            items = self.scrape_category(hwg_id=hwg, max_pages=effective_pages, page_size=page_size)

            if isinstance(cat_item, str) and not cat_item.isdigit():
                results[cat_item] = items
            else:
                cat_name = _category_name(hwg) or f"HWG_{hwg}"
                results[cat_name] = items

        return results


CatalogScraper = CatalogExtractor

__all__ = ["CatalogExtractor", "CatalogScraper"]
