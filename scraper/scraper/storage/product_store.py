"""Persistent SQLite catalog used by the interactive price service."""

from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from scraper.models.product import ProductItem


DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "prodega_products.sqlite"


def _search_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", ascii_text))


def _query_tokens(query: str) -> list[str]:
    """Add conservative German word stems for plural ingredient searches."""
    result: list[str] = []
    for token in _search_text(query).split()[:6]:
        result.append(token)
        for suffix in ("ern", "en", "er", "e", "n", "s"):
            if token.endswith(suffix) and len(token) - len(suffix) >= 4:
                result.append(token[: -len(suffix)])
                break
    return list(dict.fromkeys(result))


class ProductStore:
    """Small connection-per-operation store, safe for the threaded HTTP API."""

    def __init__(self, path: str | Path = DEFAULT_DB_PATH) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS products (
                    article_number TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    search_text TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_products_search_text ON products(search_text);
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )

    def count(self) -> int:
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) FROM products").fetchone()
        return int(row[0]) if row else 0

    def replace_all(self, products: Iterable[ProductItem]) -> int:
        unique = {product.article_number: product for product in products}
        now = datetime.now(timezone.utc).isoformat()
        rows = [
            (
                product.article_number,
                product.title,
                _search_text(" ".join(filter(None, (product.title, product.brand, product.category_name)))),
                product.model_dump_json(),
                now,
            )
            for product in unique.values()
        ]
        if not rows:
            return 0
        with self._connect() as connection:
            connection.execute("DELETE FROM products")
            connection.executemany(
                """
                INSERT INTO products(article_number, title, search_text, payload, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                rows,
            )
            connection.execute(
                """
                INSERT INTO metadata(key, value) VALUES ('last_catalog_sync', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (now,),
            )
        return len(rows)

    def search(self, query: str, limit: int = 25) -> list[ProductItem]:
        tokens = _query_tokens(query)
        if not tokens:
            return []
        match_sql = " OR ".join("search_text LIKE ?" for _ in tokens)
        score_sql = " + ".join("CASE WHEN search_text LIKE ? THEN 1 ELSE 0 END" for _ in tokens)
        patterns = [f"%{token}%" for token in tokens]
        sql = f"""
            SELECT payload
            FROM products
            WHERE {match_sql}
            ORDER BY ({score_sql}) DESC, title ASC
            LIMIT ?
        """
        with self._connect() as connection:
            rows = connection.execute(sql, (*patterns, *patterns, max(1, min(limit, 100)))).fetchall()
        return [ProductItem.model_validate_json(row[0]) for row in rows]


__all__ = ["DEFAULT_DB_PATH", "ProductStore"]
