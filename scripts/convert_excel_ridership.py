"""
Convert LA Metro Excel ridership files to the CSV format expected by
process_ridership.py, then run that script to update ridership.json.

Usage:
    # Individual xlsx files (MM-YYYY-{Bus|Rail}.xlsx format)
    python scripts/convert_excel_ridership.py data/raw/01-2026-Bus.xlsx data/raw/01-2026-Rail.xlsx ...

    # Typed zip archives ({Bus|Rail} YYYY.zip format, inner files YYYY-MM.xlsx)
    python scripts/convert_excel_ridership.py "data/raw/Bus 2025.zip" "data/raw/Rail 2025.zip"

    # All xlsx files in a directory
    python scripts/convert_excel_ridership.py data/raw/

Run from the repository root so that process_ridership.py can find
src/data/ridership.json and src/data/metro_line_metadata_current.json.
"""

import io
import re
import sys
import subprocess
import tempfile
import zipfile
from pathlib import Path

import pandas as pd

# Column names assigned after skipping the two merged Excel header rows
BUS_COLS = [
    "STOP_NAME", "LINE", "DIRECTION",
    "WD_ONS", "WD_OFFS", "WD_ACT",
    "SA_ONS", "SA_OFFS", "SA_ACT",
    "SU_ONS", "SU_OFFS", "SU_ACT",
]
RAIL_COLS = [
    "LINE", "ROUTE", "STATION_ORDER",
    "WD_ONS", "WD_OFFS", "WD_ACT",
    "SA_ONS", "SA_OFFS", "SA_ACT",
    "SU_ONS", "SU_OFFS", "SU_ACT",
]

# Maps the wide Ons column name to the DayType code process_ridership.py expects
DAYTYPE_MAP = {
    "WD_ONS": "DX",
    "SA_ONS": "SA",
    "SU_ONS": "SU",
}

# Individual file: MM-YYYY-{Bus|Rail}.xlsx
FILENAME_RE = re.compile(r"^(\d{2})-(\d{4})-(Bus|Rail)\.xlsx$", re.IGNORECASE)

# Zip archive: {Bus|Rail} YYYY.zip  (e.g. "Bus 2025.zip")
ZIP_FILENAME_RE = re.compile(r"^(Bus|Rail)\s+\d{4}\.zip$", re.IGNORECASE)

# Inner xlsx filename inside a typed zip: YYYY-MM.xlsx
INNER_FILENAME_RE = re.compile(r"^(\d{4})-(\d{2})\.xlsx$")


def parse_filename(path: Path) -> tuple[int, int, str]:
    """Return (month, year, mode) parsed from a filename like 01-2026-Bus.xlsx."""
    m = FILENAME_RE.match(path.name)
    if not m:
        raise ValueError(
            f"Cannot parse '{path.name}'. Expected format: MM-YYYY-{{Bus|Rail}}.xlsx"
        )
    month, year, mode = int(m.group(1)), int(m.group(2)), m.group(3).capitalize()
    return month, year, mode


def _read_excel_bytes(data: bytes, name: str, cols: list[str]) -> pd.DataFrame:
    """Parse Excel bytes into a cleaned DataFrame with explicit column names."""
    df = pd.read_excel(
        io.BytesIO(data), sheet_name="Export", header=None, skiprows=2, engine="openpyxl"
    )
    if len(df.columns) != len(cols):
        raise ValueError(
            f"{name}: expected {len(cols)} columns, got {len(df.columns)}. "
            "The Excel layout may have changed."
        )
    df.columns = cols
    # Drop trailing empty rows and rows where LINE is not a real numeric line ID
    df["LINE"] = pd.to_numeric(df["LINE"], errors="coerce")
    df = df.dropna(subset=["LINE"]).copy()
    df["LINE"] = df["LINE"].astype(int)
    return df


def load_excel(path: Path, cols: list[str]) -> pd.DataFrame:
    """Read an xlsx file from disk."""
    return _read_excel_bytes(path.read_bytes(), path.name, cols)


