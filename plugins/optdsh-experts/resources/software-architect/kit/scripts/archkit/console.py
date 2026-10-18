"""Console helpers shared by the entry points."""

from __future__ import annotations

import sys


def ensure_utf8_stdio() -> None:
    """Force UTF-8 on stdout/stderr (Windows consoles default to a legacy code page)."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass
