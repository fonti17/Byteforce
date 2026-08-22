"""
Client-specific exception re-exports.
"""

from scraper.exceptions import (
    TransgourmetScraperError,
    NetworkError,
    HttpError,
    RequestTimeoutError,
    RateLimitExceededError,
    RateLimitError,
    ConnectionFailedError,
    MaxRetriesExceededError,
    SecurityValidationError,
    PathTraversalError,
    ParsingError,
    MalformedHtmlError,
    MalformedJsonStreamError,
)

__all__ = [
    "TransgourmetScraperError",
    "NetworkError",
    "HttpError",
    "RequestTimeoutError",
    "RateLimitExceededError",
    "RateLimitError",
    "ConnectionFailedError",
    "MaxRetriesExceededError",
    "SecurityValidationError",
    "PathTraversalError",
    "ParsingError",
    "MalformedHtmlError",
    "MalformedJsonStreamError",
]
