"""
Tier 1 & Tier 2 Test Suite: Data Models, Schema Validation & Currency Calculations.
Tests Pydantic models for ProductRecord, ProductItem, PriceInfo, BrochureRecord,
CategoryItem, and CHF currency/precision edge cases.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
import pytest
from pydantic import ValidationError

from scraper.models.product import PriceInfo, ProductItem, ProductRecord
from scraper.models.promotion import PromotionBrochure, BrochureRecord, PromotionCampaign, WeeklyActionItem
from scraper.models.category import (
    CategoryItem,
    STANDARD_HAUPTWARENGRUPPEN,
    SLUG_ALIASES,
    get_standard_categories,
    resolve_category_id,
)


# ==============================================================================
# Tier 1: Product & Pricing Model Feature Tests
# ==============================================================================

@pytest.mark.unit
class TestProductModelUnit:
    """Tier 1 Unit tests for ProductItem and ProductRecord models."""

    def test_complete_product_record_instantiation(self) -> None:
        """Verify instantiation of full product record with all fields populated."""
        prod = ProductRecord(
            article_number="040967",
            title="Cherry Tomaten Rispen, 500 g",
            brand="Quality",
            category_id=7,
            category_name="Früchte + Gemüse",
            price_chf=4.10,
            old_price_chf=5.15,
            normal_price_chf=5.15,
            action_price_chf=4.10,
            is_action=True,
            unit_text="Sc",
            package_quantity="500 g",
            sell_amount=1,
            sell_unit="Kt",
            price_per_sell_unit=4.10,
            origin=["Schweiz", "Italien"],
            eco_score="A-",
            is_available=True,
            action_valid_from=datetime(2026, 8, 24, tzinfo=timezone.utc),
            action_valid_to=datetime(2026, 8, 29, tzinfo=timezone.utc),
            celum_id=133620,
        )

        assert prod.article_number == "040967"
        assert prod.title == "Cherry Tomaten Rispen, 500 g"
        assert prod.brand == "Quality"
        assert prod.category_id == 7
        assert prod.category_name == "Früchte + Gemüse"
        assert prod.price_chf == 4.10
        assert prod.old_price_chf == 5.15
        assert prod.is_action is True
        assert prod.discount_percent is not None
        assert prod.discount_percent > 20.0  # (5.15 - 4.10) / 5.15 = 20.38%
        assert prod.unit_text == "Sc"
        assert prod.origin == ["Schweiz", "Italien"]
        assert prod.eco_score == "A-"
        assert prod.image_url == "https://webshop.transgourmet.ch/shop/productimages/article/133620.jpg"
        assert prod.is_available is True

    def test_product_embedded_price_info(self) -> None:
        """Verify embedded PriceInfo sub-model is automatically constructed."""
        prod = ProductItem(
            article_number="817441",
            title="Ariel Professional 140 WG",
            price_chf=28.99,
            old_price_chf=61.00,
            is_action=True,
            unit_text="Bx",
            price_per_sell_unit=28.99,
        )

        assert prod.price_info is not None
        assert isinstance(prod.price_info, PriceInfo)
        assert prod.price_info.price_chf == 28.99
        assert prod.price_info.old_price_chf == 61.00
        assert prod.price_info.is_discounted is True
        assert prod.price_info.discount_percent is not None
        assert pytest.approx(prod.price_info.discount_percent, 0.1) == 52.5

    def test_product_default_field_values(self) -> None:
        """Verify defaults: is_available=True, origin=[], is_action=False."""
        prod = ProductItem(
            article_number="123456",
            title="Simple Butter",
            price_chf=10.50,
            unit_text="kg",
        )

        assert prod.is_available is True
        assert prod.availability is True
        assert prod.origin == []
        assert prod.is_action is False
        assert prod.old_price_chf is None
        assert prod.discount_percent is None
        assert prod.brand is None

    def test_product_json_serialization_roundtrip(self) -> None:
        """Verify model_dump and model_dump_json serialize and deserialize cleanly."""
        prod = ProductItem(
            article_number="050085",
            title="Schweins-Nierstück",
            price_chf=10.99,
            old_price_chf=14.90,
            unit_text="kg",
            origin=["Schweiz"],
        )

        dumped_json = prod.model_dump_json()
        loaded_dict = json.loads(dumped_json)
        assert loaded_dict["article_number"] == "050085"
        assert loaded_dict["price_chf"] == 10.99
        assert loaded_dict["origin"] == ["Schweiz"]

        # Reconstruct
        rebuilt = ProductItem.model_validate(loaded_dict)
        assert rebuilt.article_number == prod.article_number
        assert rebuilt.price_chf == prod.price_chf


# ==============================================================================
# Tier 1: PriceInfo Model & CHF Precision Tests
# ==============================================================================

@pytest.mark.unit
class TestPriceInfoModelUnit:
    """Tier 1 Unit tests for PriceInfo model."""

    def test_price_info_standard(self) -> None:
        """Verify PriceInfo initialization and automatic discount calculation."""
        p_info = PriceInfo(
            price_chf=15.00,
            old_price_chf=20.00,
            unit_text="Kt",
        )
        assert p_info.price_chf == 15.00
        assert p_info.old_price_chf == 20.00
        assert p_info.is_discounted is True
        assert p_info.discount_percent == 25.0

    def test_price_info_non_discounted(self) -> None:
        """Verify non-discounted items have is_discounted=False and discount_percent=None."""
        p_info = PriceInfo(
            price_chf=12.50,
            old_price_chf=None,
            unit_text="kg",
        )
        assert p_info.price_chf == 12.50
        assert p_info.is_discounted is False
        assert p_info.discount_percent is None


# ==============================================================================
# Tier 1: Brochure & Category Model Tests
# ==============================================================================

@pytest.mark.unit
class TestBrochureAndCategoryModelsUnit:
    """Tier 1 Unit tests for PromotionBrochure and CategoryItem models."""

    def test_promotion_brochure_instantiation(self) -> None:
        """Verify valid brochure creation with PDF link and validity dates."""
        brochure = BrochureRecord(
            title="Prodega Aktionen 34",
            valid_from=datetime(2026, 8, 17, tzinfo=timezone.utc),
            valid_to=datetime(2026, 8, 22, tzinfo=timezone.utc),
            validity_text="17.08.2026 - 22.08.2026",
            pdf_url="https://www-static.transgourmet.ch/public/2026-08/kw34-agh-aktionen-d.pdf",
            thumbnail_url="https://www-static.transgourmet.ch/public/styles/iqbm_image_xs/public/2026-08/kw34.jpg",
            calendar_week=34,
            brochure_type="aktionen",
        )

        assert brochure.title == "Prodega Aktionen 34"
        assert brochure.calendar_week == 34
        assert brochure.brochure_type == "aktionen"
        assert brochure.pdf_url.endswith(".pdf")
        assert brochure.valid_from is not None
        assert brochure.valid_to is not None

    def test_standard_hauptwarengruppen_taxonomy(self) -> None:
        """Verify all 10 Swiss Hauptwarengruppen categories (HWG 1..10) are correctly defined."""
        cats = get_standard_categories()
        assert len(cats) == 10

        hwg_map = {c.id: c.name for c in cats}
        assert hwg_map[1] == "Food"
        assert hwg_map[5] == "Getränke"
        assert hwg_map[6] == "Molkerei/Backwaren"
        assert hwg_map[7] == "Früchte + Gemüse"
        assert hwg_map[8] == "Metzgerei"

    def test_resolve_category_id_variants(self) -> None:
        """Verify resolve_category_id handles integers, exact slugs, and aliases."""
        assert resolve_category_id(1) == 1
        assert resolve_category_id("1") == 1
        assert resolve_category_id("food") == 1
        assert resolve_category_id("Food") == 1
        assert resolve_category_id("metzgerei") == 8
        assert resolve_category_id("fleisch") == 8
        assert resolve_category_id("meat") == 8
        assert resolve_category_id("gemuese") == 7
        assert resolve_category_id("molkerei") == 6
        assert resolve_category_id("drinks") == 5
        assert resolve_category_id("invalid_category_xyz") is None


# ==============================================================================
# Tier 2: Boundary & Validation Edge Cases
# ==============================================================================

@pytest.mark.boundary
class TestModelsBoundaryAndEdgeCases:
    """Tier 2 Boundary tests for CHF rounding, unit texts, missing fields, and type errors."""

    def test_chf_price_rounding_precision(self) -> None:
        """Verify CHF prices with float precision issues are rounded to 2 decimals."""
        prod = ProductItem(
            article_number="111222",
            title="Precision Test Item",
            price_chf=4.1000000000000005,
            old_price_chf=5.1500000000000004,
            unit_text="kg",
        )
        assert prod.price_chf == 4.10
        assert prod.old_price_chf == 5.15

    def test_swiss_packaging_units_all_accepted(self) -> None:
        """Verify all standard Swiss gastronomy packaging abbreviations are valid."""
        units = ["kg", "g", "Fl", "St", "Kt", "Bx", "Pa", "Bt", "Ds", "Be", "Tp", "Rl", "Pk", "Sc"]
        for u in units:
            prod = ProductItem(
                article_number="999000",
                title=f"Item in {u}",
                price_chf=5.00,
                unit_text=u,
            )
            assert prod.unit_text == u

    def test_missing_required_fields_raises_validation_error(self) -> None:
        """Verify ValidationError is raised if article_number, title, or price_chf is missing."""
        # Missing article_number
        with pytest.raises(ValidationError):
            ProductItem(title="No SKU", price_chf=10.0, unit_text="kg")  # type: ignore

        # Missing title
        with pytest.raises(ValidationError):
            ProductItem(article_number="123456", price_chf=10.0, unit_text="kg")  # type: ignore

        # Missing price_chf
        with pytest.raises(ValidationError):
            ProductItem(article_number="123456", title="No Price", unit_text="kg")  # type: ignore

    def test_brochure_missing_pdf_url_raises_validation_error(self) -> None:
        """Verify BrochureRecord requires non-empty pdf_url."""
        with pytest.raises(ValidationError):
            BrochureRecord(title="No PDF Brochure")  # type: ignore

    def test_unicode_and_special_characters_in_title(self) -> None:
        """Verify product titles with Swiss-German umlauts, French accents, and symbols parse cleanly."""
        titles = [
            "Zürcher Geschnetzeltes vom Kalb, ca. 1 kg",
            "Gruyère AOP Réserve, ca. 2,5 kg",
            "Fondue Moitié-Moitié 400 g",
            "Crème fraîche 35% Fett, 1 l",
            "Châtaignes cuites sous vide, 500 g",
            "Bio Rinds-Voressen (Suisse Garantie) - 100% CH 🥩",
        ]
        for t in titles:
            prod = ProductItem(
                article_number="555444",
                title=t,
                price_chf=18.50,
                unit_text="kg",
            )
            assert prod.title == t

    def test_extra_fields_ignored_gracefully(self) -> None:
        """Verify extra unmodeled fields do not crash model instantiation."""
        data: dict[str, Any] = {
            "article_number": "123456",
            "title": "Extra Fields Product",
            "price_chf": 9.90,
            "unit_text": "St",
            "unrecognized_server_field_abc": 12345,
            "future_api_tag": "experimental",
        }
        prod = ProductItem.model_validate(data)
        assert prod.article_number == "123456"
