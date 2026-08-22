"""
Tier 3 Integration Tests: On-Demand Search Extractor & Article Lookups.
Tests ingredient keyword searching, exact article number queries, and catering query filtering.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest

from scraper.extractors.search import SearchExtractor
from scraper.client.session import TransgourmetClient, TransgourmetSession


@pytest.mark.integration
class TestSearchExtractorIntegration:
    """Integration test suite for SearchExtractor."""

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_search_by_ingredient_keyword(self, mock_sanitize: MagicMock, mock_transgourmet_client: MagicMock) -> None:
        """Verify on-demand keyword search for staple ingredients (e.g. 'milch')."""
        searcher = SearchExtractor(client=mock_transgourmet_client)
        results = searcher.search_articles(query="milch", limit=50)
        assert len(results) > 0
        valid_results = [r for r in results if r is not None]
        assert len(valid_results) > 0
        assert any("milch" in r.title.lower() for r in valid_results)

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_lookup_by_exact_article_number(self, mock_sanitize: MagicMock, mock_transgourmet_client: MagicMock) -> None:
        """Verify exact 6-digit Swiss article identifier query returns matching record."""
        searcher = SearchExtractor(client=mock_transgourmet_client)
        article = searcher.lookup_article(article_number="817441")
        assert article is not None
        assert article.article_number == "817441"
        assert "Ariel" in article.title
        assert article.price_chf == 28.99

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_search_query_with_umlauts(self, mock_sanitize: MagicMock, mock_transgourmet_client: MagicMock) -> None:
        """Verify queries containing German umlauts (ä, ö, ü, é) execute cleanly."""
        searcher = SearchExtractor(client=mock_transgourmet_client)
        results = searcher.search_articles(query="Käse Gruyère", limit=10)
        assert isinstance(results, list)

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_search_with_category_filter(self, mock_sanitize: MagicMock, mock_transgourmet_client: MagicMock) -> None:
        """Verify search query scoped to a specific category (HWG 6: Molkerei)."""
        searcher = SearchExtractor(client=mock_transgourmet_client)
        results = searcher.search_articles(query="butter", hwg_id=6, limit=10)
        assert isinstance(results, list)

    @patch("scraper.extractors.search.sanitize_search_query", side_effect=lambda q, *args, **kwargs: str(q).strip())
    def test_search_with_action_promotions_only(self, mock_sanitize: MagicMock, mock_transgourmet_client: MagicMock) -> None:
        """Verify searching exclusively for active discounted items."""
        searcher = SearchExtractor(client=mock_transgourmet_client)
        results = searcher.search_articles(query="milch", is_action=True, limit=10)
        assert isinstance(results, list)

    @pytest.mark.live
    def test_live_ingredient_search(self) -> None:
        """Live Integration: Query live Transgourmet search for 'butter' and 'fleisch'."""
        client = TransgourmetClient()
        searcher = SearchExtractor(client=client)
        results = searcher.search_articles(query="butter", limit=10)
        assert len(results) > 0
        assert all(r.price_chf > 0 for r in results)
