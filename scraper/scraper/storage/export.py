"""
Batch catalog dataset compiler and exporter.
Supports JSON and CSV export formats with atomic write guarantees.
"""

from __future__ import annotations

import csv
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from scraper.client.session import TransgourmetSession
from scraper.extractors.catalog import CatalogExtractor
from scraper.extractors.promotions import PromotionExtractor
from scraper.models.product import ProductItem
from scraper.models.promotion import PromotionBrochure
from scraper.models import CatalogExportDataset
from scraper.security import resolve_safe_export_path, atomic_write_json, sanitize_csv_cell

logger = logging.getLogger(__name__)


class DatasetExporter:
    """
    Service for compiling comprehensive datasets of catalog products, promotions, and brochures.
    Supports atomic JSON exports, CSV tabular exports, and live batch scraping.
    """

    def __init__(
        self,
        client: Optional[TransgourmetSession] = None,
        base_dir: Optional[Union[str, Path]] = None,
    ) -> None:
        self.client = client if client is not None else TransgourmetSession()
        self.base_dir = base_dir
        self.catalog_extractor = CatalogExtractor(client=self.client)
        self.promo_extractor = PromotionExtractor(client=self.client)

    def build_dataset_payload(
        self,
        products: Optional[List[ProductItem]] = None,
        promotions: Optional[List[ProductItem]] = None,
        brochures: Optional[List[PromotionBrochure]] = None,
    ) -> Dict[str, Any]:
        """
        Build the top-level structured dictionary matching the Transgourmet catalog export schema.
        """
        prods = products or []
        promos = promotions or []
        flyers = brochures or []

        category_dist: Dict[str, int] = {}
        for p in prods:
            cname = p.category_name or f"HWG_{p.category_id or 'Unknown'}"
            category_dist[cname] = category_dist.get(cname, 0) + 1

        return {
            "metadata": {
                "export_timestamp": datetime.now(timezone.utc).isoformat(),
                "source": "https://web.transgourmet.ch",
                "currency": "CHF",
                "total_products": len(prods),
                "total_promotions": len(promos),
                "total_brochures": len(flyers),
                "category_distribution": category_dist,
                "category_summary": category_dist,
            },
            "products": [p.model_dump() for p in prods],
            "promotions": [p.model_dump() for p in promos],
            "brochures": [b.model_dump() for b in flyers],
        }

    def export_json(
        self,
        target_path: Union[str, Path],
        products: Optional[List[ProductItem]] = None,
        promotions: Optional[List[ProductItem]] = None,
        brochures: Optional[List[PromotionBrochure]] = None,
    ) -> Path:
        """
        Export products, promotions, and brochures to a JSON file atomically.
        """
        safe_target = resolve_safe_export_path(target_path, base_dir=self.base_dir)
        payload = self.build_dataset_payload(products=products, promotions=promotions, brochures=brochures)
        atomic_write_json(payload, safe_target)
        return safe_target

    def export_csv(
        self,
        target_path: Union[str, Path],
        products: List[ProductItem],
    ) -> Path:
        """
        Export a list of ProductItem models to CSV format with formula injection defenses.
        """
        safe_target = resolve_safe_export_path(target_path, base_dir=self.base_dir)
        fieldnames = [
            "article_number",
            "title",
            "brand",
            "category_id",
            "category_name",
            "price_chf",
            "old_price_chf",
            "discount_percent",
            "unit_text",
            "is_action",
            "is_available",
        ]

        # Write to temporary file first for atomic safety
        temp_target = safe_target.parent / f"{safe_target.name}.tmp"
        try:
            with open(temp_target, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for prod in products:
                    row = {
                        "article_number": sanitize_csv_cell(prod.article_number),
                        "title": sanitize_csv_cell(prod.title),
                        "brand": sanitize_csv_cell(prod.brand or ""),
                        "category_id": sanitize_csv_cell(prod.category_id or ""),
                        "category_name": sanitize_csv_cell(prod.category_name or ""),
                        "price_chf": f"{prod.price_chf:.2f}",
                        "old_price_chf": f"{prod.old_price_chf:.2f}" if prod.old_price_chf is not None else "",
                        "discount_percent": f"{prod.discount_percent:.2f}" if prod.discount_percent is not None else "",
                        "unit_text": sanitize_csv_cell(prod.unit_text),
                        "is_action": "true" if prod.is_action else "false",
                        "is_available": "true" if prod.is_available else "false",
                    }
                    writer.writerow(row)
                f.flush()
            temp_target.replace(safe_target)
        except Exception:
            if temp_target.exists():
                temp_target.unlink()
            raise

        return safe_target

    def export_catalog(
        self,
        output_path: Union[str, Path] = "catalog_export.json",
        category_ids: Optional[List[int]] = None,
        max_pages_per_cat: int = 100,
        include_promotions: bool = True,
        include_brochures: bool = True,
    ) -> Path:
        """
        Scrape live categories, active promotions, and brochures, and export atomically to JSON.
        """
        cat_list = category_ids if category_ids is not None else [1, 5, 6, 7, 8]

        all_products: List[ProductItem] = []
        for hwg in cat_list:
            items = self.catalog_extractor.scrape_category(hwg_id=hwg, max_pages=max_pages_per_cat)
            all_products.extend(items)

        promotions: List[ProductItem] = []
        if include_promotions:
            promotions = self.promo_extractor.scrape_active_promotions(max_pages=max_pages_per_cat)

        flyers: List[PromotionBrochure] = []
        if include_brochures:
            flyers = self.promo_extractor.scrape_brochures()

        return self.export_json(
            target_path=output_path,
            products=all_products,
            promotions=promotions,
            brochures=flyers,
        )


BatchCatalogExporter = DatasetExporter
ExportService = DatasetExporter

__all__ = ["DatasetExporter", "BatchCatalogExporter", "ExportService"]
