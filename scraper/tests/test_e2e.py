"""
Tier 3 (Cross-Feature Integration) & Tier 4 (Real-World Catering Application Scenarios).
Implements complete end-to-end integration workflows and application scenarios S1-S5
for automated catering meal planning per TEST_INFRA.md and PROJECT.md.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from scraper.client.session import TransgourmetClient, TransgourmetSession
from scraper.exceptions import PathTraversalError, SecurityValidationError
from scraper.extractors.catalog import CatalogExtractor
from scraper.extractors.promotions import PromotionExtractor
from scraper.extractors.search import SearchExtractor
from scraper.models.product import ProductItem
from scraper.storage.atomic import atomic_save_json
from scraper.storage.export import DatasetExporter
from scraper.storage.path_jail import resolve_safe_export_path


# ==============================================================================
# Tier 3: Cross-Feature Integration Workflows
# ==============================================================================

@pytest.mark.integration
class TestCrossFeatureIntegration:
    """Tier 3 Cross-feature integration pipeline tests."""

    def test_full_pipeline_catalog_promotions_and_export(
        self, mock_transgourmet_client: MagicMock, safe_temp_dir: Path
    ) -> None:
        """
        Cross-Feature: End-to-End Pipeline
        1. Extract catalog category products
        2. Extract active promotional discounts
        3. Extract promotional brochures
        4. Compile and atomically export to JSON and CSV datasets
        """
        cat_extractor = CatalogExtractor(client=mock_transgourmet_client)
        promo_extractor = PromotionExtractor(client=mock_transgourmet_client)
        exporter = DatasetExporter(base_dir=safe_temp_dir)

        # 1. Scrape catalog
        food_products = cat_extractor.scrape_category(hwg_id=1, max_pages=1)
        assert len(food_products) > 0

        # 2. Scrape promotions
        promotions = promo_extractor.scrape_active_promotions(max_pages=1)
        assert len(promotions) > 0

        # 3. Scrape brochures
        brochures = promo_extractor.scrape_brochures()
        assert len(brochures) > 0

        # 4. Export JSON
        json_target = safe_temp_dir / "pipeline_export.json"
        out_json = exporter.export_json(
            target_path=json_target,
            products=food_products,
            promotions=promotions,
            brochures=brochures,
        )
        assert out_json.exists()
        loaded_json = json.loads(out_json.read_text(encoding="utf-8"))
        assert loaded_json["metadata"]["total_products"] == len(food_products)
        assert loaded_json["metadata"]["total_promotions"] == len(promotions)
        assert loaded_json["metadata"]["total_brochures"] == len(brochures)

        # 5. Export CSV
        csv_target = safe_temp_dir / "pipeline_export.csv"
        out_csv = exporter.export_csv(target_path=csv_target, products=food_products)
        assert out_csv.exists()

    def test_search_and_detail_enrichment_flow(self, mock_transgourmet_client: MagicMock) -> None:
        """
        Cross-Feature: Search -> Detail Query -> Pricing & Packaging Analysis
        """
        searcher = SearchExtractor(client=mock_transgourmet_client)
        
        # Search for milk
        results = searcher.search(query="milch", limit=5)
        assert len(results) > 0

        # Lookup detail for first item
        first_sku = results[0].article_number
        assert first_sku != ""

        detail_item = searcher.lookup_article(first_sku)
        assert detail_item is not None
        assert detail_item.article_number == first_sku
        assert detail_item.price_chf >= 0.0


# ==============================================================================
# Tier 4: Real-World Catering Scenarios (S1 to S5)
# ==============================================================================

@pytest.mark.application
class TestCateringApplicationScenarios:
    """Tier 4 Real-world catering meal planning application scenarios (S1-S5)."""

    def test_scenario_s1_institutional_meal_plan_batch_export(
        self, mock_transgourmet_client: MagicMock, safe_temp_dir: Path
    ) -> None:
        """
        Scenario S1: Institutional Meal Plan Batch Export
        Export 5 core food categories (Food 1, Drinks 5, Dairy 6, Produce 7, Meat 8) to catalog_export.json.
        Verify CHF prices, stock flags, and packaging units are valid for kitchen budgeting.
        """
        cat_extractor = CatalogExtractor(client=mock_transgourmet_client)
        exporter = DatasetExporter(base_dir=safe_temp_dir)

        core_hwgs = [1, 5, 6, 7, 8]  # Swiss wholesale food categories
        category_map = cat_extractor.scrape_all_categories(categories=core_hwgs, max_pages_per_category=1)

        all_products = []
        for cat_name, items in category_map.items():
            all_products.extend(items)

        export_target = safe_temp_dir / "catalog_export.json"
        out_file = exporter.export_json(target_path=export_target, products=all_products)

        # Verification of catering requirements
        assert out_file.exists()
        loaded = json.loads(out_file.read_text(encoding="utf-8"))
        prods = loaded["products"]
        assert len(prods) > 0

        for item in prods:
            # 1. Exact CHF currency precision
            assert isinstance(item["price_chf"], (int, float))
            assert item["price_chf"] >= 0.0
            # 2. Packaging unit valid for portion calculation
            assert item["unit_text"] in ["kg", "Fl", "St", "Kt", "Bx", "Pa", "Bt", "Ds", "Be", "Tp", "Rl", "Pk", "Sc"]
            # 3. Availability flag present
            assert "is_available" in item

    def test_scenario_s2_weekly_promotional_meal_optimization(
        self, mock_transgourmet_client: MagicMock
    ) -> None:
        """
        Scenario S2: Weekly Promotional Meal Optimization
        Query active action items, identify discounts >= 20%, map against weekly promotional flyer PDF links.
        """
        promo_extractor = PromotionExtractor(client=mock_transgourmet_client)
        actions = promo_extractor.scrape_active_promotions(max_pages=1)
        brochures = promo_extractor.scrape_brochures()

        # Identify major catering discounts (>= 20%)
        high_discounts = []
        for item in actions:
            if item.old_price_chf and item.old_price_chf > item.price_chf:
                pct = (item.old_price_chf - item.price_chf) / item.old_price_chf * 100
                if pct >= 20.0:
                    high_discounts.append((item, pct))

        assert len(high_discounts) > 0
        assert len(brochures) > 0

        # Verify brochure PDFs have valid links for kitchen staff reference
        assert all(b.pdf_url.endswith(".pdf") for b in brochures)
        assert any(b.calendar_week == 34 for b in brochures)

    def test_scenario_s3_allergy_and_dietary_search_querying(
        self, mock_transgourmet_client: MagicMock
    ) -> None:
        """
        Scenario S3: Allergy & Dietary Search Querying
        Search multi-keyword queries (e.g. 'laktosefrei butter', 'bio rinds-voressen', 'glutenfrei pasta'),
        verify schema normalization, price extraction, and clean outputs.
        """
        searcher = SearchExtractor(client=mock_transgourmet_client)
        dietary_terms = ["laktosefrei milch", "bio rinds-voressen", "glutenfrei pasta"]

        for query in dietary_terms:
            results = searcher.search(query=query, limit=10)
            assert isinstance(results, list)
            for r in results:
                assert r.article_number != ""
                assert r.price_chf >= 0.0
                assert isinstance(r.origin, list)

    @patch("requests.Session.request")
    def test_scenario_s4_network_failure_and_429_recovery(self, mock_request: MagicMock) -> None:
        """
        Scenario S4: Network Failure & 429 Throttle Recovery
        Simulate 429 Too Many Requests with Retry-After; verify automatic recovery without data loss.
        """
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.headers = {"Retry-After": "0"}

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.text = "<html><body><script>window.__reactRouterContext={streamController:{enqueue:'[[1],{\\'_2\\':3},\\'loaderData\\',{\\'_4\\':5},\\'features/catalog/routes/CatalogIndexRoute\\',{\\'_6\\':{\\'articles\\':[{\\'articleNumber\\':\\'999\\',\\'description\\':\\'Recovered Milk\\',\\'price\\':2.50,\\'unitText\\':\\'Fl\\'}],\\'totalCount\\':1}}]'}}</script></body></html>"
        resp_200.headers = {}

        mock_request.side_effect = [resp_429, resp_200]

        session = TransgourmetSession(max_retries=2, rate_limiter_enabled=False)
        extractor = CatalogExtractor(client=TransgourmetClient(rate_limiter_enabled=False))
        extractor.client.session = session

        products = extractor.scrape_category(hwg_id=1, max_pages=1)
        assert len(products) == 1
        assert products[0].article_number == "999"
        assert mock_request.call_count == 2

    def test_scenario_s5_atomic_crash_defense_and_path_traversal(
        self, safe_temp_dir: Path
    ) -> None:
        """
        Scenario S5: Atomic Crash Defense & Path Traversal Injection
        Attempt path traversal export paths ('../../etc/passwd'); verify safe export directory remains intact.
        """
        with pytest.raises((PathTraversalError, SecurityValidationError, ValueError)):
            resolve_safe_export_path("../../../etc/passwd", base_dir=safe_temp_dir)

        # Confirm jail integrity
        assert safe_temp_dir.exists()
        assert not (safe_temp_dir / "passwd").exists()
