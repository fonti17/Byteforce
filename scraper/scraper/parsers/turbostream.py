"""
React Router / Remix Turbo-Stream decoder and article parser.
Decodes flat serialized stream arrays with recursive index resolution and converts articles to ProductItem models.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Union

from scraper.exceptions import MalformedJsonStreamError, MalformedHtmlError, ParsingError
from scraper.models.product import ProductItem, PriceInfo

logger = logging.getLogger(__name__)


def decode_turbostream_array(raw_payload: Union[str, List[Any], Dict[str, Any]]) -> Dict[str, Any]:
    """
    Decode React Router v7 / Remix turbo-stream payload array.
    Resolves flattened index references and negative sentinels safely without recursion loops.
    """
    if isinstance(raw_payload, str):
        try:
            stream = json.loads(raw_payload)
        except json.JSONDecodeError as e:
            raise MalformedJsonStreamError(f"Invalid JSON string in turbo-stream payload: {e}") from e
    elif isinstance(raw_payload, list):
        stream = raw_payload
    elif isinstance(raw_payload, dict):
        return raw_payload
    else:
        return {}

    if not isinstance(stream, list) or len(stream) == 0:
        return {}

    memo: Dict[int, Any] = {}

    def resolve_ref(idx: Any) -> Any:
        if not isinstance(idx, int):
            if isinstance(idx, dict):
                return {k: resolve_ref(v) for k, v in idx.items()}
            if isinstance(idx, list):
                return [resolve_ref(x) for x in idx]
            return idx

        # Negative integers represent sentinels (undefined, null, NaN, etc.)
        if idx < 0:
            return None

        if idx >= len(stream):
            return None

        if idx in memo:
            return memo[idx]

        raw_val = stream[idx]

        if isinstance(raw_val, dict):
            obj: Dict[str, Any] = {}
            memo[idx] = obj
            for k, v in raw_val.items():
                if k.startswith("_"):
                    try:
                        key_idx = int(k[1:])
                        resolved_key = resolve_ref(key_idx)
                    except ValueError:
                        resolved_key = k
                    resolved_val = resolve_ref(v)
                    if isinstance(resolved_key, (str, int)):
                        obj[str(resolved_key)] = resolved_val
                else:
                    obj[k] = resolve_ref(v)
            return obj
        elif isinstance(raw_val, list):
            lst: List[Any] = []
            memo[idx] = lst
            for elem in raw_val:
                lst.append(resolve_ref(elem))
            return lst
        else:
            memo[idx] = raw_val
            return raw_val

    root_idx = stream[0] if isinstance(stream[0], int) and 0 <= stream[0] < len(stream) else 0
    result = resolve_ref(root_idx)
    return result if isinstance(result, dict) else {"data": result}


decode_turbo_stream = decode_turbostream_array


def decode_turbostream_html(html: str) -> Dict[str, Any]:
    """
    Extract and decode the embedded turbo-stream JSON payload from HTML stream controller.
    """
    if not html or not isinstance(html, str):
        return {}

    # Case 1: streamController.enqueue("...")
    match = re.search(r'streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)', html)
    if not match:
        # Case 2: streamController.enqueue('...')
        match = re.search(r"streamController\.enqueue\('((?:[^'\\]|\\.)*)'\)", html)
    if not match:
        # Case 3: enqueue: '...'
        match = re.search(r"enqueue\s*:\s*'((?:[^'\\]|\\.)*)'", html)
    if not match:
        # Case 4: enqueue: "..."
        match = re.search(r'enqueue\s*:\s*"((?:[^"\\]|\\.)*)"', html)
    if not match:
        json_match = re.search(r'<script id="__REACT_ROUTER_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except Exception:
                pass
        return {}

    raw_escaped_str = match.group(1)
    try:
        raw_str = raw_escaped_str.encode("utf-8").decode("unicode_escape")
        return decode_turbostream_array(raw_str)
    except Exception:
        try:
            raw_str = raw_escaped_str.replace(r"\'", "'").replace(r'\"', '"').replace(r"\\", "\\")
            return decode_turbostream_array(raw_str)
        except Exception:
            return decode_turbostream_array(raw_escaped_str)


parse_turbostream_html = decode_turbostream_html


def extract_search_response(decoded: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract the searchResponse node from decoded turbo-stream or API dictionary.
    """
    if not isinstance(decoded, dict):
        return {"articles": [], "totalCount": 0, "itemCount": 0}

    if "searchResponse" in decoded and isinstance(decoded["searchResponse"], dict):
        return decoded["searchResponse"]

    loader_data = decoded.get("loaderData", {})
    if isinstance(loader_data, dict):
        for route_key, route_val in loader_data.items():
            if isinstance(route_val, dict) and "searchResponse" in route_val:
                sr = route_val["searchResponse"]
                if isinstance(sr, dict):
                    return sr

    def _find_search_response(node: Any) -> Optional[Dict[str, Any]]:
        if isinstance(node, dict):
            if "searchResponse" in node and isinstance(node["searchResponse"], dict):
                return node["searchResponse"]
            if "articles" in node and isinstance(node["articles"], list):
                return node
            for v in node.values():
                found = _find_search_response(v)
                if found:
                    return found
        return None

    found_sr = _find_search_response(decoded)
    if found_sr:
        return found_sr

    return {"articles": [], "totalCount": 0, "itemCount": 0}


