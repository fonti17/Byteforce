"""
Promotion, campaign, and weekly flyer brochure models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional, Union
from pydantic import BaseModel, Field, field_validator


class PromotionBrochure(BaseModel):
    """Weekly promotional flyer brochure document."""
    title: str = Field(..., description="Brochure title (e.g. Aktionen KW 35)")
    pdf_url: str = Field(..., description="Direct link to static PDF document on CMS")
    thumbnail_url: Optional[str] = Field(default=None, description="Flyer cover image thumbnail URL")
    valid_from: Optional[datetime] = Field(default=None, description="Start date of flyer promotion period")
    valid_to: Optional[datetime] = Field(default=None, description="End date of flyer promotion period")
    validity_text: Optional[str] = Field(default=None, description="Human-readable validity date range")
    calendar_week: Optional[int] = Field(default=None, description="Calendar Week number (KW)")
    brochure_type: Optional[str] = Field(default="weekly_action", description="Type category (weekly_action, aktionen, etc.)")

    @field_validator("calendar_week", mode="before")
    @classmethod
    def parse_calendar_week(cls, v: Any) -> Optional[int]:
        if isinstance(v, str) and v.isdigit():
            return int(v)
        return v if isinstance(v, int) else None


BrochureRecord = PromotionBrochure


class WeeklyActionItem(BaseModel):
    """Item featured in weekly promotional actions."""
    article_number: str = Field(..., description="Unique article SKU")
    title: str = Field(..., description="Item title")
    price_chf: float = Field(..., description="Action price in CHF")
    old_price_chf: Optional[float] = Field(default=None, description="Regular price in CHF")
    unit_text: str = Field(default="St", description="Packaging unit")
    discount_percent: Optional[float] = Field(default=None, description="Calculated discount percentage")


class PromotionCampaign(BaseModel):
    """Marketing banner campaign record."""
    campaign_id: Optional[str] = Field(default=None, description="Unique campaign identifier")
    id: Optional[str] = Field(default=None, description="Alternative ID field")
    title: str = Field(..., description="Campaign headline title")
    image_url: Optional[str] = Field(default=None, description="Campaign banner visual asset URL")
    link_url: Optional[str] = Field(default=None, description="Destination link URL")
    target_url: Optional[str] = Field(default=None, description="Alternative target URL")
    valid_from: Optional[datetime] = Field(default=None, description="Campaign start timestamp")
    valid_to: Optional[datetime] = Field(default=None, description="Campaign end timestamp")

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        if self.id is not None and self.campaign_id is None:
            self.campaign_id = self.id
        elif self.campaign_id is not None and self.id is None:
            self.id = self.campaign_id

        if self.target_url is not None and self.link_url is None:
            self.link_url = self.target_url
        elif self.link_url is not None and self.target_url is None:
            self.target_url = self.link_url


__all__ = [
    "PromotionBrochure",
    "BrochureRecord",
    "WeeklyActionItem",
    "PromotionCampaign",
]
