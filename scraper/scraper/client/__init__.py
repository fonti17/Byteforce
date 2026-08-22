"""
Client package exports.
"""

from scraper.client.session import (
    TransgourmetSession,
    TransgourmetClient,
    USER_AGENTS,
    DEFAULT_HEADERS,
    MAX_RESPONSE_SIZE_BYTES,
)
from scraper.client.rate_limiter import TokenBucketRateLimiter, RateLimiter, TokenBucket
from scraper.client.backoff import ExponentialBackoff, calculate_backoff, parse_retry_after
from scraper.client.exceptions import (
    TransgourmetScraperError,
    NetworkError,
    RequestTimeoutError,
    RateLimitExceededError,
    RateLimitError,
    ConnectionFailedError,
    MaxRetriesExceededError,
)

__all__ = [
    "TransgourmetSession",
    "TransgourmetClient",
    "USER_AGENTS",
    "DEFAULT_HEADERS",
    "MAX_RESPONSE_SIZE_BYTES",
    "TokenBucketRateLimiter",
    "RateLimiter",
    "TokenBucket",
    "ExponentialBackoff",
    "calculate_backoff",
    "parse_retry_after",
    "TransgourmetScraperError",
    "NetworkError",
    "RequestTimeoutError",
    "RateLimitExceededError",
    "RateLimitError",
    "ConnectionFailedError",
    "MaxRetriesExceededError",
]
