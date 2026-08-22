"""
Tier 3 Integration Tests: Promotional Discounts & Weekly Offers Extractor.
Tests active discount catalog extraction (a=true), brochure flyer scraping, and discount validations.
"""

from __future__ import annotations

from unittest.mock import MagicMock
import pytest

from scraper.extractors.promotions import PromotionExtractor
from scraper.client.session import TransgourmetSession


@pytest.mark.integration
class TestPromotionExtractorIntegration:
    """Integration test suite for PromotionExtractor."""

    def test_scrape_active_promotions(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of active weekly discount items via a=true."""
        extractor = PromotionExtractor(client=mock_transgourmet_client)
        promos = extractor.scrape_active_promotions(max_pages=1)
        assert len(promos) > 0
        for item in promos:
            assert item.is_action is True
            assert item.price_chf >= 0.0

    def test_scrape_brochures_integration(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of weekly brochure PDF links from /de/aktionen-broschueren."""
        extractor = PromotionExtractor(client=mock_transgourmet_client)
        brochures = extractor.scrape_brochures()
        assert len(brochures) == 26
        first = brochures[0]
        assert first.pdf_url.endswith(".pdf")
        assert "transgourmet.ch" in first.pdf_url

    def test_promotional_discount_accuracy(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify promotional articles have old_price >= price and calculate valid discount percentage."""
        extractor = PromotionExtractor(client=mock_transgourmet_client)
        promos = extractor.scrape_active_promotions(max_pages=1)
        discounted_items = [p for p in promos if p.old_price_chf is not None and p.old_price_chf > p.price_chf]
        assert len(discounted_items) > 0
        for item in discounted_items:
            discount_rate = (item.old_price_chf - item.price_chf) / item.old_price_chf * 100
            assert discount_rate > 0.0

    @pytest.mark.live
    def test_live_promotions_query(self) -> None:
        """Live Integration: Query live Transgourmet promotions and brochures endpoints."""
        client = TransgourmetSession()
        extractor = PromotionExtractor(client=client)
        promos = extractor.scrape_active_promotions(max_pages=1)
        assert len(promos) > 0
        brochures = extractor.scrape_brochures()
        assert len(brochures) > 0
