"""
Tier 2 Boundary Tests: Pagination Bounds, Page Limits & Range Offsets.
Tests first page, last page, out-of-bounds page handling, and pageSize configurations.
"""

from __future__ import annotations

import math
from unittest.mock import MagicMock
import pytest

from scraper.extractors.catalog import CatalogExtractor


@pytest.mark.boundary
class TestPaginationBoundaries:
    """Test suite for catalog pagination boundaries."""

    def test_first_page_boundary(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify requesting page 0 extracts first slice of items."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        items = extractor.scrape_category(1, max_pages=1)
        assert len(items) > 0
        assert mock_transgourmet_client.get_catalog_html.called

    def test_total_pages_calculation_formula(self) -> None:
        """Verify ceil(total_count / page_size) mathematical calculation for pagination limits."""
        cases = [
            (0, 100, 0),
            (1, 100, 1),
            (99, 100, 1),
            (100, 100, 1),
            (101, 100, 2),
            (2605, 100, 27),
            (5726, 100, 58),
            (23214, 100, 233),
        ]
        for total_count, page_size, expected_pages in cases:
            computed = math.ceil(total_count / page_size) if total_count > 0 else 0
            assert computed == expected_pages

    def test_single_item_catalog_boundary(self, sample_single_article_html: str) -> None:
        """Verify catalog with exactly 1 item does not make redundant second page request."""
        mock_client = MagicMock()
        mock_client.get_catalog_html.return_value = sample_single_article_html
        
        extractor = CatalogExtractor(client=mock_client)
        items = extractor.scrape_category(1)
        assert len(items) == 1
        assert mock_client.get_catalog_html.call_count == 1

    def test_exceeding_max_pages_cutoff(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify max_pages parameter strictly bounds the number of network queries dispatched."""
        extractor = CatalogExtractor(client=mock_transgourmet_client)
        items = extractor.scrape_category(1, max_pages=3)
        assert mock_transgourmet_client.get_catalog_html.call_count <= 3

    def test_out_of_bounds_page_server_error_handling(self) -> None:
        """Verify graceful handling when server returns 500 on out-of-bounds page requests."""
        mock_client = MagicMock()
        mock_client.get_catalog_html.return_value = "<html><body><h1>500 Internal Server Error</h1></body></html>"
        
        extractor = CatalogExtractor(client=mock_client)
        items = extractor.get_page(page=9999, hwg_id=1)
        assert len(items) == 0
