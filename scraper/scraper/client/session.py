"""
Resilient Transgourmet HTTP Session & Client.
Handles session cookies, browser header rotation, polite rate-limiting, and exponential backoff on 429/5xx.
"""

from __future__ import annotations

import logging
import random
import time
from typing import Any, Dict, List, Optional, Union
import requests

from scraper.client.rate_limiter import TokenBucketRateLimiter
from scraper.client.backoff import ExponentialBackoff, calculate_backoff, parse_retry_after
from scraper.client.exceptions import (
    TransgourmetScraperError,
    NetworkError,
    HttpError,
    RequestTimeoutError,
    RateLimitExceededError,
    ConnectionFailedError,
    MaxRetriesExceededError,
)

logger = logging.getLogger(__name__)

USER_AGENTS: List[str] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
]

USER_AGENT_POOL = USER_AGENTS

DEFAULT_HEADERS: Dict[str, str] = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "de-CH,de;q=0.9,en;q=0.8,fr-CH;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
}

MAX_RESPONSE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB


class TransgourmetSession:
    """
    Resilient HTTP client for Transgourmet Switzerland catalog and promotional services.
    """

    def __init__(
        self,
        base_url: str = "https://web.transgourmet.ch",
        corporate_base_url: str = "https://www.transgourmet.ch",
        base_url_web: Optional[str] = None,
        base_url_corporate: Optional[str] = None,
        cms_url: Optional[str] = None,
        timeout: float = 15.0,
        connect_timeout: Optional[float] = None,
        read_timeout: Optional[float] = None,
        max_retries: int = 4,
        base_delay: float = 0.5,
        rate_limit_rps: float = 2.0,
        rate_limiter_enabled: bool = True,
        user_agent: Optional[str] = None,
        warmup_session: bool = False,
    ) -> None:
        self.base_url = (base_url_web or base_url).rstrip("/")
        self.corporate_base_url = (base_url_corporate or cms_url or corporate_base_url).rstrip("/")
        self.cms_url = self.corporate_base_url
        self.timeout = float(timeout)
        self.read_timeout = float(read_timeout) if read_timeout is not None else self.timeout
        self.connect_timeout = float(connect_timeout) if connect_timeout is not None else min(10.0, self.timeout)
        self.max_retries = int(max_retries)
        self._is_warmed_up = False
        
        self.rate_limiter = TokenBucketRateLimiter(
            rate_limit_rps=rate_limit_rps,
            base_delay=base_delay,
            enabled=rate_limiter_enabled,
        )
        self.backoff = ExponentialBackoff(max_retries=self.max_retries)
        self.session = requests.Session()

        ua = user_agent or random.choice(USER_AGENTS)
        self.user_agent = ua
        self.session.headers.update(DEFAULT_HEADERS)
        self.session.headers["User-Agent"] = ua

        if warmup_session:
            self.warmup()

    def warmup(self) -> bool:
        """Warm up session cookies against web.transgourmet.ch."""
        try:
            url = f"{self.base_url}/de/prodega-easy"
            self.request("GET", url)
            self._is_warmed_up = True
            return True
        except Exception as e:
            logger.warning("Session warmup non-fatal issue: %s", e)
            self._is_warmed_up = True
            return True

    def request(
        self,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs: Any,
    ) -> requests.Response:
        """
        Execute an HTTP request with rate-limiting, error mapping, and exponential retry backoff.
        """
        req_headers = dict(self.session.headers)
        if headers:
            req_headers.update(headers)

        last_exception: Optional[Exception] = None
        total_attempts = self.max_retries + 1

        for attempt in range(total_attempts):
            self.rate_limiter.acquire()

            try:
                clean_params = {k: v for k, v in (params or {}).items() if v is not None}
                t_out = kwargs.pop("timeout", (self.connect_timeout, self.read_timeout))

                resp = self.session.request(
                    method=method,
                    url=url,
                    params=clean_params,
                    headers=req_headers,
                    timeout=t_out,
                    **kwargs,
                )

                content_length = resp.headers.get("Content-Length")
                if content_length and int(content_length) > MAX_RESPONSE_SIZE_BYTES:
                    raise TransgourmetScraperError(
                        f"Response payload exceeds safety limit of {MAX_RESPONSE_SIZE_BYTES} bytes"
                    )

                if resp.status_code == 200:
                    return resp

                if resp.status_code in {400, 401, 403, 404, 422}:
                    raise HttpError(f"HTTP {resp.status_code} on {url}", status_code=resp.status_code)

                if resp.status_code == 429:
                    retry_after = ExponentialBackoff.parse_retry_after(resp.headers.get("Retry-After"))
                    wait_sec = retry_after if retry_after is not None else self.backoff.compute_delay(attempt)
                    logger.warning(f"HTTP 429 received from {url}. Backing off {wait_sec:.2f}s (attempt {attempt + 1}/{total_attempts})")
                    
                    if attempt == total_attempts - 1:
                        raise RateLimitExceededError(f"HTTP 429 Rate Limit Exceeded after {total_attempts} attempts on {url}")
                    
                    time.sleep(wait_sec)
                    continue

                if resp.status_code >= 500:
                    wait_sec = self.backoff.compute_delay(attempt)
                    logger.warning(f"HTTP {resp.status_code} server error from {url}. Retrying in {wait_sec:.2f}s (attempt {attempt + 1}/{total_attempts})")
                    
                    if attempt == total_attempts - 1:
                        return resp
                    
                    time.sleep(wait_sec)
                    continue

                return resp

            except requests.exceptions.Timeout as e:
                last_exception = RequestTimeoutError(f"Request to {url} timed out: {e}")
                if attempt == total_attempts - 1:
                    raise last_exception from e
                time.sleep(self.backoff.compute_delay(attempt))
            except requests.exceptions.ConnectionError as e:
                last_exception = ConnectionFailedError(f"Connection to {url} failed: {e}")
                if attempt == total_attempts - 1:
                    raise last_exception from e
                time.sleep(self.backoff.compute_delay(attempt))
            except (RateLimitExceededError, HttpError, TransgourmetScraperError):
                raise
            except requests.exceptions.RequestException as e:
                last_exception = NetworkError(f"Network error on {url}: {e}")
                if attempt == total_attempts - 1:
                    raise last_exception from e
                time.sleep(self.backoff.compute_delay(attempt))

        if last_exception:
            raise last_exception
        raise MaxRetriesExceededError(f"Failed to fetch {url} after {total_attempts} attempts")

    def get(self, url: str, params: Optional[Dict[str, Any]] = None, **kwargs: Any) -> requests.Response:
        return self.request("GET", url, params=params, **kwargs)

    def get_catalog_html(
        self,
        search_term: str = "",
        page: int = 0,
        page_size: int = 100,
        hwg_id: Optional[int] = None,
        is_action: bool = False,
        is_novelty: bool = False,
    ) -> str:
        """
        Query catalog items and faceted filters from Prodega Easy catalog SSR route.
        """
        url = f"{self.base_url}/de/prodega-easy/catalog"
        params: Dict[str, Any] = {
            "searchTerm": search_term if search_term else None,
            "page": page,
            "pageSize": page_size,
            "cHwgId": hwg_id if hwg_id is not None else None,
            "a": "true" if is_action else None,
            "n": "true" if is_novelty else None,
        }
        resp = self.request("GET", url, params=params)
        return resp.text

    def get_catalog(
        self,
        search_term: str = "",
        page: int = 0,
        page_size: int = 100,
        hwg_id: Optional[int] = None,
        is_action: bool = False,
        is_novelty: bool = False,
    ) -> str:
        """Alias for get_catalog_html."""
        return self.get_catalog_html(
            search_term=search_term,
            page=page,
            page_size=page_size,
            hwg_id=hwg_id,
            is_action=is_action,
            is_novelty=is_novelty,
        )

    def get_articles_search(
        self,
        search_term: str = "",
        page: int = 0,
        page_size: int = 100,
        hwg_id: Optional[int] = None,
        is_action: bool = False,
        is_novelty: bool = False,
    ) -> str:
        """Alias for get_catalog."""
        return self.get_catalog_html(
            search_term=search_term,
            page=page,
            page_size=page_size,
            hwg_id=hwg_id,
            is_action=is_action,
            is_novelty=is_novelty,
        )

    def get_brochures_html(self) -> str:
        """
        Fetch public promotional action brochures and flyers HTML page from corporate CMS.
        """
        url = f"{self.corporate_base_url}/de/aktionen-broschueren"
        resp = self.request("GET", url)
        return resp.text

    def get_home_html(self) -> str:
        """
        Fetch Prodega Easy homepage SSR payload.
        """
        url = f"{self.base_url}/de/prodega-easy"
        resp = self.request("GET", url)
        return resp.text

    def download_brochure_pdf(self, pdf_url: str) -> bytes:
        """
        Download binary content of promotional flyer PDF document.
        """
        resp = self.request("GET", pdf_url)
        return resp.content

    def get_article_detail(self, article_number: str) -> Optional[Dict[str, Any]]:
        """
        Fetch and decode article details for a given SKU.
        """
        html = self.get_catalog_html(search_term=article_number, page_size=1)
        if not html:
            return None
        from scraper.parsers.turbostream import decode_turbostream_html, extract_search_response
        decoded = decode_turbostream_html(html)
        sr = extract_search_response(decoded)
        articles = sr.get("articles", [])
        if articles:
            return articles[0]
        return None


