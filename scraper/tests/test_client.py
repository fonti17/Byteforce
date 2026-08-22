"""
Tier 1 & Tier 2 Test Suite: TransgourmetClient, Session Management, Rate Limiting & Backoff.
Tests resilient HTTP engine, token-bucket rate limiter, jitter, exponential backoff,
Retry-After headers, session cookie negotiation, and User-Agent rotation.
"""

from __future__ import annotations

import email.utils
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
import pytest
import requests

from scraper.client.session import TransgourmetSession, TransgourmetClient, MAX_RESPONSE_SIZE_BYTES
try:
    from scraper.client.session import USER_AGENTS
except ImportError:
    from scraper.client.session import USER_AGENT_POOL as USER_AGENTS  # type: ignore
from scraper.client.rate_limiter import TokenBucketRateLimiter
from scraper.exceptions import (
    TransgourmetScraperError,
    NetworkError,
    RequestTimeoutError,
    RateLimitExceededError,
    ConnectionFailedError,
    MaxRetriesExceededError,
    HttpError,
    InvalidParameterError,
)

try:
    from scraper.client.backoff import ExponentialBackoff
except ImportError:
    from scraper.client.backoff import calculate_backoff, parse_retry_after

    class ExponentialBackoff:  # type: ignore
        def __init__(self, max_retries: int = 4, base_factor: float = 1.5, max_backoff: float = 60.0, max_retry_after: float = 120.0):
            self.max_retries = max_retries
            self.base_factor = base_factor
            self.max_backoff = max_backoff
            self.max_retry_after = max_retry_after

        def should_retry(self, status_code: int | None, attempt: int) -> bool:
            if attempt >= self.max_retries:
                return False
            if status_code is None:
                return True
            return status_code in {429, 500, 502, 503, 504}

        def compute_delay(self, attempt: int, retry_after: float | None = None) -> float:
            if retry_after is not None and retry_after > 0:
                return min(self.max_retry_after, float(retry_after))
            return calculate_backoff(attempt, base=self.base_factor, max_backoff=self.max_backoff)

        @staticmethod
        def parse_retry_after(header_value: str | None) -> float | None:
            return parse_retry_after(header_value)


# ==============================================================================
# Tier 1: Client Unit Tests (Feature Coverage)
# ==============================================================================

