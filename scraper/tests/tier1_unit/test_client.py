"""
Tier 1 Unit Tests: HTTP Client, Session & Network Layer.
Tests TransgourmetSession / TransgourmetClient request headers, URL building, and timeout controls.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest
import requests

from scraper.client.session import (
    TransgourmetSession,
    TransgourmetClient,
    MAX_RESPONSE_SIZE_BYTES,
)

try:
    from scraper.client.session import USER_AGENTS
except ImportError:
    from scraper.client.session import USER_AGENT_POOL as USER_AGENTS  # type: ignore

from scraper.exceptions import (
    TransgourmetScraperError,
    NetworkError,
    RequestTimeoutError,
    ConnectionFailedError,
    RateLimitExceededError,
)


@pytest.mark.unit
class TestTransgourmetClientUnit:
    """Test suite for Transgourmet HTTP Client."""

    def test_client_initialization_defaults(self) -> None:
        """Verify client initializes with default timeout and base URLs."""
        client = TransgourmetClient(timeout=10.0)
        assert client.base_url == "https://web.transgourmet.ch"
        assert client.corporate_base_url == "https://www.transgourmet.ch"

    def test_browser_headers_configuration(self) -> None:
        """Verify standard browser headers are present in session."""
        session = TransgourmetSession()
        headers = session.session.headers
        
        ua = headers.get("User-Agent", "")
        assert "Mozilla" in ua or "Chrome" in ua or "Firefox" in ua or "Safari" in ua
        
        accept_lang = headers.get("Accept-Language", "")
        assert "de" in accept_lang

    def test_user_agents_pool_non_empty(self) -> None:
        """Verify user agents pool contains valid modern browser identifiers."""
        assert len(USER_AGENTS) >= 4
        for ua in USER_AGENTS:
            assert ua.startswith("Mozilla/")

    def test_max_response_size_constant(self) -> None:
        """Verify safety ceiling for responses is 25 MB."""
        assert MAX_RESPONSE_SIZE_BYTES == 25 * 1024 * 1024

    @patch("requests.Session.request")
    def test_catalog_query_param_construction(self, mock_request: MagicMock, sample_actions_html: str) -> None:
        """Verify query parameters are correctly formed for catalog queries."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = sample_actions_html
        mock_resp.headers = {}
        mock_request.return_value = mock_resp

        client = TransgourmetClient()
        client.get_catalog_html(search_term="milch", page=1, page_size=100, hwg_id=6, is_action=True)

        assert mock_request.called
        call_kwargs = mock_request.call_args[1]
        params = call_kwargs.get("params", {})
        
        assert params.get("searchTerm") == "milch"
        assert params.get("page") == 1
        assert params.get("cHwgId") == 6
        assert params.get("a") == "true"

    @patch("requests.Session.request")
    def test_timeout_exception_wrapping(self, mock_request: MagicMock) -> None:
        """Verify requests.Timeout is converted to structured RequestTimeoutError / NetworkError."""
        mock_request.side_effect = requests.exceptions.Timeout("Connection timed out")

        session = TransgourmetSession(max_retries=1, rate_limiter_enabled=False)
        
        with pytest.raises((RequestTimeoutError, NetworkError, TransgourmetScraperError)):
            session.request("GET", "https://web.transgourmet.ch/test")

    @patch("requests.Session.request")
    def test_brochures_html_fetch(self, mock_request: MagicMock, sample_brochures_html: str) -> None:
        """Verify client fetches promotional brochures HTML from corporate CMS domain."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = sample_brochures_html
        mock_resp.headers = {}
        mock_request.return_value = mock_resp

        client = TransgourmetClient()
        html = client.get_brochures_html()
        
        assert "tg-promotion-teaser" in html
        called_url = mock_request.call_args[1].get("url") or mock_request.call_args[0][1]
        assert "aktionen-broschueren" in called_url
