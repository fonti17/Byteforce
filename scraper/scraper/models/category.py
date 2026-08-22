"""
Category data models and taxonomy helpers for Transgourmet Hauptwarengruppen (HWG).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field

STANDARD_HAUPTWARENGRUPPEN: Dict[int, tuple[str, str]] = {
    1: ("Food", "food"),
    2: ("Tabak", "tabak"),
    3: ("Wein", "wein"),
    4: ("Spirituosen", "spirituosen"),
    5: ("Getränke", "getraenke"),
    6: ("Molkerei/Backwaren", "molkerei-backwaren"),
    7: ("Früchte + Gemüse", "fruechte-gemuese"),
    8: ("Metzgerei", "metzgerei"),
    9: ("Non-Food", "nonfood"),
    10: ("Near-Food", "nearfood"),
}

SLUG_ALIASES: Dict[str, int] = {
    "food": 1,
    "tabak": 2,
    "wein": 3,
    "spirituosen": 4,
    "drinks": 5,
    "getraenke": 5,
    "getränke": 5,
    "molkerei": 6,
    "molkerei-backwaren": 6,
    "molkerei/backwaren": 6,
    "fruechte": 7,
    "gemuese": 7,
    "gemüse": 7,
    "fruechte-gemuese": 7,
    "früchte + gemüse": 7,
    "produce": 7,
    "fleisch": 8,
    "meat": 8,
    "metzgerei": 8,
    "nonfood": 9,
    "non-food": 9,
    "nearfood": 10,
    "near-food": 10,
}


class CategoryItem(BaseModel):
    """Hauptwarengruppe category model."""
    id: int = Field(..., description="Unique Hauptwarengruppe numeric identifier (1..10)")
    name: str = Field(..., description="German display name for the category")
    slug: str = Field(..., description="URL-safe slug")
    article_count: Optional[int] = Field(default=None, description="Total articles in category")
    count: Optional[int] = Field(default=None, description="Alternative count field")

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        if self.count is not None and self.article_count is None:
            self.article_count = self.count
        elif self.article_count is not None and self.count is None:
            self.count = self.article_count


def get_standard_categories() -> List[CategoryItem]:
    """Retrieve the standard list of 10 Transgourmet Switzerland Hauptwarengruppen."""
    cats = []
    for hwg_id, (name, slug) in STANDARD_HAUPTWARENGRUPPEN.items():
        cats.append(CategoryItem(id=hwg_id, name=name, slug=slug))
    return cats


def resolve_category_id(slug_or_id: Union[str, int]) -> Optional[int]:
    """
    Resolve category integer ID from an integer, string numeric ID, slug, or alias.
    Returns None if the category is not recognized.
    """
    if isinstance(slug_or_id, int):
        return slug_or_id if slug_or_id in STANDARD_HAUPTWARENGRUPPEN else None

    if not isinstance(slug_or_id, str):
        return None

    cleaned = slug_or_id.strip().lower()
    if cleaned.isdigit():
        val = int(cleaned)
        return val if val in STANDARD_HAUPTWARENGRUPPEN else None

    return SLUG_ALIASES.get(cleaned)


__all__ = [
    "CategoryItem",
    "STANDARD_HAUPTWARENGRUPPEN",
    "SLUG_ALIASES",
    "get_standard_categories",
    "resolve_category_id",
]
