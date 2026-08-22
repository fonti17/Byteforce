"""
Token-bucket rate limiter with randomized jitter for ethical crawling and anti-ban protection.
"""

from __future__ import annotations

import random
import threading
import time
from typing import Optional


class TokenBucketRateLimiter:
    """
    Thread-safe polite token-bucket rate limiter enforcing minimum delays with uniform random jitter.
    """

    def __init__(
        self,
        rate_limit_rps: float = 2.0,
        base_delay: float = 0.5,
        min_jitter: float = 0.2,
        max_jitter: float = 0.8,
        jitter_min: Optional[float] = None,
        jitter_max: Optional[float] = None,
        enabled: bool = True,
    ) -> None:
        # Clamp parameters to valid non-negative ranges
        rps = max(0.1, float(rate_limit_rps))
        b_del = max(0.0, float(base_delay))
        
        j_min = float(jitter_min if jitter_min is not None else min_jitter)
        j_max = float(jitter_max if jitter_max is not None else max_jitter)
        j_min = max(0.0, j_min)
        j_max = max(j_min, j_max)

        self.rate_limit_rps = rps
        self.capacity = rps
        self.tokens = self.capacity
        self.base_delay = b_del
        self.min_jitter = j_min
        self.max_jitter = j_max
        self.jitter_min = self.min_jitter
        self.jitter_max = self.max_jitter
        self.enabled = bool(enabled)
        
        self._last_request_time: float = 0.0
        self._lock = threading.Lock()

    @property
    def last_request_time(self) -> float:
        return self._last_request_time

    @last_request_time.setter
    def last_request_time(self, val: float) -> None:
        self._last_request_time = float(val)

    def _compute_jitter(self) -> float:
        """Calculate uniform random jitter interval."""
        return random.uniform(self.min_jitter, self.max_jitter)

    def get_delay(self) -> float:
        """Calculate total polite delay (base delay + jitter)."""
        return self.base_delay + self._compute_jitter()

    def reset(self) -> None:
        """Reset token bucket capacity and timestamps."""
        with self._lock:
            self.tokens = self.capacity
            self._last_request_time = 0.0

    def acquire(self) -> float:
        """
        Block until polite delay has elapsed since prior request.
        Returns the duration waited in seconds (or 0.0 if disabled).
        """
        if not self.enabled:
            return 0.0

        with self._lock:
            now = time.perf_counter()
            target_delay = self.get_delay()
            elapsed = now - self._last_request_time

            wait_time = 0.0
            if self._last_request_time > 0 and elapsed < target_delay:
                wait_time = target_delay - elapsed
                time.sleep(wait_time)
            elif self._last_request_time == 0:
                wait_time = self._compute_jitter()
                time.sleep(wait_time)

            self._last_request_time = time.perf_counter()
            return wait_time

    def wait(self) -> float:
        """Alias for acquire."""
        return self.acquire()


RateLimiter = TokenBucketRateLimiter
TokenBucket = TokenBucketRateLimiter

__all__ = ["TokenBucketRateLimiter", "RateLimiter", "TokenBucket"]
