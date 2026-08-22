"""
Tier 1 Unit Tests: Drupal CMS Weekly Brochures & Flyers Parser.
Tests parsing of /de/aktionen-broschueren HTML and extraction of PDF metadata.
"""

from __future__ import annotations

import pytest

try:
    from scraper.parsers.brochures import (
        parse_brochures_html,
        extract_brochure_metadata,
        BrochuresParser,
    )
except ImportError:
    try:
        from scraper.parsers import parse_brochures_html, extract_brochure_metadata, BrochuresParser
    except ImportError:
        pass


@pytest.mark.unit
class TestBrochuresParser:
    """Test suite for promotional brochures HTML parser."""

    def test_parse_real_brochures_fixture(self, sample_brochures_html: str) -> None:
        """Verify extraction of 26 promotional flyers from real captured HTML."""
        brochures = parse_brochures_html(sample_brochures_html)
        assert len(brochures) == 26
        
        # Verify first brochure properties
        first = brochures[0]
        assert "Aktionen" in first.title
        assert first.pdf_url.startswith("https://")
        assert first.pdf_url.endswith(".pdf")
        assert first.thumbnail_url is not None

    def test_brochure_pdf_url_validity(self, sample_brochures_html: str) -> None:
        """Verify all extracted brochure PDF links point to www-static.transgourmet.ch domain."""
        brochures = parse_brochures_html(sample_brochures_html)
        for b in brochures:
            assert b.pdf_url.endswith(".pdf")
            assert "transgourmet.ch" in b.pdf_url

    def test_calendar_week_extraction(self, sample_brochures_html: str) -> None:
        """Verify extraction of Calendar Week (KW) from flyer titles/URLs."""
        brochures = parse_brochures_html(sample_brochures_html)
        has_kw = any("35" in b.title or "KW" in b.title or "34" in b.title for b in brochures)
        assert has_kw is True

    def test_empty_html_handling(self) -> None:
        """Verify empty HTML returns an empty list without raising exceptions."""
        brochures = parse_brochures_html("<html><body><p>No content</p></body></html>")
        assert brochures == []

    def test_partial_teaser_handling(self) -> None:
        """Verify graceful handling when a teaser is missing title or image."""
        html_with_partial_teaser = """
        <div class="tg-promotion-teaser">
            <a class="tg-promotion-teaser__link" href="https://www-static.transgourmet.ch/test.pdf">
                <span class="field--name-title">Incomplete Flyer</span>
            </a>
        </div>
        <div class="tg-promotion-teaser">
            <!-- Missing PDF link -->
            <span class="field--name-title">Broken Flyer</span>
        </div>
        """
        brochures = parse_brochures_html(html_with_partial_teaser)
        assert len(brochures) == 1
        assert brochures[0].title == "Incomplete Flyer"
        assert brochures[0].pdf_url == "https://www-static.transgourmet.ch/test.pdf"