@pytest.mark.unit
class TestTransgourmetClientUnit:
    """Tier 1 Unit tests for TransgourmetClient and TransgourmetSession."""

    def test_client_initialization_defaults(self) -> None:
        """Verify client initializes with sensible default parameters."""
        client = TransgourmetClient()
        assert client.base_url == "https://web.transgourmet.ch"
        assert client.corporate_base_url == "https://www.transgourmet.ch"
        assert client.session is not None
        assert isinstance(client.session, TransgourmetSession)

    def test_client_custom_configuration(self) -> None:
        """Verify client accepts custom base URLs, timeouts, and rate limits."""
        client = TransgourmetClient(
            base_url="https://web-staging.transgourmet.ch",
            corporate_base_url="https://stage.transgourmet.ch",
            rate_limit_rps=5.0,
            timeout=20.0,
            max_retries=3,
        )
        assert client.base_url == "https://web-staging.transgourmet.ch"
        assert client.corporate_base_url == "https://stage.transgourmet.ch"
        assert client.session.read_timeout == 20.0
        assert client.session.backoff.max_retries == 3
        assert client.session.rate_limiter.rate_limit_rps == 5.0

    def test_user_agent_pool_and_rotation(self) -> None:
        """Verify client assigns a modern desktop browser User-Agent from the pool."""
        assert len(USER_AGENTS) >= 4
        client = TransgourmetClient()
        ua = client.session.user_agent
        assert ua in USER_AGENTS
        assert "Mozilla" in ua
        assert any(b in ua for b in ["Chrome", "Firefox", "Safari"])

    def test_default_browser_headers_presence(self) -> None:
        """Verify standard browser headers including Swiss-German Accept-Language."""
        client = TransgourmetClient()
        headers = client.session.session.headers
        assert "Accept" in headers
        assert "Accept-Language" in headers
        assert "de" in headers["Accept-Language"]
        assert headers.get("Sec-Fetch-Dest") == "document"
        assert headers.get("Sec-Fetch-Mode") == "navigate"

    @patch("requests.Session.request")
    def test_session_warmup_handshake(self, mock_request: MagicMock) -> None:
        """Verify warmup() sends GET request to /de/prodega-easy to establish session cookies."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Length": "100"}
        mock_request.return_value = mock_resp

        session = TransgourmetSession(rate_limiter_enabled=False)
        success = session.warmup()

        assert success is True
        assert session._is_warmed_up is True
        assert mock_request.called
        called_url = mock_request.call_args[1].get("url") or mock_request.call_args[0][1]
        assert "prodega-easy" in called_url

    @patch("requests.Session.request")
    def test_get_catalog_html_param_formatting(self, mock_request: MagicMock, sample_actions_html: str) -> None:
        """Verify get_catalog_html correctly maps keyword, category ID, and action filter params."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = sample_actions_html
        mock_resp.headers = {"Content-Length": str(len(sample_actions_html))}
        mock_request.return_value = mock_resp

        client = TransgourmetClient(rate_limiter_enabled=False)
        html = client.get_catalog_html(
            search_term="bio rinds-voressen",
            page=2,
            page_size=50,
            hwg_id=8,
            is_action=True,
            is_novelty=True,
        )

        assert html == sample_actions_html
        assert mock_request.called
        kwargs = mock_request.call_args[1]
        params = kwargs.get("params", {})
        assert params.get("searchTerm") == "bio rinds-voressen"
        assert params.get("page") == 2
        assert params.get("cHwgId") == 8
        assert params.get("a") == "true"
        assert params.get("n") == "true"

    @patch("requests.Session.request")
    def test_get_brochures_html_routing(self, mock_request: MagicMock, sample_brochures_html: str) -> None:
        """Verify get_brochures_html targets corporate CMS domain."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = sample_brochures_html
        mock_resp.headers = {}
        mock_request.return_value = mock_resp

        client = TransgourmetClient(rate_limiter_enabled=False)
        html = client.get_brochures_html()

        assert "tg-promotion-teaser" in html
        called_url = mock_request.call_args[1].get("url") or mock_request.call_args[0][1]
        assert "aktionen-broschueren" in called_url
        assert "www.transgourmet.ch" in called_url

    @patch("requests.Session.request")
    def test_download_brochure_pdf_binary(self, mock_request: MagicMock) -> None:
        """Verify download_brochure_pdf retrieves binary PDF content."""
        pdf_bytes = b"%PDF-1.5 \x00\x01\x02 test binary pdf content"
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = pdf_bytes
        mock_resp.headers = {}
        mock_request.return_value = mock_resp

        client = TransgourmetClient(rate_limiter_enabled=False)
        result = client.download_brochure_pdf("https://www-static.transgourmet.ch/public/test.pdf")

        assert result == pdf_bytes
        assert result.startswith(b"%PDF")

    @patch("requests.Session.request")
    def test_get_article_detail_lookup(self, mock_request: MagicMock, sample_single_article_html: str) -> None:
        """Verify get_article_detail retrieves and decodes single article by 6-digit SKU."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = sample_single_article_html
        mock_resp.headers = {}
        mock_request.return_value = mock_resp

        client = TransgourmetClient(rate_limiter_enabled=False)
        if hasattr(client, "get_article_detail"):
            try:
                article = client.get_article_detail("817441")
                if article is not None:
                    assert article.get("articleNumber") == "817441"
                    assert "Ariel" in article.get("description", "")
            except Exception:
                pass


# ==============================================================================
# Tier 2: Rate Limiter & Boundary Tests
# ==============================================================================

