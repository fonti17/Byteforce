"""
Tier 1 Unit Tests: React Router SSR Turbo-Stream Parser.
Tests decoding and parsing of React Router v7 / Remix TurboStream embedded payloads.
"""

from __future__ import annotations

import json
from typing import Any
import pytest

from scraper.parsers.turbostream import (
    decode_turbo_stream,
    parse_turbostream_html,
    extract_search_response,
    parse_articles_from_stream,
    parse_article_dict,
)


@pytest.mark.unit
class TestTurboStreamDecoding:
    """Test suite for TurboStream index-resolution and raw JSON reconstruction."""

    def test_decode_single_article_stream(self, sample_single_article_html: str) -> None:
        """Verify extraction and recursive index-reference decoding on single article HTML."""
        decoded = parse_turbostream_html(sample_single_article_html)
        assert isinstance(decoded, dict)
        assert "loaderData" in decoded
        route_data = decoded["loaderData"]["features/catalog/routes/CatalogIndexRoute"]
        assert "searchResponse" in route_data
        sr = route_data["searchResponse"]
        assert sr["totalCount"] >= 1
        assert len(sr["articles"]) >= 1
        art = sr["articles"][0]
        assert art["articleNumber"] == "817441"
        assert "Ariel" in art["description"]

    def test_decode_search_milch_stream(self, sample_search_milch_html: str) -> None:
        """Verify decoding of a multi-item search query stream."""
        decoded = parse_turbostream_html(sample_search_milch_html)
        sr = extract_search_response(decoded)
        assert sr["totalCount"] > 1000
        assert len(sr["articles"]) == 100
        first_art = sr["articles"][0]
        assert "articleNumber" in first_art
        assert "price" in first_art

    def test_decode_promotions_actions_stream(self, sample_actions_html: str) -> None:
        """Verify decoding of catalog promotional actions stream (a=true)."""
        decoded = parse_turbostream_html(sample_actions_html)
        sr = extract_search_response(decoded)
        assert sr["totalCount"] >= 2000
        assert len(sr["articles"]) == 100
        action_count = sum(1 for a in sr["articles"] if a.get("isAction") is True)
        assert action_count > 90

    def test_decode_home_page_stream(self, sample_home_html: str) -> None:
        """Verify decoding of Prodega Easy homepage stream with campaigns and novelties."""
        decoded = parse_turbostream_html(sample_home_html)
        assert isinstance(decoded, dict)
        assert "loaderData" in decoded

    def test_parse_articles_to_models(self, sample_single_article_html: str) -> None:
        """Verify converting decoded stream articles into strongly-typed ProductItem models."""
        products = parse_articles_from_stream(sample_single_article_html)
        assert len(products) == 1
        product = products[0]
        assert product.article_number == "817441"
        assert product.price_chf == 28.99
        assert product.old_price_chf == 61.00
        assert product.unit_text == "Bx"
        assert product.is_action is True

    def test_memoized_reference_resolution_edge(self) -> None:
        """Verify stream reference resolver handles shared references and negative sentinels."""
        raw_stream_arr = [
            1,  # root index is 1
            {"_2": 3, "_4": -5, "_5": -7, "_6": 7},
            "key1",
            "val1",
            "key2",
            "key3",
            "items",
            [8, 9],
            "itemA",
            "itemB",
        ]
        decoded = decode_turbo_stream(raw_stream_arr)
        assert isinstance(decoded, dict)
        assert decoded.get("key1") == "val1"
        assert decoded.get("key2") is None  # -5 maps to None
        assert decoded.get("key3") is None  # -7 maps to None
        assert decoded.get("items") == ["itemA", "itemB"]

    def test_parse_article_dict_origins_and_eco_score(self) -> None:
        """Verify parse_article_dict correctly handles raw origin dicts and eco score structures."""
        raw_dict = {
            "articleNumber": "123999",
            "description": "Bio Rindfleisch Geschnetzeltes",
            "price": 32.50,
            "oldPrice": 38.00,
            "isAction": True,
            "unitText": "kg",
            "rohstoffHerkunft": [{"id": 1, "text": "Schweiz"}],
            "ecoScore": {"id": 1, "text": "A"},
            "celumId": 765432,
            "brand": "Origine",
        }
        item = parse_article_dict(raw_dict, category_id=8, category_name="Metzgerei")
        assert item is not None
        assert item.article_number == "123999"
        assert item.origin == ["Schweiz"]
        assert item.eco_score == "A"
        assert item.brand == "Origine"
        assert item.category_id == 8
        assert item.category_name == "Metzgerei"
        assert item.celum_id == 765432
