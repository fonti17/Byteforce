"""Resolve catering ingredients to priced PRODEGA products."""

from __future__ import annotations

import math
import re
import unicodedata
from typing import Iterable, Literal, Mapping, Optional
from urllib.parse import quote_plus

from pydantic import BaseModel, Field, field_validator

from scraper.extractors.search import SearchService
from scraper.models.product import ProductItem

PRODEGA_CATALOG_URL = "https://web.transgourmet.ch/de/prodega-easy/catalog"

# PRODEGA unitText values describing containers rather than measurable content.
# Their weight/volume is therefore read from the product description.
CONTAINER_UNITS = {
    "fl", "kt", "bx", "pa", "bt", "ds", "be", "tp", "rl", "pk", "sc", "ne", "bd", "hs"
}
CONTAINER_PATTERN = (
    r"(?:fl(?:\.|asche(?:n)?)?|kt|karton|bx|box|pa|pk|pack(?:ung)?|"
    r"bt|beutel|ds|dose(?:n)?|be|becher|tp|topf|rl|rolle(?:n)?|"
    r"sc|schachtel|ne|netz|bd|bund|hs)"
)


class IngredientRequest(BaseModel):
    ingredient: str = Field(min_length=1, max_length=128)
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=16)

    @field_validator("ingredient", "unit")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class PricedIngredient(BaseModel):
    ingredient: str
    requested_quantity: float
    requested_unit: str
    status: Literal["matched", "not_found", "quantity_unknown"]
    pricing_message: Optional[str] = None
    product_name: Optional[str] = None
    article_number: Optional[str] = None
    price_chf: Optional[float] = None
    price_unit: Optional[str] = None
    package_quantity: Optional[str] = None
    package_price_chf: Optional[float] = None
    packages_needed: Optional[int] = None
    estimated_total_chf: Optional[float] = None
    product_url: Optional[str] = None
    is_available: Optional[bool] = None
    is_action: Optional[bool] = None


def _tokens(value: str) -> set[str]:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return set(re.findall(r"[a-z0-9]+", ascii_text))


def _base_quantity(quantity: float, unit: str) -> tuple[float, str] | None:
    normalized = unit.strip().casefold().rstrip(".")
    conversions = {
        "g": (quantity / 1000.0, "kg"), "kg": (quantity, "kg"),
        "ml": (quantity / 1000.0, "l"), "cl": (quantity / 100.0, "l"),
        "l": (quantity, "l"), "lt": (quantity, "l"),
        "piece": (quantity, "piece"), "stück": (quantity, "piece"),
        "st": (quantity, "piece"), "pack": (quantity, "pack"),
        "packung": (quantity, "pack"),
    }
    return conversions.get(normalized)


def _product_quantities(product: ProductItem) -> dict[str, float]:
    """Return all known quantities contained in one purchasable sales unit."""
    amount = product.sell_amount or 1.0
    quantities: dict[str, float] = {"pack": 1.0}
    direct = _base_quantity(amount, product.unit_text)
    if direct:
        quantities[direct[1]] = direct[0]
    elif product.unit_text.casefold().rstrip(".") in CONTAINER_UNITS:
        # sellAmount is the count of priced base containers in one sales unit.
        quantities["piece"] = amount

    number = r"(\d+(?:[.,]\d+)?)"
    content_unit = r"(kg|g|l|lt|ml|cl|stück|st)"
    title = product.title.casefold()
    # Examples: "24 Fl. x 50 cl", "6 Dosen × 2,125 kg". The previous
    # generic pattern only saw the trailing 50 cl/2,125 kg and undercounted.
    for count_text, content_text, unit_text in re.findall(
        rf"{number}\s*{CONTAINER_PATTERN}\s*[x×]\s*{number}\s*{content_unit}\b",
        title,
    ):
        count = float(count_text.replace(",", "."))
        content = float(content_text.replace(",", "."))
        converted = _base_quantity(count * content, unit_text)
        if converted:
            quantities[converted[1]] = max(quantities.get(converted[1], 0), converted[0])
        quantities["piece"] = max(quantities.get("piece", 0), count)

    for count_text, content_text, unit_text in re.findall(
        rf"{number}\s*[x×]\s*{number}\s*{content_unit}\b", title
    ):
        count = float(count_text.replace(",", "."))
        content = float(content_text.replace(",", "."))
        converted = _base_quantity(count * content, unit_text)
        if converted:
            quantities[converted[1]] = max(quantities.get(converted[1], 0), converted[0])
        quantities["piece"] = max(quantities.get("piece", 0), count)

    for value_text, unit_text in re.findall(rf"{number}\s*{content_unit}\b", title):
        converted = _base_quantity(float(value_text.replace(",", ".")), unit_text)
        if converted:
            quantities[converted[1]] = max(quantities.get(converted[1], 0), converted[0])
    return quantities


