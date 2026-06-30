"""
Convert LA Metro Excel ridership files to the CSV format expected by
process_ridership.py, then run that script to update ridership.json.

Usage:
    python scripts/convert_excel_ridership.py data/raw/01-2026-Bus.xlsx data/raw/01-2026-Rail.xlsx ...
    python scripts/convert_excel_ridership.py data/raw/   # all .xlsx in directory

Excel filename format: MM-YYYY-{Bus|Rail}.xlsx

Run from the repository root so that process_ridership.py can find
src/data/ridership.json and src/data/metro_line_metadata_current.json.
"""

import re
import sys
import subprocess
import tempfile
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

FILENAME_RE = re.compile(r"^(\d{2})-(\d{4})-(Bus|Rail)\.xlsx$", re.IGNORECASE)


def parse_filename(path: Path) -> tuple[int, int, str]:
    """Return (month, year, mode) parsed from a filename like 01-2026-Bus.xlsx."""
    m = FILENAME_RE.match(path.name)
    if not m:
        raise ValueError(
            f"Cannot parse '{path.name}'. Expected format: MM-YYYY-{{Bus|Rail}}.xlsx"
        )
    month, year, mode = int(m.group(1)), int(m.group(2)), m.group(3).capitalize()
    return month, year, mode


def load_excel(path: Path, cols: list[str]) -> pd.DataFrame:
    """Read an Excel export, skipping the 2-row merged header, assign explicit cols."""
    df = pd.read_excel(path, sheet_name="Export", header=None, skiprows=2, engine="openpyxl")
    if len(df.columns) != len(cols):
        raise ValueError(
            f"{path.name}: expected {len(cols)} columns, got {len(df.columns)}. "
            "The Excel layout may have changed."
        )
    df.columns = cols
    # Drop trailing empty rows (Excel files often have blank rows at the end)
    df["LINE"] = pd.to_numeric(df["LINE"], errors="coerce")
    df = df.dropna(subset=["LINE"]).copy()
    df["LINE"] = df["LINE"].astype(int)
    return df


def aggregate_to_line_ridership(df: pd.DataFrame, year: int, month: int, mode: str) -> pd.DataFrame:
    """Sum stop/station boardings per line, then reshape to the long CSV format."""
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
    month, year, mode = parse_filename(path)
    cols = BUS_COLS if mode == "Bus" else RAIL_COLS
    df = load_excel(path, cols)
    return aggregate_to_line_ridership(df, year, month, mode)


def main(paths: list[Path]) -> None:
    frames = []
    for path in paths:
        print(f"converting {path.name}...")
        frames.append(convert_file(path))

    combined = pd.concat(frames, ignore_index=True)
    print(f"combined: {len(combined):,} rows across {len(paths)} file(s)")

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
            "<file.xlsx ...> OR <directory/>"
        )
        sys.exit(1)

    paths: list[Path] = []
    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.is_dir():
            paths.extend(sorted(p.glob("*.xlsx")))
        elif p.suffix.lower() == ".xlsx":
            paths.append(p)
        else:
            print(f"skipping {arg}: not an .xlsx file or directory")

    if not paths:
        print("no .xlsx files found")
        sys.exit(1)

    main(paths)
