"""
Parsers package exports.
"""

from scraper.parsers.turbostream import (
    decode_turbostream_array,
    decode_turbo_stream,
    decode_turbostream_html,
    parse_turbostream_html,
    extract_search_response,
    extract_home_data,
    parse_article_dict,
    parse_articles_from_html,
    parse_articles_from_stream,
)
from scraper.parsers.brochures import (
    parse_brochures_html,
    parse_date_swiss,
    extract_brochure_metadata,
    extract_calendar_week_from_text,
    BrochuresParser,
)

__all__ = [
    "decode_turbostream_array",
    "decode_turbo_stream",
    "decode_turbostream_html",
    "parse_turbostream_html",
    "extract_search_response",
    "extract_home_data",
    "parse_article_dict",
    "parse_articles_from_html",
    "parse_articles_from_stream",
    "parse_brochures_html",
    "parse_date_swiss",
    "extract_brochure_metadata",
    "extract_calendar_week_from_text",
    "BrochuresParser",
]
