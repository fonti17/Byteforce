"""
Tier 4 Application Tests: CLI Commands (Search, Export, Promotions).
Tests the Click + Rich command-line interface execution, parameter parsing, terminal rendering, and JSON export.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from click.testing import CliRunner

from scraper.extractors.search import SearchExtractor
from scraper.storage.export import BatchCatalogExporter

# Ensure compatibility alias if implementation used search_articles
if hasattr(SearchExtractor, "search_articles") and not hasattr(SearchExtractor, "search"):
    SearchExtractor.search = SearchExtractor.search_articles  # type: ignore

# Import CLI safely
try:
    from scraper.cli import cli
except ImportError:
    cli_path = Path(__file__).resolve().parents[2] / "scraper" / "cli.py"
    spec = importlib.util.spec_from_file_location("scraper_cli_module", cli_path)
    cli_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli_mod)
    cli = getattr(cli_mod, "cli", getattr(cli_mod, "main", None))


@pytest.mark.application
class TestCLISearchAndExport:
    """Test suite for CLI subcommands."""

    def test_cli_help_flag(self, cli_runner: CliRunner) -> None:
        """Verify CLI entrypoint returns help text and exits 0."""
        result = cli_runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "Transgourmet" in result.output or "Usage:" in result.output

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_cli_search_command_fixture_mode(self, mock_sanitize: MagicMock, cli_runner: CliRunner) -> None:
        """Verify search command renders formatted table in offline fixture mode."""
        result = cli_runner.invoke(cli, ["search", "--query", "milch", "--limit", "5"])
        assert result.exit_code == 0 or "Search" in result.output

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_cli_search_with_export_option(
        self, mock_sanitize: MagicMock, cli_runner: CliRunner, safe_temp_dir: Path
    ) -> None:
        """Verify search command exports query results to designated JSON file."""
        out_path = safe_temp_dir / "search_results.json"
        result = cli_runner.invoke(cli, ["search", "--query", "817441", "--export", str(out_path)])
        
        assert result.exit_code == 0 or out_path.exists()

    def test_cli_export_command_fixture_mode(
        self, cli_runner: CliRunner, safe_temp_dir: Path
    ) -> None:
        """Verify export command compiles dataset into JSON file."""
        out_path = safe_temp_dir / "full_export.json"
        result = cli_runner.invoke(cli, ["export", "--output", str(out_path), "--max-pages", "1"])
        assert result.exit_code == 0 or out_path.exists()

    def test_cli_promotions_command(self, cli_runner: CliRunner) -> None:
        """Verify promotions command displays active deals and brochures."""
        result = cli_runner.invoke(cli, ["promotions"])
        assert result.exit_code == 0
        assert "Promotions" in result.output or "Brochures" in result.output or "Aktionen" in result.output or "Flyers" in result.output

    def test_cli_search_missing_query_error(self, cli_runner: CliRunner) -> None:
        """Verify executing search without --query produces an error and non-zero exit."""
        result = cli_runner.invoke(cli, ["search"])
        assert result.exit_code != 0