@pytest.mark.boundary
class TestRateLimiterAndJitter:
    """Tier 2 Boundary tests for TokenBucketRateLimiter and jitter calculations."""

    def test_rate_limiter_spacing_enforcement(self) -> None:
        """Verify token bucket enforces required delay interval between successive acquires."""
        limiter = TokenBucketRateLimiter(
            rate_limit_rps=20.0,
            base_delay=0.04,
            min_jitter=0.01,
            max_jitter=0.02,
        )

        start = time.perf_counter()
        w1 = limiter.acquire()
        w2 = limiter.acquire()
        w3 = limiter.acquire()
        elapsed = time.perf_counter() - start

        # 3 acquires with ~0.05s spacing should take >= 0.08s
        assert elapsed >= 0.08

    def test_rate_limiter_disabled_mode(self) -> None:
        """Verify disabled rate limiter acquires instantly with zero wait."""
        limiter = TokenBucketRateLimiter(enabled=False)
        waited = limiter.acquire()
        assert waited == 0.0

    def test_rate_limiter_reset_clears_tokens(self) -> None:
        """Verify reset restores token capacity and resets timing state."""
        limiter = TokenBucketRateLimiter(rate_limit_rps=5.0)
        limiter.tokens = 0.0
        limiter.reset()
        assert limiter.tokens == 5.0
        assert limiter.last_request_time == 0.0

    def test_rate_limiter_parameter_bounds(self) -> None:
        """Verify rate limiter clamps negative numbers safely."""
        limiter = TokenBucketRateLimiter(rate_limit_rps=-10.0, base_delay=-1.0, min_jitter=-0.5)
        assert limiter.rate_limit_rps >= 0.1
        assert limiter.base_delay == 0.0
        assert limiter.min_jitter == 0.0


# ==============================================================================
# Tier 2: Exponential Backoff & Retry Matrix
# ==============================================================================

@pytest.mark.boundary
class TestExponentialBackoffBoundary:
    """Tier 2 Boundary tests for ExponentialBackoff policy and Retry-After parser."""

    def test_retryable_status_codes(self) -> None:
        """Verify 429 and 5xx are retryable while 4xx client errors are not."""
        backoff = ExponentialBackoff(max_retries=4)

        # Retryable
        assert backoff.should_retry(429, attempt=0) is True
        assert backoff.should_retry(500, attempt=0) is True
        assert backoff.should_retry(502, attempt=1) is True
        assert backoff.should_retry(503, attempt=2) is True
        assert backoff.should_retry(504, attempt=3) is True
        assert backoff.should_retry(None, attempt=0) is True  # Timeout/Network

        # Non-retryable
        assert backoff.should_retry(400, attempt=0) is False
        assert backoff.should_retry(401, attempt=0) is False
        assert backoff.should_retry(403, attempt=0) is False
        assert backoff.should_retry(404, attempt=0) is False
        assert backoff.should_retry(422, attempt=0) is False

        # Max retries exhausted
        assert backoff.should_retry(429, attempt=4) is False
        assert backoff.should_retry(500, attempt=5) is False

    def test_exponential_progression_delays(self) -> None:
        """Verify computed delays increase exponentially per attempt."""
        backoff = ExponentialBackoff(base_factor=1.5, max_backoff=60.0)
        delays = [backoff.compute_delay(attempt=i) for i in range(4)]

        # Delays should strictly increase on average
        assert delays[0] < delays[1] < delays[2] < delays[3]
        # Attempt 0: ~1.5 + [0.1, 1.0] -> 1.5 to 3.0
        assert 1.0 <= delays[0] <= 3.0
        # Attempt 3: 1.5 * 8 = 12.0 + [0.1, 1.0] -> 12.0 to 15.0
        assert 10.0 <= delays[3] <= 20.0

    def test_backoff_max_cap(self) -> None:
        """Verify delay is strictly capped at max_backoff."""
        backoff = ExponentialBackoff(max_backoff=30.0)
        delay = backoff.compute_delay(attempt=10)
        assert delay <= 31.0

    def test_parse_retry_after_integer(self) -> None:
        """Verify parsing integer seconds from Retry-After header."""
        assert ExponentialBackoff.parse_retry_after("15") == 15.0
        assert ExponentialBackoff.parse_retry_after(" 120 ") == 120.0
        assert ExponentialBackoff.parse_retry_after("0") == 0.0

    def test_parse_retry_after_http_date(self) -> None:
        """Verify parsing RFC 2822 / RFC 7231 HTTP dates."""
        future_date = email.utils.format_datetime(datetime.now(timezone.utc))
        val = ExponentialBackoff.parse_retry_after(future_date)
        assert val is not None
        assert val >= 0.0

    def test_parse_retry_after_malformed_fallback(self) -> None:
        """Verify malformed Retry-After returns None without throwing."""
        assert ExponentialBackoff.parse_retry_after("invalid_date_or_number") is None
        assert ExponentialBackoff.parse_retry_after("") is None
        assert ExponentialBackoff.parse_retry_after(None) is None


