# Transgourmet Switzerland Web Scraper & Intelligence Toolkit

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Pydantic v2](https://img.shields.io/badge/pydantic-v2.7+-green.svg)](https://docs.pydantic.dev/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()

An industrial-grade, secure, and resilient data extraction pipeline and on-demand search utility for **Transgourmet Switzerland** (`web.transgourmet.ch` and `www.transgourmet.ch`), tailored for automated catering meal planning, institutional kitchen budgeting, and weekly promotional discount optimization.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Core Features](#core-features)
3. [Installation & Setup](#installation--setup)
4. [Command-Line Interface (CLI)](#command-line-interface-cli)
   - [1. On-Demand Ingredient Search](#1-on-demand-ingredient-search)
   - [2. Batch Catalog Export](#2-batch-catalog-export)
   - [3. Live Promotions & Weekly Offers](#3-live-promotions--weekly-offers)
   - [4. Weekly Promotional Brochures & PDF Downloader](#4-weekly-promotional-brochures--pdf-downloader)
5. [Programmatic Python API](#programmatic-python-api)
   - [Searching Products](#searching-products)
   - [Scraping Catalog Categories](#scraping-catalog-categories)
   - [Extracting Active Promotions & Brochures](#extracting-active-promotions--brochures)
   - [Batch Catalog Export](#batch-catalog-export-1)
6. [Security & Defensive Architecture](#security--defensive-architecture)
7. [Test Architecture & Verification](#test-architecture--verification)

---

## Architecture Overview

```
                               [ CLI / Python API ]
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         ▼                              ▼                              ▼
   [ SearchService ]            [ CatalogScraper ]             [ PromoExtractor ]
         │                              │                              │
         └──────────────────────────────┼──────────────────────────────┘
                                        ▼
                        [ TransgourmetSession / HTTP Client ]
                          - Session Handshake & Cookie Jar
                          - Token-Bucket Rate Limiter & Jitter (0.2–0.8s)
                          - Exponential Backoff & Retry-After Parser
                          - Modern User-Agent Rotation
                                        │
                                        ▼
                         [ Storage & Security Layer ]
                          - Canonical Path Jail (resolve_safe_export_path)
                          - Atomic Write Protocol (.tmp + fsync + replace)
                          - Strict Pydantic v2 Models (CHF Currency)
```

---

## Core Features

- **R1: Product & Pricing Scraper**:
  - Full catalog extraction across Swiss Hauptwarengruppen (HWG 1 Food, 5 Drinks, 6 Dairy/Bakery, 7 Fruits/Veg, 8 Meat/Fish).
  - Strict Swiss Franc (CHF) pricing model separating regular base prices, action discount prices, and discount percentages.
  - Wholesale packaging unit normalization (`kg`, `Fl`, `St`, `Kt`, `Bx`, `Pa`, `Tp`, `Bt`, `Ds`).
  - Stock availability and liquidation/auslauf tracking.

- **R2: Promotional Discounts & Weekly Offers**:
  - Live sortiment promotional discount filtering (`?a=true`).
  - Automated extraction of weekly brochure flyers from `www.transgourmet.ch/de/aktionen-broschueren`.
  - Static PDF document discovery and binary downloading.

- **R3: On-Demand Search & Batch Dataset Export**:
  - Interactive terminal search with rich formatted tables and live spinners.
  - Multi-threaded batch JSON dataset export with metadata summaries and category item breakdowns.

- **R4: Security Auditing & Defensive Hardening**:
  - Safe input sanitization neutralizing control characters, null bytes, and script tags.
  - Canonical path traversal directory jail preventing jailbreak outside designated export directories.
  - Atomic JSON file replacement via `.tmp` staging and filesystem `fsync()` synchronization.
  - CSV formula injection protection escaping leading `=`, `+`, `-`, `@`, `\t`, `\r` trigger tokens.
  - Token-bucket rate limiting with randomized jitter preventing Cloudflare/WAF bans.

---

## Installation & Setup

### Requirements
- Python 3.10 or higher
- `pip` or virtual environment manager

### Setup Virtual Environment
```bash
cd scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Command-Line Interface (CLI)

The CLI tool is accessible either via `python -m scraper` or the `transgourmet-scraper` command.

### 1. On-Demand Ingredient Search
Search for staple ingredients, brands, or article SKUs:
```bash
# Basic keyword search
python -m scraper search --query "milch"

# Filter by category and limit results
python -m scraper search --query "butter" --category "molkerei-backwaren" --limit 10

# Search and export results directly to a JSON file
python -m scraper search --query "rindfleisch" --category "fleisch" --export "data/beef_results.json"
```

### 2. Batch Catalog Export
Export entire commodity group categories to structured JSON:
```bash
# Export core food categories (HWG 1, 5, 6, 7, 8)
python -m scraper export --output "data/transgourmet_catalog.json" --max-pages 20

# Export specific categories by slug
python -m scraper export --categories "fleisch,fruechte-gemuese" --output "data/fresh_catalog.json"
```

### 3. Live Promotions & Weekly Offers
View active discounted products and promotional brochures:
```bash
# Display top active promotions
python -m scraper promotions --limit 25

# Export promotions and brochures
python -m scraper promotions --export "data/weekly_promotions.json"
```

### 4. Weekly Promotional Brochures & PDF Downloader
Browse and download weekly promotional flyers:
```bash
# List all active weekly brochures
python -m scraper brochures

# Download all PDF flyers to local folder
python -m scraper brochures --download-all --output-dir "data/brochures"
```

---

## Programmatic Python API

### Searching Products
```python
from scraper import SearchService

searcher = SearchService()

# Search articles
articles = searcher.search_articles(query="Gruyère", limit=10)
for art in articles:
    print(f"SKU: {art.article_number} | {art.title} | CHF {art.price_chf:.2f} ({art.unit_text})")

# Direct SKU lookup
product = searcher.lookup_article("817441")
if product:
    print(f"Found: {product.title} - Price: CHF {product.price_chf:.2f}")
```

### Scraping Catalog Categories
```python
from scraper import CatalogScraper

catalog = CatalogScraper()

# Scrape HWG 8 (Metzgerei / Meat)
meat_products = catalog.scrape_category(hwg_id=8, max_pages=5)
print(f"Scraped {len(meat_products)} meat products.")

# Scrape all core categories
all_data = catalog.scrape_all_categories(category_ids=[1, 5, 6, 7, 8], max_pages_per_cat=2)
```

### Extracting Active Promotions & Brochures
```python
from scraper import PromoExtractor

promo = PromoExtractor()

# Active store discounts
promotions = promo.scrape_active_promotions(max_pages=2)
for item in promotions:
    print(f"{item.title}: Action CHF {item.price_chf:.2f} (Base: CHF {item.old_price_chf:.2f}, -{item.discount_percent:.1f}%)")

# Weekly brochures
brochures = promo.scrape_brochures()
for b in brochures:
    print(f"KW {b.calendar_week}: {b.title} -> {b.pdf_url}")
```

### Batch Catalog Export
```python
from scraper import ExportService

exporter = ExportService()
export_file = exporter.export_catalog(
    output_path="exports/catalog_complete.json",
    category_ids=[1, 6, 7, 8],
    max_pages_per_cat=10,
)
print(f"Dataset saved to: {export_file}")
```

---

## Security & Defensive Architecture

| Threat / Requirement | Defensive Implementation | Module | Test Reference |
|---|---|---|---|
| **SQL / XSS Injection** | `sanitize_search_query`: Control character scrubbing, Unicode NFC normalization, 128-char ceiling | `scraper.security` | `TC-SEC-01` |
| **Category Slug Traversal** | `validate_category_slug`: Whitelist verification, regex check `^[a-z0-9\-_]{1,64}$`, slash rejection | `scraper.security` | `TC-SEC-02` |
| **Path Traversal Jail** | `resolve_safe_export_path`: Canonical path resolution, directory jail enforcement, null byte check | `scraper.security` | `TC-SEC-03` |
| **Rate Limiting & Ban Prevention** | `TokenBucketRateLimiter`: 0.5s baseline delay + 0.2–0.8s randomized jitter | `scraper.client.rate_limiter` | `TC-SEC-04` |
| **429 / 5xx Exponential Backoff** | `ExponentialBackoff`: Exponential backoff + `Retry-After` HTTP header parsing | `scraper.client.backoff` | `TC-SEC-05` |
| **Atomic File Corruption Defense** | `atomic_write_json`: Temp file staging (`.tmp.<uuid>`), filesystem `fsync()`, atomic `os.replace` | `scraper.security` | `TC-SEC-06` |
| **Fault Isolation in Streams** | `parse_articles_from_html`: Per-record exception isolation ensuring sibling records are extracted | `scraper.parsers.turbostream` | `TC-SEC-07` |
| **CSV Formula Injection** | `sanitize_csv_cell`: Escapes dangerous trigger prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) | `scraper.security` | `TC-SEC-08` |
| **CLI Parameter Bounding** | `validate_numeric_bound`: Strict integer/range bounds on limits, delays, and pages | `scraper.security` | `TC-SEC-09` |
| **ReDoS Denial of Service** | Linear parsing regex without exponential backtracking | `scraper.parsers.brochures` | `TC-SEC-10` |

---

## Test Architecture & Verification

The test suite contains **100+ comprehensive automated tests** across 5 distinct tiers:
- **Tier 1 (Unit)**: Data models, turbo-stream decoder, brochure HTML parser, client session, storage jail.
- **Tier 2 (Boundary)**: Empty results, rate limiter boundaries, malformed streams, pagination out-of-bounds.
- **Tier 3 (Integration)**: Catalog extractor, promotion extractor, on-demand search.
- **Tier 4 (Application)**: Click/Rich CLI workflows, institutional catering scenarios (S1-S5).
- **Tier 5 (Security)**: Adversarial security penetration suite (`TC-SEC-01` to `TC-SEC-10`).

### Running Tests
```bash
# Run complete test suite offline (deterministic fixtures)
pytest -v

# Run with coverage report
pytest --cov=scraper tests/

# Run live integration tests against public endpoints
pytest -v --run-live
```
