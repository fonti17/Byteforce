"""
Exponential backoff calculations and Retry-After HTTP header parser.
"""

from __future__ import annotations

import email.utils
import random
import time
from datetime import datetime, timezone
from typing import Optional


class ExponentialBackoff:
    """
    Exponential backoff manager with jitter, Retry-After header parsing, and retry conditions.
    """

    def __init__(
        self,
        base_factor: float = 1.5,
        factor: float = 2.0,
        max_backoff: float = 60.0,
        max_retries: int = 4,
        max_retry_after: float = 120.0,
    ) -> None:
        self.base_factor = float(base_factor)
        self.factor = float(factor)
        self.max_backoff = float(max_backoff)
        self.max_retries = int(max_retries)
        self.max_retry_after = float(max_retry_after)

    def compute_delay(self, attempt: int = 0, retry_after: Optional[float] = None) -> float:
        """
        Calculate wait time for a given retry attempt index.
        """
        if retry_after is not None and retry_after > 0:
            return float(min(self.max_retry_after, retry_after))

        attempt = max(0, attempt)
        jitter = random.uniform(0.1, 0.5)
        computed = self.base_factor * (self.factor ** attempt) + jitter
        return float(min(self.max_backoff, computed))

    def should_retry(self, status_code: Optional[int] = None, attempt: int = 0) -> bool:
        """
        Determine if request with given status_code should be retried.
        """
        if attempt >= self.max_retries:
            return False
        if status_code is None:
            return True
        if status_code in (429, 500, 502, 503, 504):
            return True
        return False

    @staticmethod
    def parse_retry_after(header_value: Optional[str]) -> Optional[float]:
        """
        Parse HTTP Retry-After header value into delay in seconds.
        Supports integer seconds ('12') and RFC 1123 HTTP-date ('Wed, 21 Oct 2030 07:28:00 GMT').
        Returns None if header is missing or unparseable.
        """
        if not header_value or not isinstance(header_value, str):
            return None

        cleaned = header_value.strip()
        if not cleaned:
            return None

        # Integer / Float seconds
        try:
            val = float(cleaned)
            return max(0.0, val)
        except ValueError:
            pass

        # RFC 1123 / RFC 850 HTTP date
        try:
            parsed_tuple = email.utils.parsedate_to_datetime(cleaned)
            if parsed_tuple:
                now = datetime.now(timezone.utc)
                if parsed_tuple.tzinfo is None:
                    parsed_tuple = parsed_tuple.replace(tzinfo=timezone.utc)
                diff = (parsed_tuple - now).total_seconds()
                return max(0.0, float(diff))
        except Exception:
            pass

        return None


def calculate_backoff(
    attempt: int,
    base: float = 1.5,
    factor: float = 2.0,
    max_backoff: float = 60.0,
    max_retry_after: float = 120.0,
) -> float:
    """Helper function for standalone backoff calculations."""
    b = ExponentialBackoff(base_factor=base, factor=factor, max_backoff=max_backoff, max_retry_after=max_retry_after)
    return b.compute_delay(attempt)


parse_retry_after = ExponentialBackoff.parse_retry_after

__all__ = ["ExponentialBackoff", "calculate_backoff", "parse_retry_after"]
