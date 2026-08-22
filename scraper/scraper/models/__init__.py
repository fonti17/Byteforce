"""
Data models package exports.
"""

from scraper.models.product import PriceInfo, ProductItem, ProductRecord
from scraper.models.promotion import PromotionBrochure, BrochureRecord, WeeklyActionItem, PromotionCampaign
from scraper.models.category import (
    CategoryItem,
    STANDARD_HAUPTWARENGRUPPEN,
    SLUG_ALIASES,
    get_standard_categories,
    resolve_category_id,
)
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional


class SearchResult(BaseModel):
    """Container for search responses."""
    query: str = Field(..., description="Query string used for search")
    total_count: int = Field(default=0, description="Total matching items on server")
    items: List[ProductItem] = Field(default_factory=list, description="Extracted product list")


class CatalogExportDataset(BaseModel):
    """Top-level schema for full catalog JSON export datasets."""
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Export metadata")
    flyers: List[PromotionBrochure] = Field(default_factory=list, description="Brochures and flyers")
    brochures: List[PromotionBrochure] = Field(default_factory=list, description="Brochures alias")
    promotions: List[ProductItem] = Field(default_factory=list, description="Active promotional products")
    products: List[ProductItem] = Field(default_factory=list, description="Extracted catalog products")

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        if self.brochures and not self.flyers:
            self.flyers = self.brochures
        elif self.flyers and not self.brochures:
            self.brochures = self.flyers


__all__ = [
    "PriceInfo",
    "ProductItem",
    "ProductRecord",
    "PromotionBrochure",
    "BrochureRecord",
    "WeeklyActionItem",
    "PromotionCampaign",
    "CategoryItem",
    "STANDARD_HAUPTWARENGRUPPEN",
    "SLUG_ALIASES",
    "get_standard_categories",
    "resolve_category_id",
    "SearchResult",
    "CatalogExportDataset",
]
