# Original User Request

## Initial Request — 2026-08-22T05:41:51Z

The user requests that at least one agent is in charge of code reviews and security testing of the code.

Build an automated web scraper for Transgourmet Switzerland (https://www.transgourmet.ch) that extracts product data, pricing, unit packaging, and active weekly promotional discounts for use in automated catering meal planning.

Working directory: /home/fonti/Work/Byteforce/scraper
Integrity mode: development

Reference target: https://www.transgourmet.ch

## Requirements

### R1. Transgourmet Product & Pricing Scraper
Scrape product information (product title, category, pricing, unit/quantity per package, and availability) across core food categories on Transgourmet.ch.

### R2. Promotional Discounts & Weekly Offers Extractor
Extract active weekly promotions, special offers, and discount pricing from Transgourmet.ch (e.g. from `/de/aktionen-broschueren` and sortiment promotions).

### R3. On-Demand Search & Batch Catalog Export Interface
Provide two data access modes:
1. An on-demand search utility to lookup current prices and discounts for specific ingredients/queries.
2. A batch export script that compiles all scraped products and active discounts into structured, queryable JSON datasets.

### R4. Security Auditing & Adversarial Code Review
Incorporate dedicated security reviews and test coverage to verify:
1. Safe input sanitization and prevention of injection vulnerabilities when processing scraped text.
2. Rate-limiting, polite request intervals, exponential backoff, and robust error handling to prevent request bans or hung processes.
3. Safe local storage and handling of exported data.

## Acceptance Criteria

### Extraction & Query Verification
- [ ] Running the scraper against Transgourmet.ch extracts valid product names, prices (CHF), package units, and active promotional discounts into structured JSON output.
- [ ] The on-demand query interface successfully finds prices and discount status for common catering ingredients (e.g., meat, vegetables, dairy, pantry staples).
- [ ] Handles pagination, dynamic content, and network retries gracefully without unhandled exceptions or data corruption.

### Code Quality & Security Verification
- [ ] Passes automated code review with clean modular structure and clear documentation.
- [ ] Contains comprehensive automated tests (unit and integration tests with mocked/live fixtures) verifying parsers, error handling, and output schemas.
- [ ] Security audit passes with zero critical/high vulnerabilities (no unsafe shell execution, no unvalidated deserialization, robust rate limiting).