def extract_home_data(decoded: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract homepage campaigns, promotions, and novelties from decoded home stream.
    """
    if not isinstance(decoded, dict):
        return {}

    loader_data = decoded.get("loaderData", {})
    if isinstance(loader_data, dict):
        for key in ["features/home/routes/HomeRoute", "shell/routes/AreaIndexRoute", "root"]:
            if key in loader_data and isinstance(loader_data[key], dict):
                return loader_data[key]
    return {}


def parse_article_dict(
    art: Dict[str, Any],
    category_id: Optional[int] = None,
    category_name: Optional[str] = None,
) -> Optional[ProductItem]:
    """
    Parse a single raw article dictionary into a validated ProductItem.
    """
    if not isinstance(art, dict):
        return None

    art_num = art.get("articleNumber") or art.get("article_number")
    title = art.get("description") or art.get("title") or art.get("name")
    
    if not art_num or not title:
        return None

    price_raw = art.get("price") or art.get("price_chf") or art.get("actionPrice")
    if price_raw is None:
        return None

    try:
        price_val = float(price_raw)
    except (ValueError, TypeError):
        return None

    if price_val < 0:
        return None

    old_price_raw = art.get("oldPrice") or art.get("old_price_chf") or art.get("normalPrice")
    try:
        old_price_val = float(old_price_raw) if old_price_raw is not None and float(old_price_raw) > 0 else None
    except (ValueError, TypeError):
        old_price_val = None

    is_action = bool(art.get("isAction", False) or (old_price_val is not None and old_price_val > price_val))
    unit_text = art.get("unitText") or art.get("unit_text") or "St"

    origin_raw = art.get("rohstoffHerkunft", [])
    origin_list: List[str] = []
    if isinstance(origin_raw, list):
        for o in origin_raw:
            if isinstance(o, dict) and "text" in o:
                origin_list.append(str(o["text"]))
            elif isinstance(o, dict) and "name" in o:
                origin_list.append(str(o["name"]))
            elif isinstance(o, str):
                origin_list.append(o)
    elif isinstance(origin_raw, str):
        origin_list.append(origin_raw)

    eco_raw = art.get("ecoScore")
    eco_score_str = None
    if isinstance(eco_raw, dict):
        eco_score_str = eco_raw.get("text") or eco_raw.get("name")
    elif isinstance(eco_raw, str):
        eco_score_str = eco_raw

    is_available = not bool(art.get("showCurrentlyNotAvailableMessage", False))

    celum_id = art.get("celumId")
    img_url = art.get("imageUrl") or art.get("image_url")
    if not img_url and celum_id:
        img_url = f"https://webshop.transgourmet.ch/shop/productimages/article/{celum_id}.jpg"

    cat_id = category_id if category_id is not None else (art.get("hwgId") or art.get("category_id"))
    cat_name = category_name if category_name is not None else (art.get("hwg") or art.get("category_name"))

    return ProductItem(
        article_number=str(art_num),
        title=str(title),
        brand=art.get("brand"),
        category_id=cat_id,
        category_name=cat_name,
        price_chf=price_val,
        old_price_chf=old_price_val,
        is_action=is_action,
        unit_text=str(unit_text),
        price_per_sell_unit=float(art["pricePerSellUnit"]) if "pricePerSellUnit" in art and art["pricePerSellUnit"] is not None else price_val,
        sell_amount=float(art.get("sellAmount", 1.0) or 1.0),
        sell_unit=art.get("sellUnit"),
        is_available=is_available,
        origin=origin_list,
        eco_score=eco_score_str,
        action_valid_from=art.get("actionValidFrom") or art.get("action_valid_from"),
        action_valid_to=art.get("actionValidTo") or art.get("action_valid_to"),
        celum_id=celum_id,
        image_url=img_url,
        approx_weight=float(art["approxWeight"]) if "approxWeight" in art and art["approxWeight"] is not None else None,
        substitute_article_number=str(art["substituteArticleNumber"]) if art.get("substituteArticleNumber") else None,
        substitute_article_title=str(art["substituteArticleText"]) if art.get("substituteArticleText") else None,
        main_article_id=art.get("mainArticleId"),
    )


def parse_articles_from_html(html_or_dict: Union[str, Dict[str, Any]]) -> List[ProductItem]:
    """
    Parse articles from HTML or decoded dict into a list of ProductItem models.
    """
    if isinstance(html_or_dict, str):
        decoded = decode_turbostream_html(html_or_dict)
    else:
        decoded = html_or_dict

    search_response = extract_search_response(decoded)
    raw_articles = search_response.get("articles", [])
    if not isinstance(raw_articles, list):
        return []

    products: List[ProductItem] = []
    for art in raw_articles:
        try:
            prod = parse_article_dict(art)
            if prod:
                products.append(prod)
        except Exception as e:
            logger.warning(f"Skipping corrupted article record: {e}")
            continue

    return products


parse_articles_from_stream = parse_articles_from_html


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
]
