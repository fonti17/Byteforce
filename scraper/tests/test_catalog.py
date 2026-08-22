"""
Tier 1 & Tier 2 Test Suite: R1 Product & Pricing Scraper (CatalogExtractor / CatalogScraper).
Tests extraction across all Hauptwarengruppen (HWG 1, 5, 6, 7, 8), packaging units,
availability flags, pricing models, and fault-tolerant pagination.
"""

from __future__ import annotations

import math
from unittest.mock import MagicMock
import pytest

from scraper.extractors.catalog import CatalogExtractor, CatalogScraper
from scraper.models.product import ProductItem, ProductRecord
from scraper.parsers.turbostream import (
    decode_turbostream_html,
    extract_search_response,
    parse_article_dict,
    parse_articles_from_html,
)


# ==============================================================================
# Tier 1: Category Scraping & Extraction Features
# ==============================================================================

@pytest.mark.unit
class TestCatalogExtractorFeature:
    """Tier 1 Feature tests for CatalogExtractor."""

    def test_scrape_food_category_hwg_1(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of products for HWG 1 (Food / Grundnahrungsmittel)."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        products = extractor.scrape_category(hwg_id=1, max_pages=1)

        assert len(products) > 0
        first = products[0]
        assert isinstance(first, ProductItem)
        assert first.article_number != ""
        assert first.title != ""
        assert first.price_chf >= 0.0
        assert first.unit_text != ""

    def test_scrape_meat_category_hwg_8(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of products for HWG 8 (Metzgerei / Meat)."""
        extractor = CatalogScraper(client=mock_transgourmet_client)
        products = extractor.scrape_category(category=8, max_pages=1)

        assert len(products) > 0
        for p in products:
            assert p.price_chf > 0
            assert p.unit_text in ["kg", "Fl", "St", "Kt", "Bx", "Pa", "Bt", "Ds", "Be", "Tp", "Rl", "Pk", "Sc"]

    def test_scrape_dairy_category_hwg_6(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of products for HWG 6 (Molkerei / Backwaren)."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        products = extractor.scrape_category(category="molkerei", max_pages=1)

        assert len(products) > 0
        assert all(p.category_id == 6 or p.category_name == "Molkerei/Backwaren" for p in products)

    def test_scrape_produce_category_hwg_7(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of products for HWG 7 (Früchte + Gemüse)."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        products = extractor.scrape_category(category="fruechte-gemuese", max_pages=1)

        assert len(products) > 0
        assert all(isinstance(p.origin, list) for p in products)

    def test_scrape_beverages_category_hwg_5(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of products for HWG 5 (Getränke / Drinks)."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        products = extractor.scrape_category(category="drinks", max_pages=1)

        assert len(products) > 0

    def test_scrape_all_categories_multi_hwg(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify scrape_all_categories aggregates results for multiple HWGs into a dictionary."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        hwg_selection = [1, 5, 6, 7, 8]  # Food, Drinks, Dairy, Produce, Meat
        results = extractor.scrape_all_categories(categories=hwg_selection, max_pages_per_category=1)

        assert isinstance(results, dict)
        assert len(results) == 5
        for cat_name, items in results.items():
            assert len(items) > 0
            assert all(isinstance(p, ProductItem) for p in items)

    def test_product_record_pricing_and_packaging_attributes(self, sample_actions_json: dict) -> None:
        """Verify raw article dictionary mapping captures price, unit, and availability correctly."""
        articles = sample_actions_json["loaderData"]["features/catalog/routes/CatalogIndexRoute"]["searchResponse"]["articles"]
        assert len(articles) > 0

        parsed_items = [parse_article_dict(a, category_id=7, category_name="Früchte + Gemüse") for a in articles]
        assert len(parsed_items) == len(articles)

        # Check sample item properties
        sample = parsed_items[0]
        assert sample.article_number == "040967"
        assert "Cherry Tomaten" in sample.title
        assert sample.price_chf == 4.10
        assert sample.old_price_chf == 5.15
        assert sample.is_action is True
        assert sample.discount_percent is not None
        assert sample.is_available is True
        assert "Schweiz" in sample.origin


# ==============================================================================
# Tier 2: Boundary & Edge Case Tests
# ==============================================================================

@pytest.mark.boundary
class TestCatalogExtractorBoundary:
    """Tier 2 Boundary tests for empty responses, pagination bounds, and stream fault isolation."""

    def test_unrecognized_category_returns_empty_list(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify invalid category slug returns empty list without raising exception."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        result = extractor.scrape_category(category="invalid_nonexistent_hwg")
        assert result == []

    def test_empty_articles_array_handles_gracefully(self) -> None:
        """Verify HTML response with 0 articles returns empty list."""
        mock_client = MagicMock()
        mock_client.get_catalog_html.return_value = (
            "<html><body><script>"
            "window.__reactRouterContext={streamController:{enqueue:'[[1],{\\'_2\\':3},\\'loaderData\\',{\\'_4\\':5},\\'features/catalog/routes/CatalogIndexRoute\\',{\\'_6\\':{\\'articles\\':[],\\'totalCount\\':0}}]'}}"
            "</script></body></html>"
        )
        extractor = CatalogExtractor(client=mock_client)
        products = extractor.scrape_category(hwg_id=1, max_pages=1)
        assert products == []

    def test_pagination_bounds_respected(self, sample_actions_html: str) -> None:
        """Verify max_pages parameter halts extraction after specified number of pages."""
        mock_client = MagicMock()
        mock_client.get_catalog_html.return_value = sample_actions_html

        extractor = CatalogExtractor(client=mock_client)
        products = extractor.scrape_category(hwg_id=1, max_pages=2, page_size=100)

        # 2 pages * 100 items = 200 items
        assert len(products) == 200
        assert mock_client.get_catalog_html.call_count == 2

    def test_fault_isolation_single_broken_item_in_stream(self) -> None:
        """Verify a single corrupted article record in stream does not prevent parsing of sibling records."""
        html_with_broken_record = (
            "<html><body><script>"
            "window.__reactRouterContext={streamController:{enqueue:'[[1],{\\'_2\\':3},\\'loaderData\\',{\\'_4\\':5},\\'features/catalog/routes/CatalogIndexRoute\\',{\\'_6\\':{\\'articles\\':[{\\'articleNumber\\':\\'1001\\',\\'description\\':\\'Item 1\\',\\'price\\':5.0,\\'unitText\\':\\'kg\\'},{\\'broken\\':true},{\\'articleNumber\\':\\'1002\\',\\'description\\':\\'Item 2\\',\\'price\\':8.5,\\'unitText\\':\\'Fl\\'}],\\'totalCount\\':3}}]'}}"
            "</script></body></html>"
        )
        products = parse_articles_from_html(html_with_broken_record)
        # Should extract Item 1 and Item 2, isolating the broken dict
        assert len(products) == 2
        assert products[0].article_number == "1001"
        assert products[1].article_number == "1002"

    @pytest.mark.live
    def test_live_catalog_scrape(self) -> None:
        """Live Integration: Query live Transgourmet catalog for HWG 1 (Food)."""
        extractor = CatalogExtractor()
        products = extractor.scrape_category(hwg_id=1, max_pages=1)
        assert len(products) > 0
        assert all(p.price_chf > 0 for p in products)
