"""
Transgourmet Switzerland Web Scraper & Intelligence Toolkit.
Automated, resilient, and secure data extraction pipeline for Transgourmet Switzerland.
"""

from __future__ import annotations

from scraper.client.session import TransgourmetSession, TransgourmetClient
from scraper.client.rate_limiter import RateLimiter, TokenBucket, TokenBucketRateLimiter
from scraper.client.backoff import ExponentialBackoff, calculate_backoff, parse_retry_after
from scraper.models.product import PriceInfo, ProductItem, ProductRecord
from scraper.models.promotion import PromotionBrochure, BrochureRecord, WeeklyActionItem, PromotionCampaign
from scraper.models.category import CategoryItem
from scraper.models import SearchResult, CatalogExportDataset
from scraper.extractors.catalog import CatalogScraper, CatalogExtractor
from scraper.extractors.promotions import PromoExtractor, PromotionExtractor
from scraper.extractors.search import SearchService, SearchExtractor
from scraper.price_service import IngredientRequest, PricedIngredient, PriceService
from scraper.storage.export import ExportService, BatchCatalogExporter
from scraper.security import (
    sanitize_search_query,
    sanitize_csv_cell,
    validate_category_slug,
    validate_numeric_bound,
    resolve_safe_export_path,
    atomic_write_json,
    atomic_save_json,
    VALID_CATEGORY_SLUGS,
)
from scraper.exceptions import (
    TransgourmetScraperError,
    NetworkError,
    HttpError,
    RequestTimeoutError,
    RateLimitExceededError,
    RateLimitError,
    ConnectionFailedError,
    MaxRetriesExceededError,
    ParsingError,
    ParserError,
    MalformedHtmlError,
    MalformedJsonStreamError,
    SchemaValidationError,
    SecurityValidationError,
    PathTraversalError,
    InputInjectionError,
    InvalidParameterError,
)

__version__ = "1.0.0"

__all__ = [
    "TransgourmetSession",
    "TransgourmetClient",
    "RateLimiter",
    "TokenBucket",
    "TokenBucketRateLimiter",
    "ExponentialBackoff",
    "calculate_backoff",
    "parse_retry_after",
    "PriceInfo",
    "ProductItem",
    "ProductRecord",
    "PromotionBrochure",
    "BrochureRecord",
    "WeeklyActionItem",
    "PromotionCampaign",
    "CategoryItem",
    "SearchResult",
    "CatalogExportDataset",
    "CatalogScraper",
    "CatalogExtractor",
    "PromoExtractor",
    "PromotionExtractor",
    "SearchService",
    "SearchExtractor",
    "IngredientRequest",
    "PricedIngredient",
    "PriceService",
    "ExportService",
    "BatchCatalogExporter",
    "sanitize_search_query",
    "sanitize_csv_cell",
    "validate_category_slug",
    "validate_numeric_bound",
    "resolve_safe_export_path",
    "atomic_write_json",
    "atomic_save_json",
    "VALID_CATEGORY_SLUGS",
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
