"""
Hierarchical typed exceptions for Transgourmet Switzerland Web Scraper.
Provides robust fault isolation, security error signaling, and network failure classification.
"""

from __future__ import annotations
from typing import Any, Optional


class TransgourmetScraperError(Exception):
    """Base exception for all Transgourmet scraper errors."""
    pass


# --- Network & Client Exceptions ---

class NetworkError(TransgourmetScraperError):
    """Base exception for network communication errors."""
    pass


class HttpError(NetworkError):
    """Raised on non-200 HTTP response codes."""
    def __init__(self, message: str = "", status_code: Optional[int] = None, *args: Any) -> None:
        super().__init__(message, *args)
        self.status_code = status_code


class RequestTimeoutError(NetworkError):
    """Raised when an outbound HTTP request exceeds configured timeout budget."""
    pass


class RateLimitExceededError(NetworkError):
    """Raised when server returns HTTP 429 Too Many Requests."""
    pass


RateLimitError = RateLimitExceededError


class ConnectionFailedError(NetworkError):
    """Raised when connection to server cannot be established or is prematurely dropped."""
    pass


class MaxRetriesExceededError(NetworkError):
    """Raised when request retries are exhausted without a successful response."""
    pass


# --- Parsing & Extraction Exceptions ---

class ParsingError(TransgourmetScraperError):
    """Base exception for HTML/JSON/Stream parsing errors."""
    pass


ParserError = ParsingError


class MalformedHtmlError(ParsingError):
    """Raised when expected DOM structures are missing or malformed."""
    pass


class MalformedJsonStreamError(ParsingError):
    """Raised when embedded SSR JSON streams or React Router payloads are corrupt."""
    pass


class SchemaValidationError(ParsingError):
    """Raised when parsed data fails model validation contracts."""
    pass


# --- Security & Validation Exceptions ---

class SecurityValidationError(TransgourmetScraperError):
    """Base exception for security checks and adversarial input defenses."""
    pass


class PathTraversalError(SecurityValidationError):
    """Raised when a file export path attempts directory jailbreak (e.g. ../..)."""
    pass


class InputInjectionError(SecurityValidationError):
    """Raised when user-supplied input contains forbidden injection patterns."""
    pass


class InvalidParameterError(SecurityValidationError):
    """Raised when CLI or programmatic parameters fall outside permissible boundaries."""
    pass


__all__ = [
    "TransgourmetScraperError",
    "NetworkError",
    "HttpError",
    "RequestTimeoutError",
    "RateLimitExceededError",
    "RateLimitError",
    "ConnectionFailedError",
    "MaxRetriesExceededError",
    "ParsingError",
    "ParserError",
    "MalformedHtmlError",
    "MalformedJsonStreamError",
    "SchemaValidationError",
    "SecurityValidationError",
    "PathTraversalError",
    "InputInjectionError",
    "InvalidParameterError",
]
