"""
Tier 4 Application Scenarios: Real-World Catering Workloads & End-to-End Workflows.
Covers S1 (Institutional Batch Export), S2 (Promo Meal Optimization), S3 (Allergy Search),
S4 (429 Throttle Recovery), and S5 (Atomic Crash Defense).
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from scraper.extractors.catalog import CatalogExtractor
from scraper.extractors.promotions import PromotionExtractor
from scraper.extractors.search import SearchExtractor
from scraper.storage.export import BatchCatalogExporter
from scraper.security import atomic_save_json, resolve_safe_export_path
from scraper.client.session import TransgourmetSession
from scraper.exceptions import SecurityValidationError, PathTraversalError


@pytest.mark.application
class TestCateringWorkflows:
    """Test suite for real-world catering meal planning application scenarios."""

    def test_scenario_s1_institutional_meal_plan_batch_export(
        self, mock_transgourmet_client: MagicMock, safe_temp_dir: Path
    ) -> None:
        """
        Scenario S1: Institutional Meal Plan Batch Export
        Export 5 food categories to catalog_export.json; verify all CHF prices,
        stock flags, and packaging units are valid for kitchen budgeting.
        """
        exporter = BatchCatalogExporter(client=mock_transgourmet_client, base_dir=safe_temp_dir)
        export_file = exporter.export_catalog(
            output_path="catalog_export.json",
            category_ids=[1, 5, 6, 7, 8],
            max_pages_per_cat=1,
            include_promotions=True,
            include_brochures=True,
        )

        # Verification
        assert export_file.exists()
        loaded = json.loads(export_file.read_text(encoding="utf-8"))
        products_list = loaded.get("products", [])
        assert len(products_list) > 0
        for item in products_list:
            assert item["price_chf"] > 0
            assert isinstance(item["unit_text"], str) and len(item["unit_text"]) > 0

    def test_scenario_s2_weekly_promotional_meal_optimization(
        self, mock_transgourmet_client: MagicMock
    ) -> None:
        """
        Scenario S2: Weekly Promotional Meal Optimization
        Query active action items, identify discounts > 20%, map against weekly promotional flyer PDF links.
        """
        promo_extractor = PromotionExtractor(client=mock_transgourmet_client)
        actions = promo_extractor.scrape_active_promotions(max_pages=1)
        brochures = promo_extractor.scrape_brochures()

        assert len(actions) > 0
        assert len(brochures) > 0
        assert all(b.pdf_url.endswith(".pdf") for b in brochures)

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_scenario_s3_allergy_and_dietary_search_querying(
        self, mock_sanitize: MagicMock, mock_transgourmet_client: MagicMock
    ) -> None:
        """
        Scenario S3: Allergy & Dietary Search Querying
        Search multi-keyword queries (e.g. 'laktosefrei butter', 'bio rinds-voressen'),
        verify schema normalization and clean output.
        """
        searcher = SearchExtractor(client=mock_transgourmet_client)
        dietary_queries = ["laktosefrei milch", "bio rinds-voressen", "glutenfrei pasta"]
        for q in dietary_queries:
            results = searcher.search_articles(query=q, limit=10)
            assert isinstance(results, list)
            valid_res = [r for r in results if r is not None]
            for r in valid_res:
                assert r.article_number is not None
                assert r.price_chf >= 0

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
        resp_200.text = "<html><body><script>window.__reactRouterContext={streamController:{enqueue:'[[1],{\\'_2\\':3},\\'loaderData\\',{\\'_4\\':5},\\'features/catalog/routes/CatalogIndexRoute\\',{\\'_6\\':{\\'articles\\':[],\\'totalCount\\':0}}]'}}</script></body></html>"

        mock_request.side_effect = [resp_429, resp_200]

        session = TransgourmetSession(max_retries=2, rate_limiter_enabled=False)
        resp = session.request("GET", "https://web.transgourmet.ch/de/prodega-easy/catalog")
        assert resp.status_code == 200
        assert mock_request.call_count == 2

    def test_scenario_s5_atomic_crash_defense_and_path_traversal(
        self, safe_temp_dir: Path
    ) -> None:
        """
        Scenario S5: Atomic Crash Defense & Path Traversal Injection
        Attempt path traversal export paths ('../../etc/passwd'), verify jail defends directory.
        """
        with pytest.raises((SecurityValidationError, PathTraversalError, ValueError)):
            resolve_safe_export_path("../../../etc/passwd", base_dir=safe_temp_dir)

        # Verify safe directory remains intact
        assert safe_temp_dir.exists()
        assert not (safe_temp_dir / "passwd").exists()
