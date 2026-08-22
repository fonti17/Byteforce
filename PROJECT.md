# Project: Transgourmet Switzerland Web Scraper & Intelligence Toolkit

## Architecture Overview
The Transgourmet Switzerland Web Scraper is an industrial-grade, secure, and resilient data extraction pipeline built in Python. It interfaces directly with Transgourmet Switzerland's public catalog resources (`web.transgourmet.ch/de/prodega-easy/resources/articles/*`) and promotional CMS portals (`www.transgourmet.ch/de/aktionen-broschueren`).

```
                              [ CLI / Python API ]
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  [ SearchService ]            [ CatalogScraper ]             [ PromoExtractor ]
        │                              │                              │
        └──────────────────────────────┼──────────────────────────────┘
                                       ▼
                       [ TransgourmetClient / HTTP Engine ]
                         - Cookie Handshake Session
                         - Token-Bucket Rate Limiter & Jitter
                         - Exponential Backoff & Retry
                         - User-Agent Rotation
                                       │
                                       ▼
                        [ Storage & Security Layer ]
                         - Canonical Path Jail (No Traversal)
                         - Atomic Write Protocol (.tmp + fsync)
                         - Strict Pydantic Data Models (CHF)
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Resilient HTTP Client | Cookie handshake, session management, token-bucket rate limiter (0.5s baseline + 0.2–0.8s jitter), exponential backoff on 429/5xx, UA rotation | M1 | Survey & Security |
| F2 | Strongly-Typed Data Models | Pydantic v2 / Dataclass models for Article, Price (CHF), Promotion, Packaging, Availability, Category, Brochure | M1 | Schema Mining |
| F3 | Category & Catalog Scraper | Paginated extraction across all Hauptwarengruppen (HWG 1 Food, 5 Drinks, 6 Dairy/Bakery, 7 Fruits/Veg, 8 Meat/Fish) | M2 | R1 Requirements |
| F4 | Real-Time CHF Pricing & Stock | Extraction of list price, action price, comparison price per unit, packaging units (kg, St, Lt, Kt), and stock availability | M2 | R1 Requirements |
| F5 | Live Sortiment Promotions | Extraction of real-time promotional discounts with discount percentages, validFrom/validTo timestamps | M3 | R2 Requirements |
| F6 | Weekly Promotional Brochures | Parsing of `/de/aktionen-broschueren` HTML, brochure metadata, validity periods, static PDF links, and PDF content parsing | M3 | R2 Requirements |
| F7 | On-Demand Ingredient Search | CLI and programmatic search utility with keyword querying, category filtering, and rich formatted terminal output | M4 | R3 Requirements |
| F8 | Batch Catalog JSON Export | Fast batch dataset exporter with atomic writing, path jail enforcement, and progress tracking | M4 | R3 Requirements |
| F9 | Security & Injection Defenses | Input sanitization, regex query validation, CSV formula neutralizing, path traversal prevention, zero shell execution | M5 | R4 & Security Mandate |
| F10| E2E Verification & Hardening | Full 5-tier test suite covering 100% features, boundaries, cross-feature flows, catering scenarios, and adversarial cases | M6 | Quality Standards |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Engine, Client & Models | Data models, TransgourmetClient with cookie session, token-bucket rate limiting, jitter, backoff, and error hierarchy | none | PLANNED |
| M2 | Product & Pricing Scraper (R1) | `CatalogScraper` extracting product metadata, CHF pricing, packaging units, and availability across categories | M1 | PLANNED |
| M3 | Promotions & Weekly Offers (R2) | `PromoExtractor` extracting active sortiment discounts and weekly brochure flyers + PDF links | M1 | PLANNED |
| M4 | Search CLI & Batch Export (R3) | CLI interface (`python -m scraper.cli`), on-demand search, and atomic batch JSON dataset export | M1, M2, M3 | PLANNED |
| M5 | Security Auditing & Hardening (R4)| Input sanitizers, path traversal jail, atomic write protocol, adversarial security test suite (TC-SEC-01 to 10), dedicated audit | M1, M2, M3, M4 | PLANNED |
| M6 | Full E2E Test Pass & Hardening | 100% pass of E2E test suite (Tiers 1-4) + Tier 5 adversarial coverage hardening | M1-M5 | PLANNED |

## Interface Contracts

### `TransgourmetClient` ↔ Scrapers
```python
class TransgourmetClient:
    def __init__(self, base_url: str = "https://web.transgourmet.ch", rate_limit_rps: float = 2.0, timeout: float = 15.0): ...
    def get_articles_search(self, search_term: str = "", page: int = 0, page_size: int = 100, hwg_id: int | None = None, is_action: bool = False) -> dict: ...
    def get_article_detail(self, article_number: str) -> dict: ...
    def get_brochures_html(self) -> str: ...
    def download_brochure_pdf(self, pdf_url: str) -> bytes: ...
```

### Data Models (`scraper.models`)
```python
class PriceInfo(BaseModel):
    price_chf: float
    old_price_chf: float | None = None
    is_discounted: bool = False
    discount_percent: float | None = None
    unit_text: str  # e.g., "kg", "Fl", "St", "Kt"
    price_per_sell_unit: float | None = None
    sell_unit: str | None = None

class ProductRecord(BaseModel):
    article_number: str
    title: str
    brand: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    price_info: PriceInfo
    package_quantity: str | None = None
    is_available: bool = True
    origin: list[str] = Field(default_factory=list)
    eco_score: str | None = None
    action_valid_from: datetime | None = None
    action_valid_to: datetime | None = None

class BrochureRecord(BaseModel):
    title: str
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    pdf_url: str
    thumbnail_url: str | None = None
    brochure_type: str | None = None
```

### Storage & Security API (`scraper.security`)
```python
def sanitize_search_query(query: str) -> str: ...
def resolve_safe_export_path(output_path: str, base_dir: Path | None = None) -> Path: ...
def atomic_write_json(data: Any, target_path: Path) -> None: ...
```

## Code Layout
```
scraper/
├── pyproject.toml              # Dependencies & build configuration
├── requirements.txt            # Locked requirements (httpx, pydantic, beautifulsoup4, pypdf, rich, pytest)
├── README.md                   # Full documentation, CLI usage, and architecture guide
├── scraper/
│   ├── __init__.py             # Package exports
│   ├── __main__.py            # CLI entry point
│   ├── cli.py                  # Rich-enabled CLI commands (search, export, promo, brochures)
│   ├── client.py               # Resilient Transgourmet HTTP Client & Rate Limiter
│   ├── models.py               # Pydantic data schemas
│   ├── catalog.py              # Product & Pricing Extractor (R1)
│   ├── promotions.py           # Weekly Offers & Brochure Extractor (R2)
│   ├── search.py               # On-demand search service (R3)
│   ├── exporter.py             # Batch catalog exporter (R3)
│   ├── security.py             # Sanitization, path jailing, atomic write protocol (R4)
│   └── exceptions.py           # Typed exception hierarchy
└── tests/
    ├── conftest.py             # Mock fixtures & test clients
    ├── test_client.py          # HTTP Client, backoff & rate-limiter tests
    ├── test_models.py          # Data validation tests
    ├── test_catalog.py         # Product & Pricing extraction tests (R1)
    ├── test_promotions.py      # Promotions & brochure extraction tests (R2)
    ├── test_search_export.py   # Search CLI & Batch export tests (R3)
    ├── test_security.py        # Adversarial security test suite (R4, TC-SEC-01 to 10)
    └── test_e2e.py             # Comprehensive E2E catering scenarios
```