class TransgourmetClient:
    """
    High-level Transgourmet API client wrapping TransgourmetSession.
    """

    def __init__(
        self,
        base_url: str = "https://web.transgourmet.ch",
        corporate_base_url: str = "https://www.transgourmet.ch",
        base_url_web: Optional[str] = None,
        base_url_corporate: Optional[str] = None,
        cms_url: Optional[str] = None,
        timeout: float = 15.0,
        connect_timeout: Optional[float] = None,
        read_timeout: Optional[float] = None,
        max_retries: int = 4,
        base_delay: float = 0.5,
        rate_limit_rps: float = 2.0,
        rate_limiter_enabled: bool = True,
        user_agent: Optional[str] = None,
        warmup_session: bool = False,
    ) -> None:
        self.session = TransgourmetSession(
            base_url=base_url,
            corporate_base_url=corporate_base_url,
            base_url_web=base_url_web,
            base_url_corporate=base_url_corporate,
            cms_url=cms_url,
            timeout=timeout,
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            max_retries=max_retries,
            base_delay=base_delay,
            rate_limit_rps=rate_limit_rps,
            rate_limiter_enabled=rate_limiter_enabled,
            user_agent=user_agent,
            warmup_session=warmup_session,
        )
        self.base_url = self.session.base_url
        self.corporate_base_url = self.session.corporate_base_url
        self.cms_url = self.session.cms_url

    def request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        return self.session.request(method, url, **kwargs)

    def get(self, url: str, **kwargs: Any) -> requests.Response:
        return self.session.get(url, **kwargs)

    def get_catalog_html(self, **kwargs: Any) -> str:
        return self.session.get_catalog_html(**kwargs)

    def get_catalog(self, **kwargs: Any) -> str:
        return self.session.get_catalog(**kwargs)

    def get_articles_search(self, **kwargs: Any) -> str:
        return self.session.get_articles_search(**kwargs)

    def get_brochures_html(self) -> str:
        return self.session.get_brochures_html()

    def get_home_html(self) -> str:
        return self.session.get_home_html()

    def download_brochure_pdf(self, pdf_url: str) -> bytes:
        return self.session.download_brochure_pdf(pdf_url)

    def get_article_detail(self, article_number: str) -> Optional[Dict[str, Any]]:
        return self.session.get_article_detail(article_number)

    def warmup(self) -> bool:
        return self.session.warmup()


__all__ = [
    "TransgourmetSession",
    "TransgourmetClient",
    "USER_AGENTS",
    "USER_AGENT_POOL",
    "DEFAULT_HEADERS",
    "MAX_RESPONSE_SIZE_BYTES",
]
