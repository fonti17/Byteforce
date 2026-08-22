"""
Tier 1 Unit Tests: Storage Jail, Canonical Path Resolution & Atomic Writes.
Tests path traversal prevention, directory jailing, atomic write protocols, and input sanitizers.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import pytest

from scraper.security import (
    resolve_safe_export_path,
    sanitize_search_query,
    sanitize_csv_cell,
    atomic_write_json,
    atomic_save_json,
)
from scraper.exceptions import (
    SecurityValidationError,
    PathTraversalError,
    InputInjectionError,
    InvalidParameterError,
)


def safe_resolve(output_path: str | Path, base_dir: Path) -> Path:
    """Helper to call resolve_safe_export_path."""
    return resolve_safe_export_path(output_path, base_dir=base_dir)


@pytest.mark.unit
class TestPathJail:
    """Test suite for path traversal defense and directory jailing."""

    def test_valid_export_path_resolution(self, safe_temp_dir: Path) -> None:
        """Verify normal relative path resolves inside designated base directory."""
        target = safe_resolve("export.json", safe_temp_dir)
        assert target.is_relative_to(safe_temp_dir)
        assert target.name == "export.json"

    def test_valid_nested_subdir_creation(self, safe_temp_dir: Path) -> None:
        """Verify nested path creates parent directories securely."""
        target = safe_resolve("nested/sub/catalog.json", safe_temp_dir)
        assert target.is_relative_to(safe_temp_dir)
        assert target.parent.exists()

    def test_path_traversal_dot_dot_rejection(self, safe_temp_dir: Path) -> None:
        """Verify traversal attack using ../.. is blocked."""
        with pytest.raises((SecurityValidationError, PathTraversalError, ValueError)):
            safe_resolve("../../etc/passwd", safe_temp_dir)

    def test_absolute_system_path_traversal_rejection(self, safe_temp_dir: Path) -> None:
        """Verify direct absolute paths outside base directory are rejected."""
        with pytest.raises((SecurityValidationError, PathTraversalError, ValueError)):
            safe_resolve("/etc/shadow", safe_temp_dir)

    def test_null_byte_in_path_rejection(self, safe_temp_dir: Path) -> None:
        """Verify null byte injection in file paths is rejected immediately."""
        with pytest.raises((SecurityValidationError, InputInjectionError, ValueError)):
            safe_resolve("data/\x00secret.json", safe_temp_dir)


@pytest.mark.unit
class TestAtomicStorage:
    """Test suite for atomic file write protocol."""

    def test_atomic_save_success(self, safe_temp_dir: Path) -> None:
        """Verify atomic JSON write outputs valid RFC 8259 JSON."""
        target_file = safe_temp_dir / "catalog.json"
        data = {"status": "success", "count": 2, "items": [{"id": 1}, {"id": 2}]}
        atomic_save_json(data, target_file)
        
        assert target_file.exists()
        loaded = json.loads(target_file.read_text(encoding="utf-8"))
        assert loaded["count"] == 2

    def test_atomic_overwrite_preserves_integrity(self, safe_temp_dir: Path) -> None:
        """Verify subsequent atomic writes cleanly replace previous content."""
        target_file = safe_temp_dir / "catalog.json"
        atomic_save_json({"version": 1}, target_file)
        assert json.loads(target_file.read_text(encoding="utf-8"))["version"] == 1
        
        atomic_save_json({"version": 2}, target_file)
        assert json.loads(target_file.read_text(encoding="utf-8"))["version"] == 2

    def test_atomic_write_cleans_up_on_failure(self, safe_temp_dir: Path) -> None:
        """Verify temp files are removed and target is not corrupted if serialization fails."""
        target_file = safe_temp_dir / "broken.json"
        
        class Unserializable:
            pass

        with pytest.raises((TypeError, ValueError, Exception)):
            atomic_save_json({"bad": Unserializable()}, target_file)

        assert not target_file.exists()
        temp_files = list(safe_temp_dir.glob("*.tmp*"))
        assert len(temp_files) == 0


@pytest.mark.unit
class TestSanitizationUtilities:
    """Test suite for query & CSV sanitization functions."""

    def test_sanitize_search_query_normal(self) -> None:
        """Verify normal search query remains intact and normalized."""
        clean = sanitize_search_query("Käse Fondue")
        assert clean == "Käse Fondue"

    def test_sanitize_search_query_strips_control_chars(self) -> None:
        """Verify control characters and tabs are stripped or neutralized."""
        dirty = "milch\x08\x1fbutter"
        clean = sanitize_search_query(dirty)
        assert "\x1f" not in clean
        assert "milch" in clean

    def test_sanitize_search_query_null_byte_raises_injection_error(self) -> None:
        """Verify null bytes in search queries raise InputInjectionError."""
        with pytest.raises((InputInjectionError, SecurityValidationError, ValueError)):
            sanitize_search_query("milch\0butter")

    def test_sanitize_csv_cell_neutralizes_formulas(self) -> None:
        """Verify dangerous formula prefixes (=, +, -, @) are escaped with single quote."""
        dangerous_cells = [
            ("=SUM(A1:A10)", "'=SUM(A1:A10)"),
            ("+12345", "'+12345"),
            ("-12.50", "'-12.50"),
            ("@cmd|' /C calc'!A0", "'@cmd|' /C calc'!A0"),
            ("Normal Title", "Normal Title"),
        ]
        for raw, expected in dangerous_cells:
            assert sanitize_csv_cell(raw) == expected
