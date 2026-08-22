"""
Tier 5 Code Integrity & Static Architecture Auditing Tests.
Verifies zero shell execution, no unsafe deserialization, exception hierarchy compliance, and security policy rules.
"""

from __future__ import annotations

import ast
from pathlib import Path
import pytest

SCRAPER_SRC_DIR = Path(__file__).resolve().parent.parent.parent / "scraper"


@pytest.mark.security
class TestCodeIntegrity:
    """Static AST & source auditing suite for security compliance."""

    def test_no_unsafe_shell_execution(self) -> None:
        """Verify zero occurrences of shell=True, os.system, eval, or exec across codebase."""
        if not SCRAPER_SRC_DIR.exists():
            pytest.skip("Source directory not yet initialized")

        py_files = list(SCRAPER_SRC_DIR.rglob("*.py"))
        for py_file in py_files:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))

            for node in ast.walk(tree):
                # Check for eval() and exec()
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    assert node.func.id not in ["eval", "exec"], f"Forbidden unsafe call {node.func.id}() in {py_file}"

                # Check for os.system
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    if node.func.attr == "system":
                        assert getattr(node.func.value, "id", None) != "os", f"Forbidden os.system() in {py_file}"

                # Check for subprocess shell=True
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    if getattr(node.func.value, "id", None) == "subprocess":
                        for kw in node.keywords:
                            if kw.arg == "shell" and getattr(kw.value, "value", None) is True:
                                pytest.fail(f"Forbidden subprocess with shell=True in {py_file}")

    def test_no_unsafe_deserialization(self) -> None:
        """Verify zero occurrences of pickle.loads, marshal, or shelve in codebase."""
        if not SCRAPER_SRC_DIR.exists():
            pytest.skip("Source directory not yet initialized")

        py_files = list(SCRAPER_SRC_DIR.rglob("*.py"))
        forbidden_modules = ["pickle", "marshal", "shelve", "_pickle"]
        
        for py_file in py_files:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))

            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        assert alias.name not in forbidden_modules, f"Forbidden unsafe deserializer import '{alias.name}' in {py_file}"
                elif isinstance(node, ast.ImportFrom):
                    assert node.module not in forbidden_modules, f"Forbidden unsafe deserializer import from '{node.module}' in {py_file}"

    def test_all_custom_exceptions_inherit_base(self) -> None:
        """Verify all custom exceptions in scraper.client.exceptions or scraper.exceptions inherit from TransgourmetScraperError."""
        try:
            from scraper.client import exceptions as exc_module
        except ImportError:
            try:
                import scraper.exceptions as exc_module  # type: ignore
            except ImportError:
                pytest.skip("Exception module not yet defined")

        base_class = getattr(exc_module, "TransgourmetScraperError", None)
        assert base_class is not None, "TransgourmetScraperError base class must exist"

        for attr_name in dir(exc_module):
            attr = getattr(exc_module, attr_name)
            if isinstance(attr, type) and issubclass(attr, Exception) and attr is not Exception and attr is not base_class:
                assert issubclass(attr, base_class), f"Exception {attr_name} must inherit from TransgourmetScraperError"
