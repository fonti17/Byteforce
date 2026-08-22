"""
Tier 2 Boundary Tests: Malformed SSR Streams, Corrupted Payloads & Fault Isolation.
Tests handling of truncated JSON, missing script tags, corrupted index references, and schema recovery.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock
import pytest

from scraper.parsers.turbostream import (
    decode_turbo_stream,
    parse_turbostream_html,
    parse_articles_from_stream,
    extract_search_response,
)
from scraper.exceptions import ParsingError, MalformedJsonStreamError, MalformedHtmlError


@pytest.mark.boundary
class TestMalformedStreamBoundary:
    """Test suite for malformed and corrupted React Router SSR stream payloads."""

    def test_missing_stream_script_tag(self) -> None:
        """Verify parsing HTML without streamController script returns empty dict safely."""
        html_without_script = "<html><body><h1>Maintenance Mode</h1><p>Under maintenance</p></body></html>"
        res = parse_turbostream_html(html_without_script)
        assert res == {}

    def test_truncated_json_in_stream(self) -> None:
        """Verify invalid JSON syntax inside stream script raises MalformedJsonStreamError."""
        with pytest.raises(MalformedJsonStreamError):
            decode_turbo_stream("{truncated_bad_json: [1, 2,")

    def test_corrupted_index_references_in_array(self) -> None:
        """Verify out-of-bounds index references in stream array are handled gracefully."""
        corrupted_payload = [
            1,
            {"_2": 999},  # points to nonexistent index 999
            "key",
        ]
        decoded = decode_turbo_stream(corrupted_payload)
        assert isinstance(decoded, dict)

    def test_fault_isolation_with_corrupted_articles(self) -> None:
        """Verify fault isolation: corrupted article records are skipped while valid sibling items are extracted."""
        sample_stream_dict = {
            "searchResponse": {
                "totalCount": 2,
                "articles": [
                    {"articleNumber": "100001", "description": "Valid Milk 1L", "price": 1.95, "unitText": "Fl"},
                    {"broken_record": True, "price": -50.0},
                    {"articleNumber": "100002", "description": "Valid Cheese", "price": 4.50, "unitText": "St"},
                ]
            }
        }
        products = parse_articles_from_stream(sample_stream_dict)
        assert len(products) == 2
        assert products[0].article_number == "100001"
        assert products[1].article_number == "100002"

    def test_missing_route_keys_graceful_handling(self) -> None:
        """Verify stream with unexpected route layout returns clean empty response."""
        stream_with_other_route = {
            "loaderData": {
                "features/other/routes/OtherRoute": {"message": "Hello"}
            }
        }
        res = extract_search_response(stream_with_other_route)
        assert res["articles"] == []
        assert res["totalCount"] == 0
