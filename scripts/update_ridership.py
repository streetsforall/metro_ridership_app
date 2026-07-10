"""
Scan a directory of raw LA Metro data and add only the *new* months to
src/data/ridership.json — the day-to-day way to refresh the app's data.

Unlike process_ridership.py (which ingests one archive you name explicitly),
this script discovers every zip/Excel/CSV under data/raw/, works out which
month/line records aren't in ridership.json yet, and adds only those. Existing
records are left untouched by default (append-only); pass --overwrite to let
newer numbers replace existing months (e.g. Metro restatements).

Usage:
    python scripts/update_ridership.py                 # scan data/raw/
    python scripts/update_ridership.py path/ file.zip  # scan given paths
    python scripts/update_ridership.py --overwrite      # corrections win
    python scripts/update_ridership.py --dry-run        # report, write nothing

When new data is added, a matching entry is prepended to DATA_RELEASE_NOTES.md
(disable with --no-release-notes).
"""

import argparse
import calendar
import sys
from datetime import date
from pathlib import Path

import pandas as pd

import process_ridership as pr
from process_ridership import (
    compute_ridership,
    fill_missing_months,
    load_raw_input,
    merge_line_metadata,
    merge_ridership,
)

DEFAULT_SCAN_DIR = "data/raw"
INPUT_GLOBS = ("*.zip", "*.xlsx", "*.csv", "*.csv.gz")
RELEASE_NOTES_PATH = Path("DATA_RELEASE_NOTES.md")

KEYS = ["year", "month", "line_name"]
VALUE_COLS = ["est_wkday_ridership", "est_sat_ridership", "est_sun_ridership"]


def discover_inputs(paths: list[str]) -> list[Path]:
    """Expand the given paths into a sorted, de-duplicated list of input files.

    Directories are globbed (non-recursively) for supported extensions; explicit
    files are kept as-is.
    """
    found: set[Path] = set()
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            for pattern in INPUT_GLOBS:
                found.update(p.glob(pattern))
        elif p.is_file():
            found.add(p)
        else:
            print(f"skipping {p}: not a file or directory")
    return sorted(found)


def load_and_compute(
    files: list[Path],
) -> tuple[pd.DataFrame, pd.DataFrame, dict[Path, set]]:
    """Load each input file and compute its wide per-line ridership.

    fill_missing_months is applied *per file* (i.e. per delivered batch) so a
    line that ran in one archive's months is only zero-filled within that
    archive's range — never cross-joined into unrelated months from other files.

    Returns:
      new_df   -- combined wide ridership (KEYS deduped; loose-xlsx vs. zip
                  overlap collapses, first source wins)
      raw_df   -- combined long records (for line-metadata merge)
      coverage -- {file: set of (year, month)} for release-note attribution
    """
    wide_frames, long_frames = [], []
    coverage: dict[Path, set] = {}
    for f in files:
        long = load_raw_input(str(f))
        coverage[f] = set(map(tuple, long[["year", "month"]].drop_duplicates().to_numpy()))
        long_frames.append(long)
        wide_frames.append(fill_missing_months(compute_ridership(long)))

    raw_df = pd.concat(long_frames, ignore_index=True).drop_duplicates(ignore_index=True)
    new_df = (
        pd.concat(wide_frames, ignore_index=True)
        .drop_duplicates(subset=KEYS, keep="first")
        .sort_values(KEYS)
        .reset_index(drop=True)
    )
    return new_df, raw_df, coverage


def diff_against_current(new_df: pd.DataFrame, overwrite: bool) -> dict:
    """Compare new_df against the existing ridership.json.

    Returns counts and the set of genuinely new (year, month) periods.
    """
    with open(pr.RIDERSHIP_PATH) as f:
        current = pd.read_json(f)

    merged = new_df.merge(
        current, on=KEYS, how="left", indicator=True, suffixes=("_new", "_old")
    )
    new_mask = merged["_merge"] == "left_only"

    both = merged[merged["_merge"] == "both"]
    changed = pd.Series(False, index=both.index)
    for col in VALUE_COLS:
        changed |= both[f"{col}_new"].astype(float) != both[f"{col}_old"].astype(float)
    updated_count = int(changed.sum()) if overwrite else 0

    return {
        "new_records": int(new_mask.sum()),
        "new_lines": int(merged.loc[new_mask, "line_name"].nunique()),
        "new_months": set(
            map(tuple, merged.loc[new_mask, ["year", "month"]].drop_duplicates().to_numpy())
        ),
        "updated_records": updated_count,
    }


def month_label(months: list[tuple[int, int]]) -> str:
    """Readable span label for a set of (year, month) periods, e.g. 'Apr–May 2026'
    or 'Jul 2025 – Mar 2026'."""
    ordered = sorted(months)
    (y0, m0), (y1, m1) = ordered[0], ordered[-1]
    if (y0, m0) == (y1, m1):
        return f"{calendar.month_abbr[m0]} {y0}"
    if y0 == y1:
        return f"{calendar.month_abbr[m0]}–{calendar.month_abbr[m1]} {y0}"
    return f"{calendar.month_abbr[m0]} {y0} – {calendar.month_abbr[m1]} {y1}"


