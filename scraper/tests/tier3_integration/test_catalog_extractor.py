"""
Tier 3 Integration Tests: Catalog Extractor & Hauptwarengruppen Scraping.
Tests end-to-end extraction across categories, multi-page aggregation, and live endpoint validation.
"""

from __future__ import annotations

from unittest.mock import MagicMock
import pytest

from scraper.extractors.catalog import CatalogExtractor
from scraper.client.session import TransgourmetClient
from scraper.models.product import ProductItem


@pytest.mark.integration
class TestCatalogExtractorIntegration:
    """Integration test suite for CatalogExtractor."""

    def test_scrape_single_category_integration(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extracting products from a single Hauptwarengruppe (HWG 1: Food)."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        articles = extractor.scrape_category(1, max_pages=1)
        assert len(articles) > 0
        first = articles[0]
        assert hasattr(first, "article_number")
        assert hasattr(first, "price_chf")
        assert first.unit_text is not None

    def test_multi_page_catalog_aggregation(self, sample_actions_html: str, sample_search_milch_html: str) -> None:
        """Verify extractor aggregates items across multiple paginated requests."""
        mock_client = MagicMock()
        mock_client.get_catalog_html.side_effect = [sample_actions_html, sample_search_milch_html]
        
        extractor = CatalogExtractor(client=mock_client)
        articles = extractor.scrape_category(6, max_pages=2)
        assert len(articles) >= 99

    def test_scrape_all_categories(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify scrape_all_categories iterates through all configured HWG IDs."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        hwg_list = [1, 5, 6, 7, 8]  # Core food HWGs
        results = extractor.scrape_all_categories(category_ids=hwg_list, max_pages_per_cat=1)
        assert isinstance(results, dict)
        assert len(results) == len(hwg_list)
        for cat_name, items in results.items():
            assert len(items) > 0

    @pytest.mark.live
    def test_live_catalog_query(self) -> None:
        """Live Integration: Query live web.transgourmet.ch catalog endpoint for Food HWG 1."""
        client = TransgourmetClient()
        extractor = CatalogExtractor(client=client)
        articles = extractor.scrape_category(1, max_pages=1)
        assert len(articles) > 0
        assert all(a.price_chf > 0 for a in articles)
