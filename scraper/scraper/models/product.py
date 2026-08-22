"""
Product and pricing data models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

VALID_UNITS = {"kg", "g", "Fl", "St", "Kt", "Bx", "Pa", "Bt", "Ds", "Be", "Tp", "Rl", "Pk", "Sc", "Ne"}
UNIT_NORMALIZE = {"Ne": "Bt"}


class PriceInfo(BaseModel):
    """Normalized Swiss Franc (CHF) pricing model."""
    price_chf: float = Field(..., description="Active price in Swiss Francs (CHF)")
    old_price_chf: Optional[float] = Field(default=None, description="Previous/base price before discount in CHF")
    is_discounted: bool = Field(default=False, description="True if promotional discount is active")
    discount_percent: Optional[float] = Field(default=None, description="Percentage savings relative to old_price")
    unit_text: str = Field(default="St", description="Standard packaging unit abbreviation (e.g. kg, Fl, St, Kt, Bx)")
    price_per_sell_unit: Optional[float] = Field(default=None, description="Price normalized per selling unit")
    sell_unit: Optional[str] = Field(default=None, description="Commercial selling unit designation")
    price_code: Optional[int] = Field(default=0, description="Internal pricing category code")

    @field_validator("price_chf")
    @classmethod
    def validate_positive_price(cls, v: float) -> float:
        if v < 0:
            raise ValueError(f"price_chf cannot be negative: {v}")
        return round(float(v), 2)

    @field_validator("old_price_chf")
    @classmethod
    def validate_positive_old_price(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            if v < 0:
                raise ValueError(f"old_price_chf cannot be negative: {v}")
            return round(float(v), 2)
        return None

    @model_validator(mode="after")
    def compute_discount(self) -> PriceInfo:
        if self.old_price_chf is not None and self.old_price_chf > self.price_chf:
            self.is_discounted = True
            if self.discount_percent is None:
                self.discount_percent = round(
                    ((self.old_price_chf - self.price_chf) / self.old_price_chf) * 100.0, 2
                )
        return self


class ProductItem(BaseModel):
    """Comprehensive Transgourmet product record for catering meal planning."""
    article_number: str = Field(..., description="Unique article SKU identifier")
    title: str = Field(..., description="Product description title")
    brand: Optional[str] = Field(default=None, description="Product brand name")
    category_id: Optional[int] = Field(default=None, description="Hauptwarengruppe ID (1..10)")
    category_name: Optional[str] = Field(default=None, description="Category name (e.g. Food, Metzgerei)")
    price_chf: float = Field(..., description="Active price in CHF")
    old_price_chf: Optional[float] = Field(default=None, description="Regular baseline price in CHF")
    normal_price_chf: Optional[float] = Field(default=None, description="Baseline regular price")
    action_price_chf: Optional[float] = Field(default=None, description="Promotional action price")
    is_action: bool = Field(default=False, description="True if promotional action is active")
    discount_percent: Optional[float] = Field(default=None, description="Calculated discount percentage")
    unit_text: str = Field(default="St", description="Unit abbreviation (kg, Fl, St, Kt, Bx, Pa, etc.)")
    price_per_sell_unit: Optional[float] = Field(default=None, description="Normalized price per sell unit")
    sell_amount: Optional[float] = Field(default=1.0, description="Selling quantity multiplier")
    sell_unit: Optional[str] = Field(default=None, description="Selling unit description")
    price_info: Optional[PriceInfo] = Field(default=None, description="Detailed pricing breakdown")
    package_quantity: Optional[str] = Field(default=None, description="Parsed pack size (e.g. 8 x 1.5 l)")
    is_available: bool = Field(default=True, description="Stock availability status")
    substitute_article_number: Optional[str] = Field(default=None, description="Recommended replacement SKU")
    substitute_article_title: Optional[str] = Field(default=None, description="Replacement product title")
    origin: List[str] = Field(default_factory=list, description="Raw material origin countries")
    eco_score: Optional[str] = Field(default=None, description="Eco-score label (A+, A, B, C, D, E)")
    action_valid_from: Optional[datetime] = Field(default=None, description="Promotion start timestamp")
    action_valid_to: Optional[datetime] = Field(default=None, description="Promotion end timestamp")
    celum_id: Optional[int] = Field(default=None, description="Image asset DAM identifier")
    image_url: Optional[str] = Field(default=None, description="Direct product image URL")
    approx_weight: Optional[float] = Field(default=None, description="Approximate weight in kg")
    main_article_id: Optional[int] = Field(default=None, description="Internal main article ID")

    @property
    def availability(self) -> bool:
        """Alias for is_available."""
        return self.is_available

    @field_validator("price_chf")
    @classmethod
    def validate_product_price(cls, v: float) -> float:
        if v < 0:
            raise ValueError(f"Price cannot be negative: {v}")
        return round(float(v), 2)

    @field_validator("old_price_chf")
    @classmethod
    def validate_product_old_price(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            if v < 0:
                raise ValueError(f"Old price cannot be negative: {v}")
            return round(float(v), 2)
        return None

    @field_validator("unit_text")
    @classmethod
    def normalize_unit_text(cls, v: str) -> str:
        if v in UNIT_NORMALIZE:
            return UNIT_NORMALIZE[v]
        return v

    @field_validator("action_valid_from", "action_valid_to", mode="before")
    @classmethod
    def parse_datetime_strings(cls, v: Any) -> Optional[datetime]:
        if isinstance(v, str) and v.strip():
            try:
                return datetime.fromisoformat(v.replace("Z", "+00:00"))
            except ValueError:
                return None
        return v if isinstance(v, datetime) else None

    @model_validator(mode="after")
    def sync_pricing_and_discounts(self) -> ProductItem:
        if self.normal_price_chf is None and self.old_price_chf is not None:
            self.normal_price_chf = self.old_price_chf
        if self.old_price_chf is None and self.normal_price_chf is not None:
            self.old_price_chf = self.normal_price_chf

        if self.action_price_chf is None and self.is_action:
            self.action_price_chf = self.price_chf

        if self.old_price_chf is not None and self.old_price_chf > self.price_chf:
            self.is_action = True
            if self.discount_percent is None:
                self.discount_percent = round(
                    ((self.old_price_chf - self.price_chf) / self.old_price_chf) * 100.0, 2
                )
        elif not self.is_action:
            self.discount_percent = None

        if self.price_per_sell_unit is None and self.price_chf is not None:
            self.price_per_sell_unit = self.price_chf

        if self.image_url is None and self.celum_id is not None:
            self.image_url = f"https://webshop.transgourmet.ch/shop/productimages/article/{self.celum_id}.jpg"

        if self.price_info is None:
            self.price_info = PriceInfo(
                price_chf=self.price_chf,
                old_price_chf=self.old_price_chf,
                is_discounted=self.is_action,
                discount_percent=self.discount_percent,
                unit_text=self.unit_text,
                price_per_sell_unit=self.price_per_sell_unit,
                sell_unit=self.sell_unit,
            )
        return self


ProductRecord = ProductItem
