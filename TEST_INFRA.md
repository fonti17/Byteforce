# E2E Test Infra: Transgourmet Switzerland Web Scraper

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on private implementation internals.
- Systematic 5-tier methodology: Category-Partition + Boundary Value Analysis + Pairwise Interaction + Real-World Catering Workload + Adversarial Security Hardening.

## Feature Inventory & Test Coverage Mapping
| # | Feature | Requirement Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross) | Tier 4 (Scenario) | Tier 5 (Adversarial) |
|---|---------|-------------------|:----------------:|:-----------------:|:--------------:|:-----------------:|:--------------------:|
| F1 | HTTP Client & Session | R4 & Architecture | 5 | 5 | ✓ | ✓ | ✓ |
| F2 | Data Models & CHF Validation | R1, R2, R3 | 5 | 5 | ✓ | ✓ | ✓ |
| F3 | Category & Catalog Scraper | R1 | 5 | 5 | ✓ | ✓ | ✓ |
| F4 | Real-Time CHF Pricing & Stock | R1 | 5 | 5 | ✓ | ✓ | ✓ |
| F5 | Live Sortiment Promotions | R2 | 5 | 5 | ✓ | ✓ | ✓ |
| F6 | Weekly Brochures & Flyers | R2 | 5 | 5 | ✓ | ✓ | ✓ |
| F7 | On-Demand Search CLI | R3 | 5 | 5 | ✓ | ✓ | ✓ |
| F8 | Batch Catalog JSON Export | R3 | 5 | 5 | ✓ | ✓ | ✓ |
| F9 | Security & Injection Defense | R4 & Mandate | 5 | 5 | ✓ | ✓ | ✓ (10 cases) |
| F10| Resilience & Error Recovery | R4 | 5 | 5 | ✓ | ✓ | ✓ |

## Test Architecture
- Test Runner: `pytest`
- Invocation: `pytest -v scraper/tests/`
- Pass/Fail Semantics: 100% tests passing, zero unhandled errors, 0 security warnings.
- Test Mocking & Fixtures: `scraper/tests/conftest.py` provides offline fixtures for Transgourmet REST JSON responses and brochure HTML pages, with optional live network flags (`--run-live`).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| S1 | Institutional Meal Plan Batch Export | F3, F4, F8, F9 | Export full 5 food categories to `catalog_export.json`, verify all CHF prices, stock flags, and packaging units are valid |
| S2 | Weekly Promotional Meal Optimization | F5, F6, F7 | Query all active action items, identify discounts > 20%, map against weekly promotional flyer PDF links |
| S3 | Allergy & Dietary Search Querying | F7, F2, F9 | Search multi-keyword queries (e.g. `laktosefrei butter`, `bio rinds-voressen`), verify schema normalization and clean output |
| S4 | Network Failure & 429 Throttle Recovery | F1, F10 | Simulate network hiccups, 429 Too Many Requests, 503 Service Unavailable with `Retry-After`; verify automatic recovery without data loss |
| S5 | Atomic Crash Defense & Path Traversal Injection | F8, F9 | Attempt path traversal export paths (`../../etc/passwd`), invalid filenames, and write interruptions; verify target directory remains safe and intact |

## Coverage Thresholds
- Tier 1: ≥50 unit/feature test cases (≥5 per feature across 10 features)
- Tier 2: ≥50 boundary/corner cases (negative inputs, edge pagination, missing fields, malformed responses)
- Tier 3: ≥10 cross-feature combinatorial test cases
- Tier 4: ≥5 realistic catering & meal planning application scenarios
- Tier 5: 10 dedicated adversarial security penetration test cases (TC-SEC-01 to TC-SEC-10)
- **Total Minimum Target: >120 test cases**
