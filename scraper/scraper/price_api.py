"""Small HTTP adapter exposing PriceService to the browser application."""

from __future__ import annotations

import json
import logging
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pydantic import BaseModel, Field, ValidationError

from scraper.price_service import IngredientRequest, PriceService


class PriceRequest(BaseModel):
    ingredients: list[IngredientRequest] = Field(max_length=100)


class PriceApiHandler(BaseHTTPRequestHandler):
    service = PriceService()

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/prices":
            self._write_json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 262_144:
                raise ValueError("Invalid request size")
            request = PriceRequest.model_validate_json(self.rfile.read(length))
            started_at = time.perf_counter()
            ingredients = self.service.price_shopping_list(request.ingredients)
            duration_ms = (time.perf_counter() - started_at) * 1000
            print(
                f"[price-api] Request with {len(request.ingredients)} ingredients "
                f"completed in {duration_ms:.1f} ms",
                flush=True,
            )
            self._write_json(
                200,
                {"ingredients": [item.model_dump(mode="json") for item in ingredients]},
            )
        except (ValueError, ValidationError, json.JSONDecodeError) as error:
            self._write_json(400, {"error": str(error)})
        except Exception:
            self._write_json(502, {"error": "PRODEGA price lookup failed"})

    def _write_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, message: str, *args: object) -> None:
        print(f"[price-api] {message % args}")


def run() -> None:
    host = os.getenv("PRICE_API_HOST", "127.0.0.1")
    port = int(os.getenv("PRICE_API_PORT", "8787"))
    categories = [
        int(value.strip())
        for value in os.getenv("PRICE_CATALOG_CATEGORIES", "1,2,3,4,5,6,7,8,9,10").split(",")
        if value.strip()
    ]
    try:
        print("Synchronizing Transgourmet webshop catalog into SQLite ...")
        sync_started_at = time.perf_counter()
        count = PriceApiHandler.service.sync_catalog(category_ids=categories)
        sync_seconds = time.perf_counter() - sync_started_at
        print(f"Stored {count} Transgourmet products in SQLite in {sync_seconds:.1f} s")
    except Exception:
        existing = PriceApiHandler.service.product_store.count()
        logging.exception("Transgourmet webshop catalog synchronization failed")
        print(f"Using {existing} products from the existing SQLite catalog")
    server = ThreadingHTTPServer((host, port), PriceApiHandler)
    print(f"PRODEGA price API listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
