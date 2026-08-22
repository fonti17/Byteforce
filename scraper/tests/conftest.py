"""
Pytest configuration and central test fixtures for Transgourmet Switzerland Web Scraper.
Provides offline deterministic fixtures, mock client injectors, and CLI test helpers.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Generator
from unittest.mock import MagicMock

import pytest
from click.testing import CliRunner

# Path constants and sys.path registration
TESTS_DIR = Path(__file__).resolve().parent
SCRAPER_ROOT = TESTS_DIR.parent
WORKSPACE_ROOT = SCRAPER_ROOT.parent

for p in [str(SCRAPER_ROOT), str(SCRAPER_ROOT / "scraper"), str(WORKSPACE_ROOT)]:
    if p not in sys.path:
        sys.path.insert(0, p)

FIXTURES_DIR = TESTS_DIR / "fixtures"


def pytest_addoption(parser: pytest.Parser) -> None:
    """Register custom command line flags."""
    parser.addoption(
        "--run-live",
        action="store_true",
        default=False,
        help="Run live network integration tests against transgourmet.ch",
    )


def pytest_configure(config: pytest.Config) -> None:
    """Register custom markers."""
    config.addinivalue_line("markers", "unit: Tier 1 Unit Tests")
    config.addinivalue_line("markers", "boundary: Tier 2 Boundary & Negative Tests")
    config.addinivalue_line("markers", "integration: Tier 3 Cross-Feature Integration Tests")
    config.addinivalue_line("markers", "application: Tier 4 Real-World Application & Catering Scenarios")
    config.addinivalue_line("markers", "security: Tier 5 Adversarial Penetration & Security Tests")
    config.addinivalue_line("markers", "live: Tests requiring live internet access to Transgourmet Switzerland")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip live tests unless --run-live is explicitly passed."""
    if not config.getoption("--run-live"):
        skip_live = pytest.mark.skip(reason="Live test requires --run-live flag to run against public endpoints")
        for item in items:
            if "live" in item.keywords:
                item.add_marker(skip_live)


# --- Raw Fixture Loaders ---

@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    """Return absolute path to fixtures directory."""
    return FIXTURES_DIR


@pytest.fixture(scope="session")
def sample_brochures_html() -> str:
    """Load raw HTML from aktionen_broschueren.html fixture."""
    path = FIXTURES_DIR / "aktionen_broschueren.html"
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def sample_actions_html() -> str:
    """Load raw HTML from catalog_actions_promotions.html fixture."""
    path = FIXTURES_DIR / "catalog_actions_promotions.html"
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def sample_actions_json() -> dict[str, Any]:
    """Load decoded JSON from catalog_actions_promotions_decoded.json fixture."""
    path = FIXTURES_DIR / "catalog_actions_promotions_decoded.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def sample_search_milch_html() -> str:
    """Load raw HTML from catalog_search_milch.html fixture."""
    path = FIXTURES_DIR / "catalog_search_milch.html"
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def sample_search_milch_json() -> dict[str, Any]:
    """Load decoded JSON from catalog_search_milch_decoded.json fixture."""
    path = FIXTURES_DIR / "catalog_search_milch_decoded.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def sample_single_article_html() -> str:
    """Load raw HTML from catalog_single_article_817441.html fixture."""
    path = FIXTURES_DIR / "catalog_single_article_817441.html"
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def sample_single_article_json() -> dict[str, Any]:
    """Load decoded JSON from catalog_single_article_817441_decoded.json fixture."""
    path = FIXTURES_DIR / "catalog_single_article_817441_decoded.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def sample_home_html() -> str:
    """Load raw HTML from prodega_easy_home.html fixture."""
    path = FIXTURES_DIR / "prodega_easy_home.html"
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def sample_home_json() -> dict[str, Any]:
    """Load decoded JSON from prodega_easy_home_decoded.json fixture."""
    path = FIXTURES_DIR / "prodega_easy_home_decoded.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def sample_sortiment_html() -> str:
    """Load raw HTML from sortiment_overview.html fixture."""
    path = FIXTURES_DIR / "sortiment_overview.html"
    return path.read_text(encoding="utf-8")


# --- Utilities & Test Mocks ---

@pytest.fixture
def cli_runner() -> CliRunner:
    """Provide Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def safe_temp_dir() -> Generator[Path, None, None]:
    """Provide an isolated temporary directory within workspace for file export & storage tests."""
    scratch_root = WORKSPACE_ROOT / ".test_scratch"
    scratch_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="tg_test_export_", dir=str(scratch_root)))
    try:
        yield temp_dir
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def mock_transgourmet_client(
    sample_brochures_html: str,
    sample_actions_html: str,
    sample_search_milch_html: str,
    sample_single_article_html: str,
    sample_home_html: str,
) -> MagicMock:
    """
    Mock Transgourmet HTTP client returning appropriate HTML responses based on query params.
    """
    client = MagicMock()
    client.corporate_base_url = "https://www.transgourmet.ch"
    client.base_url = "https://web.transgourmet.ch"
    
    def fake_get_catalog_html(
        search_term: str = "",
        page: int = 0,
        page_size: int = 100,
        hwg_id: int | None = None,
        is_action: bool = False,
        is_novelty: bool = False,
    ) -> str:
        if is_action:
            return sample_actions_html
        if search_term == "817441":
            return sample_single_article_html
        if search_term and "milch" in str(search_term).lower():
            return sample_search_milch_html
        if page > 100:
            return "<html><body>500 Internal Server Error</body></html>"
        return sample_actions_html

    def fake_get_brochures_html() -> str:
        return sample_brochures_html

    def fake_get_home_html() -> str:
        return sample_home_html

    client.get_catalog.side_effect = fake_get_catalog_html
    client.get_catalog_html.side_effect = fake_get_catalog_html
    client.get_articles_search.side_effect = fake_get_catalog_html
    client.get_brochures_html.side_effect = fake_get_brochures_html
    client.get_home_html.side_effect = fake_get_home_html
    client.download_brochure_pdf.return_value = b"%PDF-1.5 test pdf content binary stream"
    
    return client
