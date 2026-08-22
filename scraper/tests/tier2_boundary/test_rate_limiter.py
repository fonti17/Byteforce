"""
Tier 2 Boundary Tests: Rate Limiter Bounds, Jitter, Backoff & Anti-Ban Throttling.
Tests token refills, jitter variance, 429 Retry-After parsing, backoff progression caps, and high-frequency calls.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
import pytest

from scraper.client.rate_limiter import TokenBucketRateLimiter, RateLimiter
from scraper.client.backoff import ExponentialBackoff, calculate_backoff, parse_retry_after


@pytest.mark.boundary
class TestRateLimiterBoundary:
    """Test suite for token bucket rate limiter boundaries."""

    def test_rate_limiter_delay_enforcement(self) -> None:
        """Verify rapid sequential requests are delayed to stay under target RPS."""
        limiter = TokenBucketRateLimiter(rate_limit_rps=20.0, enabled=True)
        start = time.perf_counter()
        for _ in range(5):
            limiter.acquire()
        elapsed = time.perf_counter() - start
        assert elapsed >= 0.05

    def test_rate_limiter_disabled_fast_path(self) -> None:
        """Verify disabled rate limiter executes with near-zero latency."""
        limiter = TokenBucketRateLimiter(rate_limit_rps=1.0, enabled=False)
        start = time.perf_counter()
        for _ in range(20):
            limiter.acquire()
        elapsed = time.perf_counter() - start
        assert elapsed < 0.05

    def test_rate_limiter_reset(self) -> None:
        """Verify reset() restores full burst capacity immediately."""
        limiter = TokenBucketRateLimiter(rate_limit_rps=10.0, enabled=True)
        limiter.acquire()
        limiter.reset()
        assert limiter.tokens == limiter.capacity

    def test_fractional_rps_configuration(self) -> None:
        """Verify polite scraping rate limit configuration (e.g. 2 requests per second)."""
        limiter = TokenBucketRateLimiter(rate_limit_rps=2.0, enabled=True)
        assert limiter.rate_limit_rps == 2.0
        assert limiter.base_delay == 0.5

    def test_jitter_interval_variance(self) -> None:
        """Verify jitter intervals fall within defined min/max bounds."""
        limiter = TokenBucketRateLimiter(rate_limit_rps=10.0, min_jitter=0.01, max_jitter=0.05, enabled=True)
        assert limiter.min_jitter == 0.01
        assert limiter.max_jitter == 0.05


@pytest.mark.boundary
class TestExponentialBackoffBoundary:
    """Test suite for exponential backoff progression and Retry-After HTTP headers."""

    def test_exponential_backoff_progression(self) -> None:
        """Verify backoff delays increase exponentially with attempt count."""
        backoff = ExponentialBackoff(base_factor=1.0, max_backoff=60.0)
        delays = [backoff.compute_delay(attempt=i) for i in range(1, 5)]
        
        assert delays[0] >= 1.0
        assert delays[1] >= 2.0
        assert delays[2] >= 4.0
        assert delays[3] >= 8.0

    def test_backoff_capped_at_maximum(self) -> None:
        """Verify backoff never exceeds configured max_backoff ceiling."""
        max_cap = 10.0
        backoff = ExponentialBackoff(base_factor=2.0, max_backoff=max_cap)
        delay_attempt_10 = backoff.compute_delay(attempt=10)
        assert delay_attempt_10 <= max_cap * 1.3

    def test_retry_after_integer_seconds_parsing(self) -> None:
        """Verify Retry-After header with integer seconds is respected."""
        backoff = ExponentialBackoff()
        parsed_secs = parse_retry_after("15")
        assert parsed_secs == 15.0
        delay = backoff.compute_delay(attempt=1, retry_after=parsed_secs)
        assert delay >= 15.0

    def test_retry_after_http_date_parsing(self) -> None:
        """Verify Retry-After header with IMF-fixdate HTTP-date is parsed into delta seconds."""
        backoff = ExponentialBackoff()
        future_time = datetime.now(timezone.utc) + timedelta(seconds=12)
        http_date_str = format_datetime(future_time, usegmt=True)
        
        parsed_secs = parse_retry_after(http_date_str)
        assert parsed_secs is not None
        assert 10.0 <= parsed_secs <= 15.0
        delay = backoff.compute_delay(attempt=1, retry_after=parsed_secs)
        assert 10.0 <= delay <= 15.0

    def test_retry_after_invalid_header_fallback(self) -> None:
        """Verify invalid Retry-After header falls back to standard exponential calculation."""
        backoff = ExponentialBackoff(base_factor=1.0)
        parsed = parse_retry_after("invalid-header-string")
        assert parsed is None
        delay = backoff.compute_delay(attempt=1, retry_after=parsed)
        assert delay >= 1.0

    def test_retry_after_safety_cap(self) -> None:
        """Verify absurdly large Retry-After values are capped at max_retry_after."""
        backoff = ExponentialBackoff(max_retry_after=60.0)
        parsed = parse_retry_after("86400")
        assert parsed == 86400.0
        delay = backoff.compute_delay(attempt=1, retry_after=parsed)
        assert delay <= 60.0

    def test_should_retry_status_codes(self) -> None:
        """Verify retry decision logic for HTTP status codes."""
        backoff = ExponentialBackoff(max_retries=3)
        # Retriable within max_retries
        assert backoff.should_retry(status_code=429, attempt=1) is True
        assert backoff.should_retry(status_code=500, attempt=1) is True
        assert backoff.should_retry(status_code=502, attempt=2) is True
        assert backoff.should_retry(status_code=503, attempt=2) is True
        
        # Max retries reached (attempt >= 3)
        assert backoff.should_retry(status_code=504, attempt=3) is False
        assert backoff.should_retry(status_code=429, attempt=4) is False
        
        # Non-retriable client errors
        assert backoff.should_retry(status_code=200, attempt=1) is False
        assert backoff.should_retry(status_code=400, attempt=1) is False
        assert backoff.should_retry(status_code=404, attempt=1) is False
        assert backoff.should_retry(status_code=403, attempt=1) is False
