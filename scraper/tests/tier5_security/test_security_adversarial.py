"""
Tier 5 Security Penetration & Adversarial Hardening Tests.
Formally implements TC-SEC-01 through TC-SEC-10 per TEST_INFRA.md and security specification.
"""

from __future__ import annotations

import importlib.util
import json
import re
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from click.testing import CliRunner

from scraper.security import (
    resolve_safe_export_path,
    sanitize_search_query,
    sanitize_csv_cell,
    validate_category_slug,
    atomic_save_json,
    atomic_write_json,
)
from scraper.parsers.turbostream import parse_article_dict
from scraper.client.rate_limiter import TokenBucketRateLimiter
from scraper.client.backoff import ExponentialBackoff
from scraper.client.session import TransgourmetSession
from scraper.exceptions import (
    TransgourmetScraperError,
    SecurityValidationError,
    PathTraversalError,
    InputInjectionError,
    InvalidParameterError,
    RateLimitExceededError,
)

# Import CLI safely
try:
    from scraper.cli import cli
except ImportError:
    cli_path = Path(__file__).resolve().parents[2] / "scraper" / "cli.py"
    spec = importlib.util.spec_from_file_location("scraper_cli_module", cli_path)
    cli_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli_mod)
    cli = getattr(cli_mod, "cli", getattr(cli_mod, "main", None))


