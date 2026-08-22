"""
Drupal CMS weekly action flyer and brochure parser.
Extracts brochure cards, validity dates, static PDF download links, and thumbnails from HTML.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup

from scraper.exceptions import MalformedHtmlError
from scraper.models.promotion import PromotionBrochure, BrochureRecord

logger = logging.getLogger(__name__)


def parse_date_swiss(date_str: Optional[str]) -> Optional[datetime]:
    """Parse Swiss formatted date string DD.MM.YYYY into datetime."""
    if not date_str or not isinstance(date_str, str):
        return None
    cleaned = date_str.strip()
    try:
        return datetime.strptime(cleaned, "%d.%m.%Y")
    except ValueError:
        return None


def extract_calendar_week_from_text(text: str) -> Optional[int]:
    """
    Extract integer Calendar Week (KW) from title or filename (e.g. 'KW 35', 'Aktionen 35', 'kw35').
    """
    if not text:
        return None

    match_kw = re.search(r"(?:kw|calendar\s*week)[\s_\-]*(\d{1,2})", text, re.IGNORECASE)
    if match_kw:
        return int(match_kw.group(1))

    match_akt = re.search(r"aktionen[\s_\-]*(\d{1,2})", text, re.IGNORECASE)
    if match_akt:
        return int(match_akt.group(1))

    return None


def extract_brochure_metadata(teaser_elem: Any) -> Optional[PromotionBrochure]:
    """
    Extract a single PromotionBrochure from a .tg-promotion-teaser BeautifulSoup element.
    """
    link_tag = teaser_elem.select_one("a.tg-promotion-teaser__link") or teaser_elem.find("a", href=re.compile(r"\.pdf", re.I))
    if not link_tag:
        for a in teaser_elem.find_all("a", href=True):
            if ".pdf" in a["href"].lower():
                link_tag = a
                break

    if not link_tag or not link_tag.get("href"):
        return None

    pdf_url = link_tag["href"].strip()
    if pdf_url.startswith("/"):
        pdf_url = f"https://www-static.transgourmet.ch{pdf_url}"

    title_tag = teaser_elem.select_one("span.field--name-title") or teaser_elem.select_one(".tg-promotion-teaser__title") or link_tag
    title = title_tag.get_text(strip=True) if title_tag else "Transgourmet Aktionen"
    if not title:
        title = "Transgourmet Aktionen"

    img_tag = teaser_elem.find("img")
    thumbnail_url = None
    if img_tag and img_tag.get("src"):
        thumbnail_url = img_tag["src"].strip()
        if thumbnail_url.startswith("/"):
            thumbnail_url = f"https://www-static.transgourmet.ch{thumbnail_url}"

    # Dates
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    validity_text: Optional[str] = None

    time_tags = teaser_elem.select("time.datetime") or teaser_elem.find_all("time")
    if len(time_tags) >= 2:
        dt1 = time_tags[0].get("datetime") or time_tags[0].get_text(strip=True)
        dt2 = time_tags[1].get("datetime") or time_tags[1].get_text(strip=True)
        if dt1:
            valid_from = parse_date_swiss(dt1)
            if not valid_from:
                try:
                    valid_from = datetime.fromisoformat(dt1.replace("Z", "+00:00")).replace(tzinfo=None)
                except ValueError:
                    pass
        if dt2:
            valid_to = parse_date_swiss(dt2)
            if not valid_to:
                try:
                    valid_to = datetime.fromisoformat(dt2.replace("Z", "+00:00")).replace(tzinfo=None)
                except ValueError:
                    pass
    elif len(time_tags) == 1:
        dt_text = time_tags[0].get_text(strip=True)
        dt_attr = time_tags[0].get("datetime")
        if "-" in dt_text:
            parts = dt_text.split("-")
            valid_from = parse_date_swiss(parts[0].strip())
            valid_to = parse_date_swiss(parts[1].strip())
        elif dt_attr:
            valid_from = parse_date_swiss(dt_attr)

    # If validity text found in element
    date_container = teaser_elem.select_one(".tg-promotion-teaser__date") or teaser_elem.select_one(".field--name-field-date")
    if date_container:
        d_text = date_container.get_text(strip=True)
        if "-" in d_text:
            validity_text = d_text
            parts = d_text.split("-")
            if not valid_from:
                valid_from = parse_date_swiss(parts[0].strip())
            if not valid_to:
                valid_to = parse_date_swiss(parts[1].strip())

    if valid_from and valid_to and not validity_text:
        validity_text = f"{valid_from.strftime('%d.%m.%Y')} - {valid_to.strftime('%d.%m.%Y')}"

    kw_num = extract_calendar_week_from_text(title) or extract_calendar_week_from_text(pdf_url)

    # Determine brochure type
    b_type = "weekly_action"
    t_lower = title.lower()
    p_lower = pdf_url.lower()
    if "aktion" in t_lower or "aktion" in p_lower:
        b_type = "aktionen"
    elif "bestellliste" in t_lower or "bestellliste" in p_lower:
        b_type = "bestellliste"
    elif "vorverkauf" in t_lower:
        b_type = "vorverkauf"
    elif "katalog" in t_lower or "katalog" in p_lower:
        b_type = "katalog"

    return PromotionBrochure(
        title=title,
        pdf_url=pdf_url,
        thumbnail_url=thumbnail_url,
        valid_from=valid_from,
        valid_to=valid_to,
        validity_text=validity_text,
        calendar_week=kw_num,
        brochure_type=b_type,
    )


def parse_brochures_html(html: str) -> List[PromotionBrochure]:
    """
    Parse full HTML page from https://www.transgourmet.ch/de/aktionen-broschueren.
    Returns list of valid PromotionBrochure objects.
    Raises MalformedHtmlError if html is empty.
    """
    if html is None or not isinstance(html, str) or not html.strip():
        raise MalformedHtmlError("HTML content cannot be empty")

    soup = BeautifulSoup(html, "html.parser")
    teasers = soup.select("div.tg-promotion-teaser")

    if not teasers:
        teasers = soup.find_all(class_=re.compile(r"tg-promotion-teaser|promotion-teaser"))

    brochures: List[PromotionBrochure] = []
    for t in teasers:
        try:
            brochure = extract_brochure_metadata(t)
            if brochure:
                brochures.append(brochure)
        except Exception as e:
            logger.warning(f"Error parsing brochure teaser: {e}")
            continue

    return brochures


class BrochuresParser:
    """Parser class interface for promotional brochures."""
    
    @staticmethod
    def parse(html: str) -> List[PromotionBrochure]:
        return parse_brochures_html(html)

    @staticmethod
    def extract_metadata(elem: Any) -> Optional[PromotionBrochure]:
        return extract_brochure_metadata(elem)


__all__ = [
    "parse_brochures_html",
    "parse_date_swiss",
    "extract_brochure_metadata",
    "extract_calendar_week_from_text",
    "BrochuresParser",
]