def months_full(months: list[tuple[int, int]]) -> str:
    """Full month names for the Months bullet, e.g. 'April 2026, May 2026' or,
    for longer spans, 'July 2025 – March 2026'."""
    ordered = sorted(months)
    if len(ordered) <= 4:
        return ", ".join(f"{calendar.month_name[m]} {y}" for y, m in ordered)
    (y0, m0), (y1, m1) = ordered[0], ordered[-1]
    return f"{calendar.month_name[m0]} {y0} – {calendar.month_name[m1]} {y1}"


def build_release_entry(
    new_months: set, coverage: dict[Path, set], raw_df: pd.DataFrame,
    added: int, lines: int,
) -> str:
    """Compose a DATA_RELEASE_NOTES.md entry matching the existing format."""
    sources = sorted(
        f.name for f, months in coverage.items() if months & new_months
    )
    src_str = ", ".join(f"`{s}`" for s in sources)
    modes = " + ".join(sorted(raw_df["mode"].dropna().unique()))
    return (
        f"## {month_label(list(new_months))}\n\n"
        f"- **Months:** {months_full(list(new_months))}\n"
        f"- **Source:** {src_str}\n"
        f"- **Modes:** {modes}\n"
        f"- **Added:** {added} records across {lines} lines\n"
        f"- Ingested via `update_ridership.py` on {date.today().isoformat()}.\n\n"
    )


def prepend_release_entry(entry: str) -> bool:
    """Insert `entry` before the first '## ' heading in DATA_RELEASE_NOTES.md.

    Returns True if written, False if the file is missing.
    """
    if not RELEASE_NOTES_PATH.exists():
        print(f"note: {RELEASE_NOTES_PATH} not found; skipping release-note update")
        return False
    lines = RELEASE_NOTES_PATH.read_text(encoding="utf-8").splitlines(keepends=True)
    insert_at = next(
        (i for i, ln in enumerate(lines) if ln.startswith("## ")), len(lines)
    )
    updated = "".join(lines[:insert_at]) + entry + "".join(lines[insert_at:])
    RELEASE_NOTES_PATH.write_text(updated, encoding="utf-8")
    return True


def main(argv: list[str] | None = None) -> int:
    # Month labels use en-dashes; avoid mojibake/crashes on legacy Windows consoles.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths", nargs="*", default=[DEFAULT_SCAN_DIR],
        help=f"files or directories to scan (default: {DEFAULT_SCAN_DIR})",
    )
    parser.add_argument(
        "--overwrite", action="store_true",
        help="let newer numbers replace existing months (default: append-only)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="report changes but write nothing",
    )
    parser.add_argument(
        "--no-release-notes", action="store_true",
        help="do not update DATA_RELEASE_NOTES.md",
    )
    args = parser.parse_args(argv)

    files = discover_inputs(args.paths)
    if not files:
        print(f"no input files found in {', '.join(args.paths)}")
        return 1
    print(f"found {len(files)} input file(s):")
    for f in files:
        print(f"  - {f}")

    new_df, raw_df, coverage = load_and_compute(files)

    diff = diff_against_current(new_df, args.overwrite)
    added, lines = diff["new_records"], diff["new_lines"]

    if added == 0 and diff["updated_records"] == 0:
        print("no new data — ridership.json already up to date")
        return 0

    if added:
        print(
            f"new data: +{added} records across {lines} lines "
            f"({month_label(list(diff['new_months']))})"
        )
    if args.overwrite and diff["updated_records"]:
        print(f"corrections: {diff['updated_records']} existing records will be updated")

    if args.dry_run:
        print("dry run — no files written")
        return 0

    final_ridership, current_ridership = merge_ridership(
        new_df, prefer_new=args.overwrite
    )
    pr.RIDERSHIP_PATH.write_text(
        final_ridership.to_json(orient="records", indent=2), encoding="utf-8"
    )
    print(
        f"ridership updated: {len(current_ridership):,} -> "
        f"{len(final_ridership):,} records"
    )

    final_meta, current_meta = merge_line_metadata(raw_df)
    if len(final_meta) > len(current_meta):
        pr.METADATA_PATH.write_text(
            final_meta.to_json(orient="records", indent=2), encoding="utf-8"
        )
        print(
            f"line metadata updated: {len(current_meta)} -> {len(final_meta)} lines "
            f"(+{len(final_meta) - len(current_meta)})"
        )

    if added and not args.no_release_notes:
        entry = build_release_entry(
            diff["new_months"], coverage, raw_df, added, lines
        )
        if prepend_release_entry(entry):
            print(f"release note added: {month_label(list(diff['new_months']))}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
