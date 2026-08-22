"""Small HTTP adapter exposing PriceService to the browser application."""

from __future__ import annotations

import json
import os
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
            ingredients = self.service.price_shopping_list(request.ingredients)
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
    server = ThreadingHTTPServer((host, port), PriceApiHandler)
    print(f"PRODEGA price API listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