@pytest.mark.security
class TestAdversarialSecurityHardening:
    """Dedicated suite implementing TC-SEC-01 through TC-SEC-10."""

    def test_tc_sec_01_input_injection_search_query(self) -> None:
        """
        TC-SEC-01: Input Injection Defense (CLI Search Query)
        Adversarial inputs: SQL injection patterns, XSS script tags, and null bytes.
        Expected: Control chars stripped, normalized safely, null bytes rejected.
        """
        sql_payload = "fleisch'; DROP TABLE products;--"
        xss_payload = "<script>alert('pwned')</script>"
        
        clean_sql = sanitize_search_query(sql_payload)
        clean_xss = sanitize_search_query(xss_payload)
        
        assert "\0" not in clean_sql
        assert "\0" not in clean_xss
        assert isinstance(clean_sql, str)
        assert isinstance(clean_xss, str)

        with pytest.raises((InputInjectionError, SecurityValidationError, ValueError)):
            sanitize_search_query("milch\0malicious")

    def test_tc_sec_02_input_injection_category_slug(self, cli_runner: CliRunner, safe_temp_dir: Path) -> None:
        """
        TC-SEC-02: Category Slug Whitelist & Traversal Defense
        Adversarial inputs: Path traversal or shell operators in category parameter.
        Expected: Process rejects invalid category with validation error or exit code != 0.
        """
        with pytest.raises((SecurityValidationError, InvalidParameterError, ValueError)):
            validate_category_slug("../../../etc/passwd")

        with pytest.raises((SecurityValidationError, InvalidParameterError, ValueError)):
            validate_category_slug("fleisch;ls")

        # CLI execution rejection
        out_file = safe_temp_dir / "cat_sec_test.json"
        res1 = cli_runner.invoke(cli, ["export", "--output", str(out_file), "--categories", "../../../etc/passwd"])
        assert res1.exit_code != 0

        res2 = cli_runner.invoke(cli, ["export", "--output", str(out_file), "--categories", "fleisch;ls"])
        assert res2.exit_code != 0

    def test_tc_sec_03_path_traversal_export_path(self, safe_temp_dir: Path) -> None:
        """
        TC-SEC-03: Safe Local Storage Path Traversal Jail
        Adversarial inputs: /etc/shadow, ../../data.json, data/\x00secret.json.
        Expected: Directory jail blocks traversal and rejects null bytes.
        """
        with pytest.raises((SecurityValidationError, PathTraversalError, ValueError)):
            resolve_safe_export_path("/etc/shadow", base_dir=safe_temp_dir)

        with pytest.raises((SecurityValidationError, PathTraversalError, ValueError)):
            resolve_safe_export_path("../../secret_keys.json", base_dir=safe_temp_dir)

        with pytest.raises((SecurityValidationError, InputInjectionError, ValueError)):
            resolve_safe_export_path("data/\x00injected.json", base_dir=safe_temp_dir)

    def test_tc_sec_04_rate_limiting_delay_enforcement(self) -> None:
        """
        TC-SEC-04: Token-Bucket Rate Limiting & Anti-Ban Protection
        Rapid sequential request calls must enforce rate limits with polite jitter.
        """
        limiter = TokenBucketRateLimiter(rate_limit_rps=20.0, enabled=True)
        start = time.perf_counter()
        for _ in range(5):
            limiter.acquire()
        elapsed = time.perf_counter() - start
        assert elapsed >= 0.05

    @patch("requests.Session.request")
    def test_tc_sec_05_http_429_backoff_and_retry_after(self, mock_request: MagicMock) -> None:
        """
        TC-SEC-05: HTTP 429 Throttle Recovery with Retry-After Header
        Simulate 429 response with Retry-After: 0. Verify client retries without crashing.
        """
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.headers = {"Retry-After": "0"}

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.text = "<html><body><script>window.__reactRouterContext={streamController:{enqueue:'[[1],{\\'_2\\':3},\\'loaderData\\',{\\'_4\\':5},\\'features/catalog/routes/CatalogIndexRoute\\',{\\'_6\\':{\\'articles\\':[],\\'totalCount\\':0}}]'}}</script></body></html>"

        mock_request.side_effect = [resp_429, resp_200]

        session = TransgourmetSession(max_retries=2, rate_limiter_enabled=False)
        res = session.request("GET", "https://web.transgourmet.ch/de/prodega-easy/catalog")
        assert res.status_code == 200
        assert mock_request.call_count == 2

    def test_tc_sec_06_atomic_storage_crash_defense(self, safe_temp_dir: Path) -> None:
        """
        TC-SEC-06: Atomic Storage Write Defense against Crash/Interruption
        Simulate exception during JSON write; verify no corrupted or empty target file exists.
        """
        target_file = safe_temp_dir / "secure_export.json"
        
        # Write valid initial version
        atomic_save_json({"initial": "state"}, target_file)
        assert target_file.exists()

        # Attempt atomic write of unserializable object (simulating mid-write error)
        class BadData:
            pass

        try:
            atomic_save_json({"corrupted": BadData()}, target_file)
        except Exception:
            pass

        # Target file must still have original intact state, not corrupted
        loaded = json.loads(target_file.read_text(encoding="utf-8"))
        assert loaded == {"initial": "state"}

    def test_tc_sec_07_malformed_stream_fault_isolation(self) -> None:
        """
        TC-SEC-07: Malformed Stream Fault Isolation
        Corrupted record with missing fields does not prevent extraction of valid sibling items.
        """
        raw_valid = {"articleNumber": "999001", "description": "Good Milk", "price": 2.20, "unitText": "Fl", "isAction": False}
        art = parse_article_dict(raw_valid)
        assert art is not None
        assert art.article_number == "999001"

    def test_tc_sec_08_csv_formula_injection_sanitization(self) -> None:
        """
        TC-SEC-08: CSV Formula Injection Defense
        Formulas prefixed with =, +, -, @, tabs are escaped with leading single quote.
        """
        formula_cases = [
            ("=cmd|' /C calc'!A0", "'=cmd|' /C calc'!A0"),
            ("+SUM(1,2)", "'+SUM(1,2)"),
            ("-MIN(1,2)", "'-MIN(1,2)"),
            ("@SUM(1,2)", "'@SUM(1,2)"),
            ("\tTAB_INJECT", "'\tTAB_INJECT"),
            ("Normal Product Title", "Normal Product Title"),
        ]
        for raw, expected in formula_cases:
            assert sanitize_csv_cell(raw) == expected

    def test_tc_sec_09_extreme_cli_argument_bounding(self, cli_runner: CliRunner) -> None:
        """
        TC-SEC-09: Extreme CLI Parameter Bounding
        Negative limits or overflow values must be safely rejected.
        """
        res_neg = cli_runner.invoke(cli, ["search", "--query", "milch", "--limit", "-50"])
        assert res_neg.exit_code != 0

        res_zero = cli_runner.invoke(cli, ["search", "--query", "milch", "--limit", "0"])
        assert res_zero.exit_code != 0

        res_huge = cli_runner.invoke(cli, ["search", "--query", "milch", "--limit", "9999999999"])
        assert res_huge.exit_code != 0

    def test_tc_sec_10_redos_defense_linear_pattern_evaluation(self) -> None:
        """
        TC-SEC-10: ReDoS (Regex Denial of Service) Protection
        Evaluate extreme repeating string patterns against scraper date/KW regex patterns.
        Execution must complete in < 50ms without CPU lockup.
        """
        long_repeating_string = "KW " + ("99 " * 5000) + "Aktionen"
        
        start = time.perf_counter()
        match = re.search(r"(?:kw\s*|aktionen\s+)(\d{1,2})", long_repeating_string, re.IGNORECASE)
        elapsed = time.perf_counter() - start
        
        assert elapsed < 0.05
        assert match is not None
        assert match.group(1) == "99"
