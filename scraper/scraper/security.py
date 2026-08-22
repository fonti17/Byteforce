"""
Security hardening, input sanitization, directory jail, parameter validation, and atomic write protocols.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
import uuid
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional, Union
from pydantic import BaseModel

from scraper.exceptions import (
    SecurityValidationError,
    PathTraversalError,
    InputInjectionError,
    InvalidParameterError,
)

# Known valid category slugs
VALID_CATEGORY_SLUGS = {
    "fleisch",
    "fisch-seafood",
    "fruechte-gemuese",
    "molkerei-backwaren",
    "molkerei",
    "food",
    "non-food",
    "nonfood",
    "nearfood",
    "getraenke",
    "drinks",
    "wein",
    "spirituosen",
    "tabak",
    "vorverkauf",
    "eigenmarken",
    "aktionen",
}


def sanitize_search_query(query: str, allow_empty: bool = False) -> str:
    """
    Sanitize free-text user search queries.
    Strips control characters, removes null bytes, normalizes Unicode NFC, and enforces length bounds.
    Raises InputInjectionError if null byte is present.
    Raises InvalidParameterError if empty and not allow_empty.
    """
    if query is None:
        if not allow_empty:
            raise InvalidParameterError("Search query cannot be None")
        return ""
    
    if not isinstance(query, str):
        query = str(query)

    if "\0" in query:
        raise InputInjectionError("Null byte detected in search query")

    # Strip ASCII control characters (\x00-\x1f, \x7f)
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", query)

    # Normalize Unicode canonical composition
    cleaned = unicodedata.normalize("NFC", cleaned).strip()

    if not cleaned and not allow_empty:
        raise InvalidParameterError("Search query cannot be empty or whitespace only")

    # Enforce maximum query length (128 characters)
    if len(cleaned) > 128:
        cleaned = cleaned[:128].strip()

    return cleaned


def validate_category_slug(slug: str) -> str:
    """
    Validate category slug against whitelist and safe identifier rules.
    Rejects directory traversal (../), path separators, and shell metacharacters.
    """
    if not slug or not isinstance(slug, str):
        raise InvalidParameterError("Category slug must be a non-empty string")

    slug = slug.strip().lower()
    
    # Check for path traversal or dangerous characters
    if "/" in slug or "\\" in slug or ".." in slug or ";" in slug or "|" in slug:
        raise SecurityValidationError(f"Invalid category slug with forbidden path/shell tokens: '{slug}'")

    if not re.match(r"^[a-z0-9\-_]{1,64}$", slug):
        raise InvalidParameterError(f"Category slug '{slug}' does not match pattern ^[a-z0-9\\-_]{{1,64}}$")

    return slug


def validate_numeric_bound(
    val: Any,
    param_name: str,
    min_val: Union[int, float],
    max_val: Union[int, float],
    require_int: bool = False,
) -> Union[int, float]:
    """
    Validate numeric parameter boundaries (e.g. limit, delay, concurrency).
    """
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        raise InvalidParameterError(f"Parameter '{param_name}' must be a number, got {type(val).__name__}")

    if require_int and not isinstance(val, int):
        raise InvalidParameterError(f"Parameter '{param_name}' must be an integer, got float {val}")

    if val < min_val or val > max_val:
        raise InvalidParameterError(
            f"Parameter '{param_name}'={val} is out of permissible range [{min_val}, {max_val}]"
        )

    return val


def sanitize_csv_cell(value: Any) -> str:
    """
    Neutralize CSV / spreadsheet formula injection attacks.
    Prepends a single quote (') if the string begins with dangerous trigger tokens (=, +, -, @, \t, \r).
    """
    if value is None:
        return ""
    
    s = str(value)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


def resolve_safe_export_path(
    path_or_base: Union[str, Path],
    path_or_none: Optional[Union[str, Path]] = None,
    base_dir: Optional[Path] = None,
) -> Path:
    """Resolve and enforce canonical directory jail for export paths.
    Supports:
      - resolve_safe_export_path(base_dir, user_path)
      - resolve_safe_export_path(user_path, base_dir=...)
    """
    if path_or_none is not None:
        base = Path(path_or_base).resolve()
        raw_target_str = str(path_or_none)
    else:
        raw_target_str = str(path_or_base)
        base = Path(base_dir).resolve() if base_dir is not None else None

    if "\0" in raw_target_str:
        raise SecurityValidationError("Null bytes detected in target export path")

    user_path = Path(raw_target_str)

    if base is not None:
        if user_path.is_absolute():
            resolved_target = user_path.resolve()
        else:
            resolved_target = (base / user_path).resolve()

        try:
            if not resolved_target.is_relative_to(base):
                raise PathTraversalError(
                    f"Path traversal detected: '{raw_target_str}' resolves outside base directory '{base}'"
                )
        except AttributeError:
            try:
                resolved_target.relative_to(base)
            except ValueError:
                raise PathTraversalError(
                    f"Path traversal detected: '{raw_target_str}' resolves outside base directory '{base}'"
                )
    else:
        if user_path.is_absolute():
            resolved_target = user_path.resolve()
            system_dirs = ["/etc", "/sys", "/proc", "/dev", "/boot", "/root"]
            for sys_dir in system_dirs:
                try:
                    if resolved_target.is_relative_to(Path(sys_dir)):
                        raise PathTraversalError(
                            f"Path traversal detected: '{raw_target_str}' targets protected system directory '{sys_dir}'"
                        )
                except AttributeError:
                    if str(resolved_target).startswith(sys_dir):
                        raise PathTraversalError(
                            f"Path traversal detected: '{raw_target_str}' targets protected system directory '{sys_dir}'"
                        )
        else:
            cwd = Path.cwd().resolve()
            resolved_target = (cwd / user_path).resolve()
            try:
                if not resolved_target.is_relative_to(cwd):
                    raise PathTraversalError(
                        f"Path traversal detected: '{raw_target_str}' resolves outside current directory '{cwd}'"
                    )
            except AttributeError:
                try:
                    resolved_target.relative_to(cwd)
                except ValueError:
                    raise PathTraversalError(
                        f"Path traversal detected: '{raw_target_str}' resolves outside current directory '{cwd}'"
                    )

    resolved_target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    return resolved_target


def _json_default_serializer(obj: Any) -> Any:
    """Custom JSON serializer strictly for Pydantic models, datetime/date/Decimal/Path."""
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, Path):
        return str(obj)
    if isinstance(obj, set):
        return list(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def atomic_write_json(
    data: Any,
    target_path: Union[str, Path],
    base_dir: Optional[Path] = None,
) -> None:
    """
    Atomic write protocol for JSON datasets.
    Serializes payload to temporary file in target parent dir, flushes buffer,
    executes fsync to disk, and atomically replaces target via os.replace.
    Cleans up temp file on failure.
    """
    target = resolve_safe_export_path(target_path, base_dir=base_dir) if base_dir else Path(target_path).resolve()
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)

    temp_path = target.parent / f"{target.name}.tmp.{uuid.uuid4().hex}"

    try:
        serialized = json.dumps(
            data,
            indent=2,
            ensure_ascii=False,
            allow_nan=False,
            default=_json_default_serializer,
        )

        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(serialized)
            f.flush()
            os.fsync(f.fileno())

        os.replace(temp_path, target)
    except Exception:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass
        raise


atomic_save_json = atomic_write_json


__all__ = [
    "sanitize_search_query",
    "sanitize_csv_cell",
    "validate_category_slug",
    "validate_numeric_bound",
    "resolve_safe_export_path",
    "atomic_write_json",
    "atomic_save_json",
    "VALID_CATEGORY_SLUGS",
]
