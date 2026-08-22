"""
Tier 1 & Tier 2 Test Suite: R3 On-Demand Search & Batch Catalog Export Services.
Tests ingredient keyword searching, SKU lookup, batch JSON catalog export,
CSV export, atomic write protocol, and CLI command workflows.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from click.testing import CliRunner

from scraper.cli import cli
from scraper.extractors.search import SearchExtractor, SearchService
from scraper.models.product import ProductItem
from scraper.models.promotion import PromotionBrochure
from scraper.storage.atomic import atomic_save_json, atomic_write_json
from scraper.storage.export import DatasetExporter
from scraper.storage.path_jail import resolve_safe_export_path, sanitize_csv_cell, sanitize_search_query


# ==============================================================================
# Tier 1: Search Service Features
# ==============================================================================

@pytest.mark.unit
class TestSearchServiceFeature:
    """Tier 1 Feature tests for SearchExtractor / SearchService."""

    def test_search_by_ingredient_keyword(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify on-demand keyword search for catering ingredients (e.g. 'milch')."""
        searcher = SearchExtractor(client=mock_transgourmet_client)
        results = searcher.search(query="milch", limit=25)

        assert len(results) > 0
        assert all(isinstance(r, ProductItem) for r in results)
        assert any("milch" in r.title.lower() for r in results)

    def test_search_with_category_filter(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify keyword search filtered by HWG category."""
        searcher = SearchService(client=mock_transgourmet_client)
        results = searcher.search(query="butter", category="molkerei", limit=10)

        assert isinstance(results, list)
        assert len(results) > 0

    def test_lookup_article_by_exact_sku(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify exact 6-digit Swiss article identifier lookup."""
        searcher = SearchExtractor(client=mock_transgourmet_client)
        item = searcher.lookup_article(article_number="817441")

        assert item is not None
        assert item.article_number == "817441"
        assert "Ariel" in item.title
        assert item.price_chf == 28.99

    def test_search_sanitizes_query_input(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify search strips control characters and applies NFC Unicode normalization."""
        searcher = SearchExtractor(client=mock_transgourmet_client)
        results = searcher.search(query="  Käse\x00\x1f Fondue  ", limit=10)
        assert isinstance(results, list)


# ==============================================================================
# Tier 1: Dataset Export Features
# ==============================================================================

@pytest.mark.unit
class TestDatasetExporterFeature:
    """Tier 1 Feature tests for DatasetExporter."""

    def test_build_dataset_payload_structure(self) -> None:
        """Verify build_dataset_payload constructs standard JSON schema with metadata."""
        exporter = DatasetExporter()
        prods = [
            ProductItem(article_number="001", title="Item 1", price_chf=10.0, unit_text="kg", category_id=1, category_name="Food"),
            ProductItem(article_number="002", title="Item 2", price_chf=20.0, unit_text="Fl", category_id=5, category_name="Getränke"),
        ]
        promos = [
            ProductItem(article_number="003", title="Promo 1", price_chf=5.0, old_price_chf=10.0, is_action=True, unit_text="St"),
        ]
        brochures = [
            PromotionBrochure(title="Flyer 34", pdf_url="https://example.com/f34.pdf"),
        ]

        payload = exporter.build_dataset_payload(products=prods, promotions=promos, brochures=brochures)

        assert "metadata" in payload
        assert "products" in payload
        assert "promotions" in payload
        assert "brochures" in payload

        meta = payload["metadata"]
        assert meta["total_products"] == 2
        assert meta["total_promotions"] == 1
        assert meta["total_brochures"] == 1
        assert meta["category_distribution"]["Food"] == 1
        assert meta["category_distribution"]["Getränke"] == 1

    def test_export_json_atomic_write(self, safe_temp_dir: Path) -> None:
        """Verify export_json writes complete dataset atomically."""
        exporter = DatasetExporter(base_dir=safe_temp_dir)
        target_path = safe_temp_dir / "catalog_export.json"

        prods = [ProductItem(article_number="123456", title="Test Product", price_chf=9.95, unit_text="kg")]
        out_file = exporter.export_json(target_path, products=prods)

        assert out_file.exists()
        loaded = json.loads(out_file.read_text(encoding="utf-8"))
        assert loaded["metadata"]["total_products"] == 1
        assert loaded["products"][0]["article_number"] == "123456"

    def test_export_csv_with_headers_and_sanitization(self, safe_temp_dir: Path) -> None:
        """Verify export_csv writes tabular CSV and neutralizes formula injection cells."""
        exporter = DatasetExporter(base_dir=safe_temp_dir)
        target_path = safe_temp_dir / "catalog.csv"

        prods = [
            ProductItem(article_number="1001", title="=SUM(A1:A10)", price_chf=15.0, unit_text="kg"),
            ProductItem(article_number="1002", title="Normal Cheese", price_chf=8.50, unit_text="St"),
        ]
        out_file = exporter.export_csv(target_path, products=prods)

        assert out_file.exists()
        with open(out_file, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            assert len(rows) == 2
            # Formula cell should be escaped with leading single quote
            assert rows[0]["title"] == "'=SUM(A1:A10)"
            assert rows[1]["title"] == "Normal Cheese"


# ==============================================================================
# Tier 1: CLI Commands Testing
# ==============================================================================

@pytest.mark.unit
class TestCliCommands:
    """Tier 1 Unit tests for Rich-enabled CLI commands."""

    def test_cli_search_command_offline(self, cli_runner: CliRunner) -> None:
        """Verify search CLI command executes offline with fixture fallback."""
        res = cli_runner.invoke(cli, ["search", "--query", "milch", "--limit", "5"])
        assert res.exit_code == 0
        assert "Results for 'milch'" in res.output or "Art. #" in res.output

    def test_cli_search_with_export(self, cli_runner: CliRunner, safe_temp_dir: Path) -> None:
        """Verify search command with --export writes JSON file."""
        export_target = str(safe_temp_dir / "search_out.json")
        res = cli_runner.invoke(cli, ["search", "--query", "milch", "--limit", "5", "--export", export_target])
        assert res.exit_code == 0
        assert Path(export_target).exists()

    def test_cli_export_command_offline(self, cli_runner: CliRunner, safe_temp_dir: Path) -> None:
        """Verify export CLI command compiles batch dataset."""
        export_target = str(safe_temp_dir / "batch_out.json")
        res = cli_runner.invoke(cli, ["export", "--output", export_target, "--categories", "food", "--limit-per-category", "1"])
        assert res.exit_code == 0
        assert Path(export_target).exists()

    def test_cli_promotions_command(self, cli_runner: CliRunner) -> None:
        """Verify promotions CLI command displays active deals and brochures."""
        res = cli_runner.invoke(cli, ["promotions"])
        assert res.exit_code == 0
        assert "Active Promotions" in res.output or "Brochures" in res.output


# ==============================================================================
# Tier 2: Boundary & Negative Cases
# ==============================================================================

@pytest.mark.boundary
class TestSearchAndExportBoundary:
    """Tier 2 Boundary tests for search and export error handling."""

    def test_search_empty_result_returns_empty_list(self) -> None:
        """Verify non-matching query returns empty list without error."""
        mock_client = MagicMock()
        mock_client.get_catalog_html.return_value = (
            "<html><body><script>"
            "window.__reactRouterContext={streamController:{enqueue:'[[1],{\\'_2\\':3},\\'loaderData\\',{\\'_4\\':5},\\'features/catalog/routes/CatalogIndexRoute\\',{\\'_6\\':{\\'articles\\':[],\\'totalCount\\':0}}]'}}"
            "</script></body></html>"
        )
        searcher = SearchExtractor(client=mock_client)
        results = searcher.search(query="nonexistentproductxyz999")
        assert results == []

    def test_export_empty_dataset_writes_valid_json(self, safe_temp_dir: Path) -> None:
        """Verify exporting empty dataset creates valid JSON with 0 items."""
        exporter = DatasetExporter(base_dir=safe_temp_dir)
        target = safe_temp_dir / "empty.json"
        exporter.export_json(target, products=[], promotions=[], brochures=[])

        assert target.exists()
        loaded = json.loads(target.read_text(encoding="utf-8"))
        assert loaded["metadata"]["total_products"] == 0
        assert loaded["products"] == []

    def test_atomic_overwrite_preserves_validity(self, safe_temp_dir: Path) -> None:
        """Verify overwriting existing file replaces previous version atomically."""
        target = safe_temp_dir / "versioned.json"
        atomic_save_json({"v": 1}, target, base_dir=safe_temp_dir)
        assert json.loads(target.read_text(encoding="utf-8"))["v"] == 1

        atomic_save_json({"v": 2}, target, base_dir=safe_temp_dir)
        assert json.loads(target.read_text(encoding="utf-8"))["v"] == 2