def _package_price(product: ProductItem) -> float:
    if product.price_per_sell_unit is not None and product.price_per_sell_unit > 0:
        return round(product.price_per_sell_unit, 2)
    return round(product.price_chf * (product.sell_amount or 1.0), 2)


def _score(query: str, product: ProductItem, requested_unit: str) -> tuple[float, float]:
    query_tokens = _tokens(query)
    title_tokens = _tokens(product.title)
    overlap = len(query_tokens & title_tokens) / max(len(query_tokens), 1)
    requested = _base_quantity(1, requested_unit)
    compatible = requested is not None and requested[1] in _product_quantities(product)
    score = overlap * 5.0
    score += 2.0 if query.casefold() in product.title.casefold() else 0.0
    score += 0.5 if product.is_available else -2.0
    score += 0.5 if product.price_chf > 0 else -2.0
    score += 0.1 if product.is_action else 0.0
    score += 4.0 if compatible else -4.0
    return score, -_package_price(product)


def _package_label(product: ProductItem, quantities: Mapping[str, float]) -> str:
    if product.package_quantity:
        return product.package_quantity
    for dimension, suffix in (("kg", "kg"), ("l", "l"), ("piece", "Stück")):
        value = quantities.get(dimension)
        if value:
            return f"{value:g} {suffix}"
    return product.sell_unit or product.unit_text or "Packung"


def _package_estimate(
    request: IngredientRequest, product: ProductItem
) -> tuple[Optional[int], Optional[float], Optional[float]]:
    required = _base_quantity(request.quantity, request.unit)
    package_quantity = _product_quantities(product).get(required[1]) if required else None
    if required is None or package_quantity is None or package_quantity <= 0:
        return None, None, None
    packages = max(1, math.ceil(required[0] / package_quantity))
    package_price = _package_price(product)
    return packages, package_price, round(packages * package_price, 2)


class PriceService:
    """Search PRODEGA and select one traceable, unit-compatible product."""

    def __init__(self, search_service: Optional[SearchService] = None) -> None:
        self.search_service = search_service or SearchService()

    def price_ingredient(
        self, request: IngredientRequest | Mapping[str, object], *, search_limit: int = 10
    ) -> PricedIngredient:
        ingredient = request if isinstance(request, IngredientRequest) else IngredientRequest.model_validate(request)
        products = self.search_service.search_articles(
            query=ingredient.ingredient, limit=max(1, min(search_limit, 25))
        )
        usable = [product for product in products if product.price_chf > 0]
        if not usable:
            return PricedIngredient(
                ingredient=ingredient.ingredient, requested_quantity=ingredient.quantity,
                requested_unit=ingredient.unit, status="not_found",
                pricing_message="Kein bepreistes PRODEGA-Produkt gefunden.",
            )

        # Prefer products that can actually be bought and calculated for the
        # requested dimension. Text similarity only decides within that set.
        available = [product for product in usable if product.is_available] or usable
        requested = _base_quantity(1, ingredient.unit)
        compatible = [
            product for product in available
            if requested is not None and requested[1] in _product_quantities(product)
        ]
        candidates = compatible or available
        product = max(candidates, key=lambda item: _score(ingredient.ingredient, item, ingredient.unit))
        packages_needed, package_price, estimated_total = _package_estimate(ingredient, product)
        purchase_price = _package_price(product)
        quantities = _product_quantities(product)
        status = "matched" if estimated_total is not None else "quantity_unknown"
        return PricedIngredient(
            ingredient=ingredient.ingredient, requested_quantity=ingredient.quantity,
            requested_unit=ingredient.unit, status=status,
            pricing_message=(None if status == "matched" else
                "Packungsinhalt und angeforderte Einheit sind nicht sicher vergleichbar."),
            product_name=product.title, article_number=product.article_number,
            price_chf=purchase_price, price_unit=product.sell_unit or "Packung",
            package_quantity=_package_label(product, quantities),
            package_price_chf=package_price or purchase_price,
            packages_needed=packages_needed, estimated_total_chf=estimated_total,
            product_url=f"{PRODEGA_CATALOG_URL}?searchTerm={quote_plus(product.article_number)}",
            is_available=product.is_available, is_action=product.is_action,
        )

    def price_shopping_list(
        self, ingredients: Iterable[IngredientRequest | Mapping[str, object]], *, search_limit: int = 10
    ) -> list[PricedIngredient]:
        return [self.price_ingredient(item, search_limit=search_limit) for item in ingredients]


__all__ = ["IngredientRequest", "PricedIngredient", "PriceService"]
