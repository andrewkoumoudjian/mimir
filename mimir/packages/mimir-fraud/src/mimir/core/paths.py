"""Path helpers for running Mimir from this repository."""

from __future__ import annotations

from pathlib import Path


PACKAGE_SRC_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = PACKAGE_SRC_ROOT.parent
MIMIR_ROOT = PACKAGE_ROOT.parents[1]
REPO_ROOT = MIMIR_ROOT.parent
DEFAULT_TRANSACTION_CSV = REPO_ROOT / "valsoft" / "data" / "transactions.csv"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "valsoft" / "output"


def ensure_output_dir(path: str | Path | None = None) -> Path:
    """Create and return an output directory."""

    output_dir = Path(path) if path is not None else DEFAULT_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir
