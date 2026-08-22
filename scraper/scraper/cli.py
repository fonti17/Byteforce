"""
Command-Line Interface (CLI) for Transgourmet Switzerland Web Scraper.
Powered by Click and Rich for beautiful terminal output, parameter validation, and atomic dataset export.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Optional

import click
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

from scraper.client.session import TransgourmetSession, TransgourmetClient
from scraper.extractors.catalog import CatalogExtractor
from scraper.extractors.promotions import PromotionExtractor
from scraper.extractors.search import SearchExtractor, SearchService
from scraper.storage.export import DatasetExporter, BatchCatalogExporter
from scraper.security import (
    sanitize_search_query,
    validate_category_slug,
    validate_numeric_bound,
    resolve_safe_export_path,
    atomic_write_json,
    VALID_CATEGORY_SLUGS,
)
from scraper.exceptions import SecurityValidationError, InvalidParameterError, TransgourmetScraperError

console = Console()
console_err = Console(stderr=True)

CATEGORY_MAP = {
    "food": 1,
    "tabak": 2,
    "wein": 3,
    "spirituosen": 4,
    "getraenke": 5,
    "drinks": 5,
    "molkerei-backwaren": 6,
    "molkerei": 6,
    "fruechte-gemuese": 7,
    "gemuese": 7,
    "fruechte": 7,
    "produce": 7,
    "fleisch": 8,
    "meat": 8,
    "metzgerei": 8,
    "nonfood": 9,
    "non-food": 9,
    "nearfood": 10,
}


@click.group()
@click.version_option(version="1.0.0", prog_name="transgourmet-scraper")
def cli() -> None:
    """Transgourmet Switzerland Web Scraper & Intelligence CLI."""
    pass


main = cli


@cli.command("search")
@click.option("--query", "-q", required=True, help="Ingredient or product search query.")
@click.option("--category", "-c", default=None, help="Filter by category slug (e.g. fleisch, food, getraenke).")
@click.option("--limit", "-l", default=20, type=int, help="Maximum number of items to return (1..1000).")
@click.option("--export", "-o", default=None, help="Optional output JSON file path for search results.")
def search_command(
    query: str,
    category: Optional[str],
    limit: int,
    export: Optional[str],
) -> None:
    """Search catalog items and prices by keyword."""
    try:
        clean_query = sanitize_search_query(query)
        bounded_limit = int(validate_numeric_bound(limit, "limit", 1, 1000, require_int=True))

        hwg_id = None
        if category:
            valid_slug = validate_category_slug(category)
            hwg_id = CATEGORY_MAP.get(valid_slug)

        searcher = SearchExtractor()
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            progress.add_task(description=f"Searching for '{clean_query}'...", total=None)
            results = searcher.search(query=clean_query, hwg_id=hwg_id, limit=bounded_limit)

        if not results:
            console.print(f"[yellow]No articles found matching query: '{clean_query}'[/yellow]")
            return

        table = Table(title=f"Search Results for '{clean_query}' ({len(results)} items)")
        table.add_column("Art. #", style="cyan", no_wrap=True)
        table.add_column("Description", style="white")
        table.add_column("Brand", style="green")
        table.add_column("Price (CHF)", style="bold yellow", justify="right")
        table.add_column("Old Price", style="dim strike red", justify="right")
        table.add_column("Unit", style="magenta")
        table.add_column("Action", style="bold red", justify="center")

        for item in results:
            old_p_str = f"{item.old_price_chf:.2f}" if item.old_price_chf else "-"
            action_str = "✓" if item.is_action else ""
            table.add_row(
                item.article_number,
                item.title,
                item.brand or "-",
                f"{item.price_chf:.2f}",
                old_p_str,
                item.unit_text,
                action_str,
            )

        console.print(table)

        if export:
            safe_export_path = resolve_safe_export_path(export)
            data = [p.model_dump() for p in results]
            atomic_write_json(data, safe_export_path)
            console.print(f"[green]✓ Exported {len(results)} items to {safe_export_path}[/green]")

    except (SecurityValidationError, InvalidParameterError, ValueError) as e:
        console_err.print(f"[bold red]Validation Error:[/bold red] {e}")
        sys.exit(1)
    except Exception as e:
        console_err.print(f"[bold red]Search Error:[/bold red] {e}")
        sys.exit(1)


@cli.command("export")
@click.option("--output", "-o", default="catalog_export.json", help="Output JSON file path.")
@click.option("--categories", "-c", default="1,5,6,7,8", help="Comma-separated category IDs or slugs.")
@click.option("--max-pages", "-p", default=50, type=int, help="Maximum pages per category (1..500).")
@click.option("--limit-per-category", default=None, type=int, help="Alias for maximum pages per category.")
def export_command(
    output: str,
    categories: str,
    max_pages: int,
    limit_per_category: Optional[int],
) -> None:
    """Export complete product catalog and promotions to a structured JSON dataset."""
    try:
        safe_export_path = resolve_safe_export_path(output)
        effective_pages = limit_per_category if limit_per_category is not None else max_pages
        bounded_pages = int(validate_numeric_bound(effective_pages, "max_pages", 1, 500, require_int=True))

        category_ids: List[int] = []
        for cat_token in categories.split(","):
            token = cat_token.strip()
            if not token:
                continue
            if token.isdigit():
                hwg = int(token)
                validate_numeric_bound(hwg, "category_id", 1, 50, require_int=True)
                category_ids.append(hwg)
            else:
                valid_slug = validate_category_slug(token)
                if valid_slug in CATEGORY_MAP:
                    category_ids.append(CATEGORY_MAP[valid_slug])
                else:
                    raise InvalidParameterError(f"Unknown category slug: '{token}'")

        if not category_ids:
            category_ids = [1, 5, 6, 7, 8]

        exporter = DatasetExporter()
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            progress.add_task(description="Compiling catalog export dataset...", total=None)
            exported_path = exporter.export_catalog(
                output_path=safe_export_path,
                category_ids=category_ids,
                max_pages_per_cat=bounded_pages,
            )

        console.print(f"[bold green]✓ Catalog successfully exported to {exported_path}[/bold green]")

    except (SecurityValidationError, InvalidParameterError, ValueError) as e:
        console_err.print(f"[bold red]Validation Error:[/bold red] {e}")
        sys.exit(1)
    except Exception as e:
        console_err.print(f"[bold red]Export Error:[/bold red] {e}")
        sys.exit(1)


cli.add_command(export_command, name="export-catalog")


@cli.command("promotions")
@click.option("--limit", "-l", default=50, type=int, help="Maximum promotions to display.")
@click.option("--export", "-o", default=None, help="Optional output JSON path.")
def promotions_command(limit: int, export: Optional[str]) -> None:
    """Display active sortiment promotional discounts and brochures."""
    try:
        bounded_limit = int(validate_numeric_bound(limit, "limit", 1, 1000, require_int=True))
        promo_extractor = PromotionExtractor()

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            progress.add_task(description="Fetching active weekly promotions & brochures...", total=None)
            promos = promo_extractor.scrape_active_promotions(max_pages=10)
            brochures = promo_extractor.scrape_brochures()

        console.print(f"[bold green]Found {len(promos)} active discounts and {len(brochures)} promotional brochures.[/bold green]\n")

        if brochures:
            b_table = Table(title=f"Weekly Promotional Brochures & Flyers ({len(brochures)})")
            b_table.add_column("Title", style="cyan")
            b_table.add_column("KW", style="magenta", justify="center")
            b_table.add_column("Validity", style="yellow")
            b_table.add_column("PDF URL", style="white")

            for b in brochures[:10]:
                val_str = ""
                if b.valid_from and b.valid_to:
                    val_str = f"{b.valid_from.strftime('%d.%m')} - {b.valid_to.strftime('%d.%m.%Y')}"
                b_table.add_row(
                    b.title,
                    str(b.calendar_week or "-"),
                    val_str or "Aktuell",
                    b.pdf_url,
                )
            console.print(b_table)
            console.print()

        if promos:
            p_table = Table(title=f"Active Promotions & Discounts (Showing {min(len(promos), bounded_limit)})")
            p_table.add_column("SKU", style="cyan")
            p_table.add_column("Description", style="white")
            p_table.add_column("Action Price (CHF)", style="bold green", justify="right")
            p_table.add_column("Old Price", style="dim strike red", justify="right")
            p_table.add_column("Discount %", style="bold red", justify="right")
            p_table.add_column("Unit", style="magenta")

            for item in promos[:bounded_limit]:
                disc_str = f"-{item.discount_percent:.1f}%" if item.discount_percent else "-"
                old_p_str = f"{item.old_price_chf:.2f}" if item.old_price_chf else "-"
                p_table.add_row(
                    item.article_number,
                    item.title,
                    f"{item.price_chf:.2f}",
                    old_p_str,
                    disc_str,
                    item.unit_text,
                )
            console.print(p_table)

        if export:
            safe_export_path = resolve_safe_export_path(export)
            data = {
                "brochures": [b.model_dump() for b in brochures],
                "promotions": [p.model_dump() for p in promos],
            }
            atomic_write_json(data, safe_export_path)
            console.print(f"[green]✓ Exported promotional data to {safe_export_path}[/green]")

    except Exception as e:
        console_err.print(f"[bold red]Promotions Error:[/bold red] {e}")
        sys.exit(1)


@cli.command("brochures")
@click.option("--download-all", "-d", is_flag=True, default=False, help="Download all promotional PDF files.")
@click.option("--output-dir", default="./brochures", help="Target directory for downloaded PDF files.")
def brochures_command(download_all: bool, output_dir: str) -> None:
    """List and optionally download promotional PDF brochures."""
    try:
        promo_extractor = PromotionExtractor()
        brochures = promo_extractor.scrape_brochures()

        table = Table(title=f"Promotional Brochures ({len(brochures)})")
        table.add_column("Title", style="cyan")
        table.add_column("KW", style="magenta", justify="center")
        table.add_column("PDF URL", style="white")

        for b in brochures:
            table.add_row(b.title, str(b.calendar_week or "-"), b.pdf_url)

        console.print(table)

        if download_all:
            out_dir_path = resolve_safe_export_path(output_dir)
            out_dir_path.mkdir(parents=True, exist_ok=True)
            
            client = TransgourmetClient()
            console.print(f"\n[cyan]Downloading {len(brochures)} PDF brochures to {out_dir_path}...[/cyan]")
            for b in brochures:
                filename = b.pdf_url.split("/")[-1]
                pdf_target = out_dir_path / filename
                content = client.download_brochure_pdf(b.pdf_url)
                pdf_target.write_bytes(content)
                console.print(f"[green]✓ Saved {filename}[/green]")

    except Exception as e:
        console_err.print(f"[bold red]Brochures Error:[/bold red] {e}")
        sys.exit(1)


if __name__ == "__main__":
    cli()
