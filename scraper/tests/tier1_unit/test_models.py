"""
Tier 1 Unit Tests: Data Models, Schema Validation & Currency Calculations.
Tests Pydantic models for ProductItem, PriceInfo, PromotionBrochure, CategoryItem,
and currency/discount validations.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import pytest
from pydantic import ValidationError

from scraper.models.product import ProductItem, PriceInfo, VALID_UNITS
from scraper.models.promotion import PromotionBrochure, PromotionCampaign, WeeklyActionItem
from scraper.models.category import CategoryItem, STANDARD_HAUPTWARENGRUPPEN, resolve_category_id, get_standard_categories


@pytest.mark.unit
class TestProductItemModel:
    """Test suite for ProductItem data model."""

    def test_valid_product_creation(self) -> None:
        """Verify successful instantiation of a complete product record."""
        prod = ProductItem(
            article_number="817441",
            title="Ariel Professional Vollwaschmittel Regular, 140 WG",
            price_chf=28.99,
            old_price_chf=61.00,
            is_action=True,
            unit_text="Bx",
            brand="Ariel",
            eco_score="C+",
            origin=["Schweiz"],
            is_available=True,
        )
        assert prod.article_number == "817441"
        assert "Ariel" in prod.title
        assert prod.price_chf == 28.99
        assert prod.old_price_chf == 61.00
        assert prod.is_action is True
        assert prod.unit_text == "Bx"
        assert prod.is_available is True

    def test_product_minimal_fields(self) -> None:
        """Verify product can be created with only minimal mandatory fields."""
        prod = ProductItem(
            article_number="123456",
            title="Minimal Item",
            price_chf=5.00,
            unit_text="kg",
        )
        assert prod.article_number == "123456"
        assert prod.price_chf == 5.00
        assert prod.unit_text == "kg"
        assert prod.is_action is False
        assert prod.old_price_chf is None
        assert prod.is_available is True

    def test_price_rounding_and_precision(self) -> None:
        """Verify CHF prices maintain exact decimal precision."""
        prod = ProductItem(
            article_number="040967",
            title="Cherry Tomaten Rispen, 500 g",
            price_chf=4.10,
            old_price_chf=5.15,
            is_action=True,
            unit_text="Pa",
        )
        assert round(prod.price_chf, 2) == 4.10
        assert round(prod.old_price_chf, 2) == 5.15

    def test_discount_percent_calculation(self) -> None:
        """Verify calculation of discount percentage for action items."""
        prod = ProductItem(
            article_number="817441",
            title="Ariel 140 WG",
            price_chf=28.99,
            old_price_chf=61.00,
            is_action=True,
            unit_text="Bx",
        )
        assert prod.discount_percent is not None
        assert pytest.approx(prod.discount_percent, 0.1) == 52.48

    def test_non_discounted_product_behavior(self) -> None:
        """Verify standard catalog items without actions have no discount."""
        prod = ProductItem(
            article_number="123456",
            title="Standard Butter 1kg",
            price_chf=12.50,
            old_price_chf=None,
            is_action=False,
            unit_text="kg",
        )
        assert prod.is_action is False
        assert prod.old_price_chf is None
        assert prod.discount_percent is None

    def test_rejection_of_negative_price(self) -> None:
        """Verify validation error when price is negative."""
        with pytest.raises(ValidationError):
            ProductItem(
                article_number="123456",
                title="Invalid Item",
                price_chf=-10.50,
                unit_text="kg",
            )

    def test_rejection_of_negative_old_price(self) -> None:
        """Verify validation error when old_price_chf is negative."""
        with pytest.raises(ValidationError):
            ProductItem(
                article_number="123456",
                title="Invalid Item",
                price_chf=10.50,
                old_price_chf=-20.0,
                unit_text="kg",
            )

    def test_packaging_units_support(self) -> None:
        """Verify acceptance of standard Swiss wholesale packaging unit abbreviations."""
        for unit in VALID_UNITS:
            prod = ProductItem(
                article_number="111111",
                title=f"Sample Product in {unit}",
                price_chf=9.90,
                unit_text=unit,
            )
            assert prod.unit_text in VALID_UNITS

    def test_datetime_parsing_for_promotions(self) -> None:
        """Verify ISO 8601 string parsing for action validity ranges."""
        valid_from_str = "2026-08-17T00:00:00+00:00"
        valid_to_str = "2026-08-22T23:59:59+00:00"
        prod = ProductItem(
            article_number="999888",
            title="Promo Item with Date",
            price_chf=15.00,
            unit_text="Kt",
            is_action=True,
            action_valid_from=valid_from_str,
            action_valid_to=valid_to_str,
        )
        assert prod.action_valid_from is not None
        assert prod.action_valid_to is not None

    def test_json_roundtrip_serialization(self) -> None:
        """Verify serialization to JSON string and clean deserialization back to model."""
        prod = ProductItem(
            article_number="817441",
            title="Ariel Professional",
            price_chf=28.99,
            unit_text="Bx",
            origin=["CH"],
        )
        json_str = prod.model_dump_json()
        assert "817441" in json_str
        assert "Ariel Professional" in json_str
        loaded = ProductItem.model_validate_json(json_str)
        assert loaded.article_number == prod.article_number
        assert loaded.price_chf == prod.price_chf

    def test_origin_multiple_countries_parsing(self) -> None:
        """Verify multi-country origin parsing."""
        prod = ProductItem(
            article_number="554433",
            title="Mixed Salad Green",
            price_chf=6.20,
            unit_text="Kt",
            origin=["Schweiz", "Italien", "Spanien"],
        )
        assert len(prod.origin) == 3
        assert "Schweiz" in prod.origin

    def test_price_per_sell_unit_calculation(self) -> None:
        """Verify price per sell unit field support."""
        prod = ProductItem(
            article_number="778899",
            title="Milk 12x1L Carton",
            price_chf=18.00,
            unit_text="Kt",
            price_per_sell_unit=1.50,
            sell_unit="Fl",
            sell_amount=12,
        )
        assert prod.price_per_sell_unit == 1.50
        assert prod.sell_unit == "Fl"
        assert prod.sell_amount == 12

    def test_availability_and_substitute_fields(self) -> None:
        """Verify out of stock flag and substitute article recommendations."""
        prod = ProductItem(
            article_number="654321",
            title="Unavailable Cheese",
            price_chf=14.00,
            unit_text="kg",
            is_available=False,
            substitute_article_number="654322",
            substitute_article_title="Alternative Cheese",
        )
        assert prod.is_available is False
        assert prod.substitute_article_number == "654322"
        assert prod.substitute_article_title == "Alternative Cheese"

    def test_eco_score_ratings(self) -> None:
        """Verify eco_score accepts rating letter grades (A, B, C+, D, E)."""
        for score in ["A", "B", "C+", "D", "E"]:
            prod = ProductItem(
                article_number="123000",
                title=f"Eco Product {score}",
                price_chf=10.00,
                unit_text="kg",
                eco_score=score,
            )
            assert prod.eco_score == score

    def test_celum_id_and_image_url(self) -> None:
        """Verify image URL resolution when celum_id is provided."""
        prod = ProductItem(
            article_number="817441",
            title="Ariel Product",
            price_chf=28.99,
            unit_text="Bx",
            celum_id=760246,
            image_url="https://webshop.transgourmet.ch/shop/productimages/article/760246.jpg",
        )
        assert prod.celum_id == 760246
        assert "760246" in prod.image_url

    def test_approx_weight_float_validation(self) -> None:
        """Verify approx_weight stores piece weight in kg."""
        prod = ProductItem(
            article_number="443322",
            title="Watermelon Portion",
            price_chf=8.50,
            unit_text="St",
            approx_weight=2.45,
        )
        assert prod.approx_weight == 2.45

    def test_main_article_id_reference(self) -> None:
        """Verify main_article_id links variants to parent article."""
        prod = ProductItem(
            article_number="889900",
            title="Butter Mini 10g",
            price_chf=0.25,
            unit_text="St",
            main_article_id=88990,
        )
        assert prod.main_article_id == 88990


@pytest.mark.unit
class TestPriceInfoModel:
    """Test suite for PriceInfo data model."""

    def test_price_info_creation(self) -> None:
        """Verify PriceInfo model instantiation and fields."""
        pi = PriceInfo(
            price_chf=15.50,
            old_price_chf=18.00,
            is_discounted=True,
            unit_text="kg",
            price_per_sell_unit=15.50,
            sell_unit="kg",
        )
        assert pi.price_chf == 15.50
        assert pi.old_price_chf == 18.00
        assert pi.is_discounted is True
        assert pi.unit_text == "kg"

    def test_price_info_negative_rejection(self) -> None:
        """Verify negative price in PriceInfo raises validation error."""
        with pytest.raises(ValidationError):
            PriceInfo(price_chf=-5.0, unit_text="St")


@pytest.mark.unit
class TestPromotionModels:
    """Test suite for PromotionBrochure, PromotionCampaign, and WeeklyActionItem."""

    def test_valid_brochure_instantiation(self) -> None:
        """Verify creation of a weekly flyer brochure record."""
        brochure = PromotionBrochure(
            title="Prodega Aktionen 35",
            pdf_url="https://www-static.transgourmet.ch/public/2026-08/aktionen_agh_kw35_2026_d_web.pdf",
            thumbnail_url="https://www-static.transgourmet.ch/public/styles/iqbm_image_xs/public/2026-08/kw35-agh-aktionen-d.jpg",
            valid_from=datetime(2026, 8, 24),
            valid_to=datetime(2026, 8, 29),
            calendar_week=35,
            brochure_type="aktionen",
        )
        assert "35" in brochure.title
        assert brochure.pdf_url.endswith(".pdf")
        assert brochure.thumbnail_url is not None
        assert brochure.calendar_week == 35
        assert brochure.brochure_type == "aktionen"

    def test_brochure_pdf_url_required(self) -> None:
        """Verify validation error if PDF URL is missing."""
        with pytest.raises(ValidationError):
            PromotionBrochure(
                title="Brochure Without PDF",
            )

    def test_brochure_calendar_week_str_or_int(self) -> None:
        """Verify calendar week accepts integer or string representation."""
        brochure = PromotionBrochure(
            title="Aktionen KW 34",
            pdf_url="https://www-static.transgourmet.ch/kw34.pdf",
            calendar_week=34,
        )
        assert brochure.calendar_week == 34

    def test_promotion_campaign_model(self) -> None:
        """Verify PromotionCampaign instantiation and attributes."""
        camp = PromotionCampaign(
            campaign_id="camp_101",
            title="Sommer Grill Highlights",
            image_url="https://webshop.transgourmet.ch/shop/productimages/promo/12345.jpg",
            link_url="/de/sortiment/grill",
        )
        assert camp.campaign_id == "camp_101"
        assert camp.title == "Sommer Grill Highlights"
        assert camp.image_url is not None

    def test_weekly_action_item_model(self) -> None:
        """Verify WeeklyActionItem instantiation and properties."""
        action_item = WeeklyActionItem(
            article_number="040967",
            title="Cherry Tomaten",
            price_chf=4.10,
            old_price_chf=5.15,
            unit_text="Pa",
        )
        assert action_item.article_number == "040967"
        assert action_item.price_chf == 4.10
        assert action_item.title == "Cherry Tomaten"


@pytest.mark.unit
class TestCategoryTaxonomyModels:
    """Test suite for CategoryItem data model and category resolvers."""

    def test_hauptwarengruppen_categories(self) -> None:
        """Verify category IDs 1-10 corresponding to Swiss Hauptwarengruppen."""
        categories_data = [
            (1, "Food", "food"),
            (7, "Früchte + Gemüse", "fruechte-gemuese"),
            (8, "Metzgerei", "metzgerei"),
            (6, "Molkerei/Backwaren", "molkerei-backwaren"),
            (5, "Getränke", "getraenke"),
            (3, "Wein", "wein"),
            (4, "Spirituosen", "spirituosen"),
            (10, "Nearfood", "nearfood"),
            (9, "Nonfood", "nonfood"),
            (2, "Tabak", "tabak"),
        ]
        for hwg_id, name, slug in categories_data:
            cat = CategoryItem(id=hwg_id, name=name, slug=slug)
            assert cat.id == hwg_id
            assert cat.name == name
            assert cat.slug == slug

    def test_category_article_count_optional(self) -> None:
        """Verify category article_count field is optional and holds total items."""
        cat = CategoryItem(id=1, name="Food", slug="food", article_count=5726)
        assert cat.article_count == 5726

    def test_resolve_category_id_by_int_and_slug(self) -> None:
        """Verify resolve_category_id handles both integer IDs and string slugs."""
        assert resolve_category_id(1) == 1
        assert resolve_category_id("1") == 1
        assert resolve_category_id("food") == 1
        assert resolve_category_id("molkerei-backwaren") == 6
        assert resolve_category_id("metzgerei") == 8
        assert resolve_category_id("fruechte-gemuese") == 7
        assert resolve_category_id("getraenke") == 5
        assert resolve_category_id("nonexistent_cat") is None

    def test_get_standard_categories_list(self) -> None:
        """Verify get_standard_categories returns list of all 10 HWG CategoryItems."""
        cats = get_standard_categories()
        assert len(cats) == 10
        assert any(c.id == 1 for c in cats)
        assert any(c.name == "Food" for c in cats)