def aggregate_to_line_ridership(df: pd.DataFrame, year: int, month: int, mode: str) -> pd.DataFrame:
    """Sum stop/station boardings per line, then reshape to the long CSV format.

    Excludes aggregate "Total" rows that the Excel export includes at multiple
    levels (direction-total for Bus, route-total and station-total for Rail).
    Summing only the leaf-level rows gives the correct line ridership.
    """
    if mode == "Bus":
        # Each stop has one row per direction plus a "Total" direction row.
        # Keep only real direction rows so we don't double-count.
        df = df[df["DIRECTION"].notna() & (df["DIRECTION"] != "Total")]
    else:  # Rail
        # Each line has a line-total row (ROUTE=="Total") and per-station rows
        # where the first station row is a route-total (STATION_ORDER=="Total").
        # Keep only individual station rows.
        df = df[df["STATION_ORDER"].notna() & (df["STATION_ORDER"] != "Total")]

    for col in ["WD_ONS", "SA_ONS", "SU_ONS"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    agg = df.groupby("LINE")[["WD_ONS", "SA_ONS", "SU_ONS"]].sum().reset_index()

    long = agg.melt(
        id_vars="LINE",
        value_vars=["WD_ONS", "SA_ONS", "SU_ONS"],
        var_name="daytype_col",
        value_name="Riders",
    )
    long["DayType"] = long["daytype_col"].map(DAYTYPE_MAP)
    long["Year"] = year
    long["Month"] = month
    long["Mode"] = mode
    long["Provider"] = "DO"
    # No shakeup periods in Excel data; Days=1 makes weighted averaging a no-op
    long["Shakeup"] = "S1"
    long["Days"] = 1

    return long.rename(columns={"LINE": "Line"})[
        ["Year", "Month", "Line", "DayType", "Riders", "Shakeup", "Provider", "Mode", "Days"]
    ]


def convert_file(path: Path) -> pd.DataFrame:
    """Convert a single MM-YYYY-{Bus|Rail}.xlsx file."""
    month, year, mode = parse_filename(path)
    cols = BUS_COLS if mode == "Bus" else RAIL_COLS
    df = load_excel(path, cols)
    return aggregate_to_line_ridership(df, year, month, mode)


def convert_zip(zip_path: Path) -> pd.DataFrame:
    """Convert all xlsx files inside a typed zip like 'Bus 2025.zip' or 'Rail 2025.zip'.

    Zip name must match: {Bus|Rail} YYYY.zip
    Inner xlsx names must match: YYYY-MM.xlsx
    """
    m = ZIP_FILENAME_RE.match(zip_path.name)
    if not m:
        raise ValueError(
            f"Cannot parse mode from '{zip_path.name}'. "
            "Expected format: 'Bus YYYY.zip' or 'Rail YYYY.zip'"
        )
    mode = m.group(1).capitalize()
    cols = BUS_COLS if mode == "Bus" else RAIL_COLS

    frames = []
    with zipfile.ZipFile(zip_path) as zf:
        for entry in sorted(zf.infolist(), key=lambda e: e.filename):
            basename = Path(entry.filename).name
            fm = INNER_FILENAME_RE.match(basename)
            if not fm:
                continue
            year, month = int(fm.group(1)), int(fm.group(2))
            data = zf.read(entry.filename)
            df = _read_excel_bytes(data, basename, cols)
            frames.append(aggregate_to_line_ridership(df, year, month, mode))

    if not frames:
        raise ValueError(f"No YYYY-MM.xlsx files found inside {zip_path.name}")

    return pd.concat(frames, ignore_index=True)


def main(items: list[Path]) -> None:
    frames = []
    file_count = 0
    for item in items:
        if item.suffix.lower() == ".zip":
            print(f"converting {item.name} (zip)...")
            frames.append(convert_zip(item))
            with zipfile.ZipFile(item) as zf:
                file_count += sum(
                    1 for e in zf.infolist()
                    if INNER_FILENAME_RE.match(Path(e.filename).name)
                )
        else:
            print(f"converting {item.name}...")
            frames.append(convert_file(item))
            file_count += 1

    combined = pd.concat(frames, ignore_index=True)
    print(f"combined: {len(combined):,} rows across {file_count} file(s)")

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", newline="") as tmp:
        combined.to_csv(tmp, index=False)
        tmp_path = tmp.name

    try:
        script = Path(__file__).parent / "process_ridership.py"
        result = subprocess.run([sys.executable, str(script), tmp_path], check=False)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    sys.exit(result.returncode)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "usage: python scripts/convert_excel_ridership.py "
            "<file.xlsx|file.zip ...> OR <directory/>"
        )
        sys.exit(1)

    items: list[Path] = []
    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.is_dir():
            items.extend(sorted(p.glob("*.xlsx")))
        elif p.suffix.lower() in (".xlsx", ".zip"):
            items.append(p)
        else:
            print(f"skipping {arg}: not an .xlsx/.zip file or directory")

    if not items:
        print("no .xlsx or .zip files found")
        sys.exit(1)

    main(items)
