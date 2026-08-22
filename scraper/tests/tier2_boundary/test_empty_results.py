"""
Tier 2 Boundary Tests: Empty Results, Zero Records & Missing Content.
Tests handling of queries with 0 results, empty categories, zero promotional items, and empty brochures.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest

from scraper.parsers.turbostream import extract_search_response, parse_article_dict
from scraper.parsers.brochures import parse_brochures_html
from scraper.extractors.search import SearchExtractor
from scraper.extractors.promotions import PromotionExtractor


@pytest.mark.boundary
class TestEmptyResultsBoundary:
    """Test suite for empty catalog payloads and zero-result queries."""

    def test_empty_search_stream_response(self) -> None:
        """Verify stream with totalCount=0 and empty articles returns empty search container."""
        empty_stream_dict = {
            "loaderData": {
                "features/catalog/routes/CatalogIndexRoute": {
                    "searchResponse": {
                        "totalCount": 0,
                        "itemCount": 0,
                        "page": 0,
                        "pageSize": 100,
                        "articles": [],
                    }
                }
            }
        }
        resp = extract_search_response(empty_stream_dict)
        assert resp["totalCount"] == 0
        assert resp["articles"] == []

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_search_extractor_empty_results(self, mock_sanitize: MagicMock) -> None:
        """Verify SearchExtractor returns empty list when no articles match query."""
        mock_client = MagicMock()
        mock_client.get_catalog_html.return_value = """
        <script>
        window.__reactRouterContext = {
            streamController: {
                enqueue: "[[1],{\\"_2\\":3,\\"_4\\":5},\\"loaderData\\",{\\"_6\\":7},\\"features/catalog/routes/CatalogIndexRoute\\",{\\"_8\\":9},\\"searchResponse\\",{\\"_10\\":0,\\"_11\\":12},\\"totalCount\\",\\"articles\\",[]]"
            }
        };
        </script>
        """
        searcher = SearchExtractor(client=mock_client)
        results = searcher.search_articles(query="nonexistent_item_999999")
        assert results == []

    def test_promotions_extractor_empty_actions(self) -> None:
        """Verify PromotionExtractor handles empty promotional list cleanly."""
        mock_client = MagicMock()
        mock_client.get_catalog_html.return_value = """
        <script>
        window.__reactRouterContext = {
            streamController: {
                enqueue: "[[1],{\\"_2\\":3,\\"_4\\":5},\\"loaderData\\",{\\"_6\\":7},\\"features/catalog/routes/CatalogIndexRoute\\",{\\"_8\\":9},\\"searchResponse\\",{\\"_10\\":0,\\"_11\\":12},\\"totalCount\\",\\"articles\\",[]]"
            }
        };
        </script>
        """
        promo_extractor = PromotionExtractor(client=mock_client)
        promos = promo_extractor.scrape_active_promotions(max_pages=1)
        assert isinstance(promos, list)
        assert len(promos) == 0

    def test_brochures_empty_dom(self) -> None:
        """Verify brochures parser handles page with zero teaser nodes."""
        html_without_teasers = "<html><head><title>Aktionen</title></head><body><div class='main-content'><p>Keine aktuellen Broschüren verfügbar.</p></div></body></html>"
        brochures = parse_brochures_html(html_without_teasers)
        assert brochures == []
