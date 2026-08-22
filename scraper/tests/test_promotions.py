"""
Tier 1 & Tier 2 Test Suite: R2 Promotional Discounts & Weekly Offers Extractor.
Tests active weekly sortiment promotions (a=true), brochure HTML parsing,
validity date extraction, PDF flyer links, and homepage campaign banners.
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock
import pytest

from scraper.extractors.promotions import PromotionExtractor, PromoExtractor
from scraper.exceptions import MalformedHtmlError
from scraper.models.product import ProductItem
from scraper.models.promotion import PromotionBrochure, BrochureRecord, PromotionCampaign
from scraper.parsers.brochures import parse_brochures_html, parse_date_swiss


# ==============================================================================
# Tier 1: Promotions & Brochure Extraction Features
# ==============================================================================

@pytest.mark.unit
class TestPromotionExtractorFeature:
    """Tier 1 Feature tests for PromotionExtractor."""

    def test_scrape_active_sortiment_promotions(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of active weekly discount items via a=true."""
        extractor = PromotionExtractor(client=mock_transgourmet_client)
        promos = extractor.scrape_active_promotions(max_pages=1)

        assert len(promos) > 0
        for p in promos:
            assert isinstance(p, ProductItem)
            assert p.is_action is True
            assert p.price_chf > 0
            assert p.unit_text != ""

    def test_promotional_discount_calculations(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify that promotional items with old_price have accurate savings percentage."""
        extractor = PromotionExtractor(client=mock_transgourmet_client)
        promos = extractor.scrape_active_promotions(max_pages=1)

        discounted = [p for p in promos if p.old_price_chf and p.old_price_chf > p.price_chf]
        assert len(discounted) > 0
        for item in discounted:
            expected_discount = (item.old_price_chf - item.price_chf) / item.old_price_chf * 100
            assert item.discount_percent is not None
            assert pytest.approx(item.discount_percent, 0.5) == expected_discount

    def test_scrape_brochures_html_parsing(self, sample_brochures_html: str) -> None:
        """Verify parsing 26 weekly promotional PDF brochures from Drupal CMS HTML."""
        brochures = parse_brochures_html(sample_brochures_html)

        assert len(brochures) == 26
        for b in brochures:
            assert isinstance(b, PromotionBrochure)
            assert b.title != ""
            assert b.pdf_url.endswith(".pdf")
            assert "transgourmet.ch" in b.pdf_url

    def test_brochure_metadata_field_extraction(self, sample_brochures_html: str) -> None:
        """Verify extraction of calendar weeks, validity ranges, and thumbnail URLs."""
        brochures = parse_brochures_html(sample_brochures_html)

        # Check KW34 flyer
        kw34_flyers = [b for b in brochures if b.calendar_week == 34]
        assert len(kw34_flyers) > 0
        sample = kw34_flyers[0]
        assert "34" in sample.title
        assert sample.validity_text == "17.08.2026 - 22.08.2026"
        assert sample.valid_from == datetime(2026, 8, 17)
        assert sample.valid_to == datetime(2026, 8, 22)
        assert sample.thumbnail_url is not None
        assert sample.thumbnail_url.startswith("http")

    def test_brochure_type_categorization(self, sample_brochures_html: str) -> None:
        """Verify brochures are correctly tagged as aktionen, bestellliste, or vorverkauf."""
        brochures = parse_brochures_html(sample_brochures_html)
        types = {b.brochure_type for b in brochures}
        assert "aktionen" in types
        assert "bestellliste" in types or "katalog" in types

    def test_scrape_home_highlights(self, mock_transgourmet_client: MagicMock) -> None:
        """Verify extraction of homepage banners, action deals, and novelties."""
        extractor = PromoExtractor(client=mock_transgourmet_client)
        highlights = extractor.scrape_home_highlights()

        assert "actions" in highlights
        assert "novelties" in highlights
        assert "campaigns" in highlights
        assert len(highlights["actions"]) > 0
        assert len(highlights["campaigns"]) > 0


# ==============================================================================
# Tier 2: Boundary & Edge Case Tests
# ==============================================================================

@pytest.mark.boundary
class TestPromotionExtractorBoundary:
    """Tier 2 Boundary tests for malformed HTML, missing dates, and fallback handling."""

    def test_empty_html_raises_malformed_html_error(self) -> None:
        """Verify empty HTML payload raises MalformedHtmlError."""
        with pytest.raises(MalformedHtmlError):
            parse_brochures_html("")

    def test_html_without_teasers_returns_empty_list(self) -> None:
        """Verify HTML page lacking teaser elements returns empty list."""
        empty_dom = "<html><body><div class='main-content'><p>No brochures active</p></div></body></html>"
        brochures = parse_brochures_html(empty_dom)
        assert brochures == []

    def test_teaser_missing_dates_sets_none(self) -> None:
        """Verify teaser without date string parses safely with valid_from=None, valid_to=None."""
        html_snippet = (
            "<div class='tg-promotion-teaser'>"
            "<span class='field--name-title'>Special Magazine</span>"
            "<a class='tg-promotion-teaser__link' href='/public/mag.pdf'>Download</a>"
            "</div>"
        )
        brochures = parse_brochures_html(html_snippet)
        assert len(brochures) == 1
        b = brochures[0]
        assert b.title == "Special Magazine"
        assert b.valid_from is None
        assert b.valid_to is None
        assert b.validity_text is None
        assert b.thumbnail_url is None

    def test_parse_date_swiss_helper(self) -> None:
        """Verify Swiss date parser handles valid and invalid date strings."""
        assert parse_date_swiss("24.08.2026") == datetime(2026, 8, 24)
        assert parse_date_swiss("01.01.2025") == datetime(2025, 1, 1)
        assert parse_date_swiss("invalid-date") is None
        assert parse_date_swiss("") is None

    @pytest.mark.live
    def test_live_promotions_and_brochures(self) -> None:
        """Live Integration: Query live Transgourmet promotions and brochures endpoints."""
        extractor = PromotionExtractor()
        promos = extractor.scrape_active_promotions(max_pages=1)
        brochures = extractor.scrape_brochures()

        assert len(promos) > 0
        assert len(brochures) > 0
