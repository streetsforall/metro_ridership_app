"""
Convert LA Metro Excel ridership files to the CSV format expected by
process_ridership.py, then run that script to update ridership.json.

Usage:
    # Individual xlsx files (MM-YYYY-{Bus|Rail}.xlsx format)
    python scripts/convert_excel_ridership.py data/raw/01-2026-Bus.xlsx data/raw/01-2026-Rail.xlsx ...

    # Typed zip archives ({Bus|Rail} YYYY.zip format, inner files YYYY-MM.xlsx)
    python scripts/convert_excel_ridership.py "data/raw/Bus 2025.zip" "data/raw/Rail 2025.zip"

    # Date-range zip archives (any name, inner files MM-YYYY-{Bus|Rail}.xlsx)
    python scripts/convert_excel_ridership.py data/raw/2026-04_2026-05.zip

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

import stop_identity

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

# The per-stop measures carried through to stop grain. *_ACT is deliberately absent:
# it equals ONS + OFFS, so it is a third of the payload for one client-side addition.
LEAF_VALUE_COLS = [
    "WD_ONS", "WD_OFFS",
    "SA_ONS", "SA_OFFS",
    "SU_ONS", "SU_OFFS",
]

# Column order of aggregate_to_stop_ridership's output. Frozen — downstream stages
# read it by name, and `station_order` is a rail-only ordering attribute that must
# never be used as an identity (see stop_identity.py).
STOP_OUTPUT_COLS = [
    "year", "month", "mode", "line", "stop_key", "stop_name", "station_order",
    "wd_ons", "wd_offs", "sa_ons", "sa_offs", "su_ons", "su_offs",
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


def extract_leaf_rows(df: pd.DataFrame, mode: str) -> pd.DataFrame:
    """Reduce a raw export frame to its leaf rows, with LINE resolved to ROUTE.

    **This is the single source of truth for what counts as a real observation.**
    Both the line-level and the stop-level aggregations go through it, so the rule
    cannot drift between them the next time Metro changes the export layout.

    The export interleaves aggregate "Total" rows at several levels — a
    direction-total per stop for Bus, and for Rail both a line-total row
    (`ROUTE == "Total"`) and a route-total row (`STATION_ORDER == "Total"`).
    Summing anything without dropping those double-counts.

    For rail it also resolves LINE to ROUTE, because Metro nests distinct routes
    under a shared LINE grouping — notably ROUTE 805 (D/Purple) under LINE 802
    (B/Red). Reporting each ROUTE as its own line is what keeps the Purple Line's
    riders, and its stations, out of the Red Line's totals. Single-route lines have
    ROUTE == LINE so this is a no-op for them; a non-numeric ROUTE falls back to
    LINE.

    Returns a copy; the caller may mutate it freely.
    """
    if mode == "Bus":
        # Each stop has one row per direction plus a "Total" direction row.
        # Keep only real direction rows so we don't double-count.
        leaf = df[df["DIRECTION"].notna() & (df["DIRECTION"] != "Total")].copy()
    else:  # Rail
        # Each line has a line-total row (ROUTE=="Total") and per-station rows
        # where the first station row is a route-total (STATION_ORDER=="Total").
        # Keep only individual station rows.
        leaf = df[df["STATION_ORDER"].notna() & (df["STATION_ORDER"] != "Total")].copy()
        route = pd.to_numeric(leaf["ROUTE"], errors="coerce")
        leaf["LINE"] = route.fillna(leaf["LINE"]).astype(int)

    # Excel sometimes stores numeric cells as strings, and a stop that reported
    # nothing comes through blank rather than zero.
    for col in LEAF_VALUE_COLS:
        leaf[col] = pd.to_numeric(leaf[col], errors="coerce").fillna(0)

    return leaf


def aggregate_to_line_ridership(df: pd.DataFrame, year: int, month: int, mode: str) -> pd.DataFrame:
    """Sum stop/station boardings per line, then reshape to the long CSV format.

    A thin wrapper over `extract_leaf_rows` — see there for why "Total" rows are
    excluded and why rail is grouped by ROUTE rather than LINE.
    """
    df = extract_leaf_rows(df, mode)

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


def aggregate_to_stop_ridership(df: pd.DataFrame, year: int, month: int, mode: str) -> pd.DataFrame:
    """Reduce a raw export frame to one row per line per stop, keeping boardings
    **and alightings** for all three day types.

    Columns are `STOP_OUTPUT_COLS`. Values are the raw decimals the export carries;
    rounding belongs on write, not here, so that the per-line sums of this frame
    reconcile exactly with `aggregate_to_line_ridership`'s `Riders`.

    Grain is (line, stop). **Bus direction is collapsed**: `STOP_NAME` is a name and
    not a `stop_id`, so both sides of a street share one name and therefore one
    coordinate — they could not be drawn apart even if kept separate. This discards
    which way riders board, recoverable later only from GTFS `stop_times.txt`.

    Rail keeps `station_order` as an ordering attribute. It is **not** an identity —
    the number renumbers whenever the route changes. See `stop_identity`.
    """
    leaf = extract_leaf_rows(df, mode)
    aliases = stop_identity.load_aliases()

    if mode == "Rail":
        parsed = [stop_identity.parse_station_order(v) for v in leaf["STATION_ORDER"]]
        leaf["station_order"] = pd.array(
            [order for order, _ in parsed], dtype="Int64"
        )
        raw_names = [name for _, name in parsed]
    else:
        leaf["station_order"] = pd.array([None] * len(leaf), dtype="Int64")
        raw_names = list(leaf["STOP_NAME"])

    leaf["stop_key"] = [stop_identity.stop_key(mode, name, aliases) for name in raw_names]
    leaf["stop_name"] = [stop_identity.display_stop_name(mode, name) for name in raw_names]

    grouped = leaf.groupby(["LINE", "stop_key"], as_index=False).agg(
        # One display name and one sequence number per key, chosen deterministically:
        # a name that differs only in case or spacing still folds onto one key, and
        # a station's sequence number moves when the route is extended.
        stop_name=("stop_name", "min"),
        station_order=("station_order", "min"),
        **{col.lower(): (col, "sum") for col in LEAF_VALUE_COLS},
    )

    grouped["year"] = year
    grouped["month"] = month
    grouped["mode"] = mode

    return (
        grouped.rename(columns={"LINE": "line"})
        .sort_values(["line", "stop_key"])
        .reset_index(drop=True)[STOP_OUTPUT_COLS]
    )


def convert_file(path: Path) -> pd.DataFrame:
    """Convert a single MM-YYYY-{Bus|Rail}.xlsx file."""
    month, year, mode = parse_filename(path)
    cols = BUS_COLS if mode == "Bus" else RAIL_COLS
    df = load_excel(path, cols)
    return aggregate_to_line_ridership(df, year, month, mode)


def convert_zip(zip_path: Path) -> pd.DataFrame:
    """Convert all xlsx files inside a zip archive. Two conventions are supported:

    1. Typed zip — '{Bus|Rail} YYYY.zip' with inner files named 'YYYY-MM.xlsx'.
       Mode comes from the zip name; each inner file provides year/month.
    2. Date-range/mixed zip — any zip name (e.g. 'YYYY-MM_YYYY-MM.zip') with inner
       files named 'MM-YYYY-{Bus|Rail}.xlsx'. Each inner file self-describes its
       mode/month/year, so the zip name is irrelevant.
    """
    typed_mode = None
    zm = ZIP_FILENAME_RE.match(zip_path.name)
    if zm:
        typed_mode = zm.group(1).capitalize()

    frames = []
    with zipfile.ZipFile(zip_path) as zf:
        for entry in sorted(zf.infolist(), key=lambda e: e.filename):
            basename = Path(entry.filename).name

            # Date-range/mixed zip: inner file names itself MM-YYYY-{Bus|Rail}.xlsx
            fm = FILENAME_RE.match(basename)
            if fm:
                month, year = int(fm.group(1)), int(fm.group(2))
                mode = fm.group(3).capitalize()
            else:
                # Typed zip: inner file is YYYY-MM.xlsx, mode from the zip name
                im = INNER_FILENAME_RE.match(basename)
                if not im:
                    continue
                if typed_mode is None:
                    raise ValueError(
                        f"Cannot parse mode from '{zip_path.name}'. Zips with "
                        "'YYYY-MM.xlsx' inner files must be named 'Bus YYYY.zip' "
                        "or 'Rail YYYY.zip'."
                    )
                year, month, mode = int(im.group(1)), int(im.group(2)), typed_mode

            cols = BUS_COLS if mode == "Bus" else RAIL_COLS
            df = _read_excel_bytes(zf.read(entry.filename), basename, cols)
            frames.append(aggregate_to_line_ridership(df, year, month, mode))

    if not frames:
        raise ValueError(
            f"No 'MM-YYYY-{{Bus|Rail}}.xlsx' or 'YYYY-MM.xlsx' files found "
            f"inside {zip_path.name}"
        )

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
