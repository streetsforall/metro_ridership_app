"""
Process raw LA Metro ridership data and update src/data/ridership.json
and src/data/metro_line_metadata_current.json.

Usage:
    # Legacy long-format CSV
    python scripts/process_ridership.py <path/to/Monthly_Riders.csv.gz>

    # Excel from a public records request (single file or a date-range zip)
    python scripts/process_ridership.py data/raw/04-2026-Bus.xlsx
    python scripts/process_ridership.py data/raw/2026-04_2026-05.zip

Input CSV format (Monthly_Riders from LA Metro / public records request):
    Year, Month, Line, DayType, Riders, Shakeup, Provider, Mode, Days

Excel inputs (.xlsx / .zip) are parsed by convert_excel_ridership.py into the
same long format before processing.

DayType values:
    DX = weekday  |  SA = Saturday  |  SU = Sunday
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from convert_excel_ridership import convert_file, convert_zip

RIDERSHIP_PATH = Path("src/data/ridership.json")
METADATA_PATH = Path("src/data/metro_line_metadata_current.json")

RIDERSHIP_COLS = [
    "year", "month", "line_name",
    "est_wkday_ridership", "est_sat_ridership", "est_sun_ridership",
]


def load_raw_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = df.columns.str.lower()
    df["line"] = df["line"].astype(int)
    return df


def load_raw_input(path: str) -> pd.DataFrame:
    """Load raw ridership into the long CSV schema regardless of input format.

    Dispatches on file extension:
      .zip   -> a zip of Excel files (typed or date-range) via convert_zip
      .xlsx  -> a single MM-YYYY-{Bus|Rail}.xlsx via convert_file
      other  -> a legacy long-format CSV via load_raw_csv

    Excel converters emit the same columns as the CSV (Year, Month, Line,
    DayType, Riders, Shakeup, Provider, Mode, Days); normalize them to match
    load_raw_csv (lowercased columns, int line).
    """
    suffix = Path(path).suffix.lower()
    if suffix == ".zip":
        df = convert_zip(Path(path))
    elif suffix == ".xlsx":
        df = convert_file(Path(path))
    else:
        return load_raw_csv(path)

    df.columns = df.columns.str.lower()
    df["line"] = df["line"].astype(int)
    return df


def compute_ridership(df: pd.DataFrame) -> pd.DataFrame:
    """Pivot long-format CSV (one row per DayType) to wide format with separate
    weekday/Saturday/Sunday columns.  Averages across shakeup periods using a
    days-weighted mean, matching Metro's own rounding convention (+0.5 before int)."""
    wm = lambda x: int(np.average(
        np.asarray(x + 0.5, dtype=float),
        weights=np.asarray(df.loc[x.index, "days"], dtype=float),
    ))
    adjusted = df.groupby(
        ["year", "month", "line", "daytype", "provider", "mode"]
    ).agg(riders_weighted=("riders", wm)).reset_index()

    pivoted = adjusted.pivot_table(
        values=["riders_weighted"],
        index=["year", "month", "line", "provider", "mode"],
        columns=["daytype"],
    ).reset_index(col_level=1)
    pivoted.columns = pivoted.columns.droplevel()
    pivoted = pivoted.rename_axis(None, axis=1)
    pivoted.rename(columns={
        "line": "line_name",
        "DX": "est_wkday_ridership",
        "SA": "est_sat_ridership",
        "SU": "est_sun_ridership",
    }, inplace=True)

    return pivoted[RIDERSHIP_COLS]


def fill_missing_months(df: pd.DataFrame) -> pd.DataFrame:
    """Cross-join all year/month combos with all lines so every line has a row
    for every month in the new dataset's range.  Gaps are filled with 0."""
    unique_ym = df[["year", "month"]].drop_duplicates()
    unique_lines = df[["line_name"]].drop_duplicates()
    calendar = unique_ym.merge(unique_lines, how="cross")
    return (
        calendar.merge(df, on=["year", "month", "line_name"], how="left")
        .fillna(0)
        .sort_values(["year", "month", "line_name"])
        .reset_index(drop=True)
    )[RIDERSHIP_COLS]


def merge_ridership(new_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Merge new records with existing ridership.json.

    Resolution rules:
    - New data wins when both new and existing have a record for the same key.
    - Gaps in new data (within its date range) are backfilled from existing data
      before the concat, preserving non-zero historical values.
    - Existing records outside the new dataset's date range are always preserved.
    """
    with open(RIDERSHIP_PATH) as f:
        current = pd.DataFrame(json.load(f))

    # Backfill zeros in new_df from current where current has real values
    merged = new_df.merge(
        current, on=["year", "month", "line_name"], how="left", suffixes=("_new", "_old")
    )
    for col in ["est_wkday_ridership", "est_sat_ridership", "est_sun_ridership"]:
        mask = merged[f"{col}_new"].isnull() & merged[f"{col}_old"].notnull()
        merged.loc[mask, f"{col}_new"] = merged.loc[mask, f"{col}_old"]
    merged.columns = merged.columns.str.replace("_new", "", regex=False)
    merged = merged[RIDERSHIP_COLS]

    final = (
        pd.concat([merged, current])
        .drop_duplicates(subset=["year", "month", "line_name"], keep="first")
        .sort_values(["year", "month", "line_name"])
        .reset_index(drop=True)
    )
    return final, current


def merge_line_metadata(raw_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Append any new lines found in the CSV to metro_line_metadata_current.json."""
    new_lines = (
        raw_df[["line", "mode", "provider"]]
        .drop_duplicates(subset=["line", "mode"])
        .sort_values(["mode", "line"])
        .reset_index(drop=True)
    )

    with open(METADATA_PATH) as f:
        current = pd.read_json(f)

    final = (
        pd.concat([new_lines, current])
        .drop_duplicates(subset=["line", "mode"], keep="first")
        .sort_values(["line", "mode"])
        .reset_index(drop=True)
    )
    return final, current


def main(input_path: str) -> None:
    print(f"loading {input_path}")
    raw_df = load_raw_input(input_path)

    print("computing ridership...")
    new_df = compute_ridership(raw_df)
    new_df = fill_missing_months(new_df)

    print("merging with existing ridership data...")
    final_ridership, current_ridership = merge_ridership(new_df)
    if not final_ridership.equals(current_ridership):
        RIDERSHIP_PATH.write_text(
            final_ridership.to_json(orient="records", indent=2), encoding="utf-8"
        )
        added = len(final_ridership) - len(current_ridership)
        print(
            f"ridership updated: {len(current_ridership):,} -> "
            f"{len(final_ridership):,} records (+{added:,})"
        )
    else:
        print("ridership: no updates")

    print("updating line metadata...")
    final_meta, current_meta = merge_line_metadata(raw_df)
    if len(final_meta) > len(current_meta):
        METADATA_PATH.write_text(
            final_meta.to_json(orient="records", indent=2), encoding="utf-8"
        )
        added = len(final_meta) - len(current_meta)
        print(
            f"line metadata updated: {len(current_meta)} -> "
            f"{len(final_meta)} lines (+{added})"
        )
    else:
        print("line metadata: no updates")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(
            "usage: python scripts/process_ridership.py "
            "<Monthly_Riders.csv.gz | file.xlsx | date-range.zip>"
        )
        sys.exit(1)
    main(sys.argv[1])