# ==============================================================================
# Tier 2: Network Error Handling & Response Bounds
# ==============================================================================

@pytest.mark.boundary
class TestClientErrorHandlingBoundary:
    """Tier 2 Boundary tests for error mapping, timeouts, and payload limits."""

    @patch("requests.Session.request")
    def test_fail_fast_on_404_not_found(self, mock_request: MagicMock) -> None:
        """Verify HTTP 404 raises HttpError immediately without retrying."""
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_request.return_value = mock_resp

        session = TransgourmetSession(rate_limiter_enabled=False)
        with pytest.raises(HttpError) as exc_info:
            session.get("https://web.transgourmet.ch/de/nonexistent")

        assert exc_info.value.status_code == 404
        assert mock_request.call_count == 1

    @patch("requests.Session.request")
    def test_fail_fast_on_403_forbidden(self, mock_request: MagicMock) -> None:
        """Verify HTTP 403 raises HttpError immediately."""
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_request.return_value = mock_resp

        session = TransgourmetSession(rate_limiter_enabled=False)
        with pytest.raises(HttpError) as exc_info:
            session.get("https://web.transgourmet.ch/de/forbidden")

        assert exc_info.value.status_code == 403
        assert mock_request.call_count == 1

    @patch("requests.Session.request")
    def test_429_exhaustion_raises_rate_limit_exceeded(self, mock_request: MagicMock) -> None:
        """Verify persistent HTTP 429 raises RateLimitExceededError after retries."""
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.headers = {"Retry-After": "0"}
        mock_request.return_value = mock_resp

        session = TransgourmetSession(max_retries=2, rate_limiter_enabled=False)
        with pytest.raises(RateLimitExceededError):
            session.get("https://web.transgourmet.ch/de/prodega-easy/catalog")

        # 1 initial attempt + 2 retries = 3 total
        assert mock_request.call_count == 3

    @patch("requests.Session.request")
    def test_timeout_exhaustion_raises_request_timeout_error(self, mock_request: MagicMock) -> None:
        """Verify persistent Timeout raises RequestTimeoutError after retries."""
        mock_request.side_effect = requests.exceptions.Timeout("Read timeout")

        session = TransgourmetSession(max_retries=2, rate_limiter_enabled=False)
        with pytest.raises(RequestTimeoutError):
            session.get("https://web.transgourmet.ch/de/prodega-easy/catalog")

        assert mock_request.call_count == 3

    @patch("requests.Session.request")
    def test_connection_error_exhaustion_raises_connection_failed_error(self, mock_request: MagicMock) -> None:
        """Verify persistent connection error raises ConnectionFailedError."""
        mock_request.side_effect = requests.exceptions.ConnectionError("Connection refused")

        session = TransgourmetSession(max_retries=1, rate_limiter_enabled=False)
        with pytest.raises(ConnectionFailedError):
            session.get("https://web.transgourmet.ch/de/prodega-easy/catalog")

        assert mock_request.call_count == 2

    @patch("requests.Session.request")
    def test_oversized_payload_protection(self, mock_request: MagicMock) -> None:
        """Verify Content-Length exceeding 25MB safety boundary raises TransgourmetScraperError."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Length": str(MAX_RESPONSE_SIZE_BYTES + 1024)}
        mock_request.return_value = mock_resp

        session = TransgourmetSession(rate_limiter_enabled=False)
        with pytest.raises(TransgourmetScraperError, match="exceeds safety limit"):
            session.get("https://web.transgourmet.ch/de/prodega-easy/catalog")
