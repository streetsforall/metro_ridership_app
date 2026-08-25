"""
Remove records from src/data/ridership.json.

The ingest pipeline only ever adds or restates; there was no way to take a month
back out.  That became a problem when Metro's June 2026 bus export turned out to
be inflated across all 108 bus lines while the rail half of the same delivery was
fine, so the month had to be half-withdrawn rather than reverted.

Usage:
    # withdraw one mode from one month
    python scripts/remove_ridership_records.py --year 2026 --month 6 --mode Bus \\
        --reason "Metro's 06-2026-Bus.xlsx is inflated ~2.4x; see docs/data-quality/"

    # withdraw specific lines
    python scripts/remove_ridership_records.py --year 2026 --month 6 --lines 2 4 720

    python scripts/remove_ridership_records.py ... --dry-run   # report only

Records are *deleted*, never zeroed.  A zero row asserts the line ran and carried
nobody, which the chart draws as a real data point and averageRidership counts in
its denominator; an absent row is drawn as the gap it is.
"""

import argparse
import sys
from datetime import date

import pandas as pd

import process_ridership as pr
import ridership_anomalies as ra
import stop_ridership
import update_ridership as ur


def select_records(
    current: pd.DataFrame, year: int, month: int,
    mode: str | None = None, lines: list[int] | None = None,
) -> pd.Series:
    """Boolean mask of the records the given filters select.

    Mode is resolved through the same line -> mode map the anomaly guard uses,
    since ridership.json carries no mode column of its own.
    """
    mask = (current["year"] == year) & (current["month"] == month)
    if lines:
        mask &= current["line_name"].isin(lines)
    if mode:
        mode_map = ra.build_mode_map()
        mask &= current["line_name"].map(
            lambda ln: mode_map.get(int(ln), ra.UNKNOWN_MODE) == mode
        )
    return mask


def remove_stop_records(
    year: int, month: int, mode: str | None, lines: list[int] | None,
    dry_run: bool = False,
) -> dict[str, int]:
    """Drop the same month from the stop-grain payloads.

    Withdrawing a month from the line grain and leaving it at the stop grain
    would publish two different answers for the same month.  That is not
    hypothetical: reverting the June 2026 ingest took the line records out but
    left `stop_ridership.bus.json` serving the inflated figures, because the
    payloads were committed by a later PR built while the bad workbook was still
    in `data/raw/`.

    Returns {payload mode: rows removed}.
    """
    removed: dict[str, int] = {}
    for payload_mode, path in stop_ridership.STOP_PATHS.items():
        if mode and payload_mode != mode:
            continue
        if not path.exists():
            continue
        frame = stop_ridership.load_stop_ridership(path)
        mask = (frame["year"] == year) & (frame["month"] == month)
        if lines:
            mask &= frame["line"].isin(lines)
        if not mask.any():
            continue
        removed[payload_mode] = int(mask.sum())
        if not dry_run:
            stop_ridership.write_stop_ridership(path, frame[~mask])
    return removed


def build_release_entry(
    year: int, month: int, removed: pd.DataFrame,
    mode: str | None, reason: str | None,
    stop_removed: dict[str, int] | None = None,
) -> str:
    """Compose a DATA_RELEASE_NOTES.md entry for a withdrawal."""
    what = f"{mode.lower()} records" if mode else "records"
    bullets = [
        f"- **Months:** {ur.months_full([(year, month)])}",
        f"- **Removed:** {len(removed)} {what} across "
        f"{removed['line_name'].nunique()} lines",
    ]
    if stop_removed:
        bullets.append(
            "- **Stop-level:** "
            + ", ".join(f"{m} −{n:,}" for m, n in stop_removed.items())
            + " stop-month rows"
        )
    if reason:
        bullets.append(f"- **Reason:** {reason}")
    bullets.append(
        f"- Removed via `remove_ridership_records.py` on {date.today().isoformat()}."
    )
    return (
        f"## {ur.month_label([(year, month)])} — {what} withdrawn\n\n"
        + "\n".join(bullets)
        + "\n\n"
    )


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--month", type=int, required=True)
    parser.add_argument(
        "--mode", choices=["Bus", "Rail"],
        help="restrict to one mode (resolved via metro_line_metadata_current.json)",
    )
    parser.add_argument(
        "--lines", type=int, nargs="+", help="restrict to these line numbers",
    )
    parser.add_argument("--reason", help="recorded in the release note")
    parser.add_argument(
        "--dry-run", action="store_true", help="report what would go, write nothing",
    )
    parser.add_argument(
        "--no-release-notes", action="store_true",
        help="do not update DATA_RELEASE_NOTES.md",
    )
    parser.add_argument(
        "--no-stops", action="store_true",
        help="leave the stop-grain payloads alone (they will then disagree with "
             "the line grain for this month)",
    )
    args = parser.parse_args(argv)

    if not args.mode and not args.lines:
        print("refusing to remove a whole month: pass --mode and/or --lines")
        return 1

    current = pr.load_current_ridership()
    mask = select_records(current, args.year, args.month, args.mode, args.lines)
    removed = current[mask]

    stop_removed: dict[str, int] = {}
    if not args.no_stops:
        stop_removed = remove_stop_records(
            args.year, args.month, args.mode, args.lines, dry_run=True
        )

    if removed.empty and not stop_removed:
        print(f"no matching records for {args.year}-{args.month:02d}")
        return 1

    print(
        f"removing {len(removed)} record(s) across "
        f"{removed['line_name'].nunique()} line(s) from "
        f"{args.year}-{args.month:02d}"
    )
    kept_same_month = int(((current["year"] == args.year) &
                           (current["month"] == args.month) & ~mask).sum())
    if not removed.empty:
        print(f"  lines: {', '.join(str(int(x)) for x in sorted(removed['line_name'].unique()))}")
    print(f"  {kept_same_month} record(s) in that month are kept")
    for payload_mode, count in stop_removed.items():
        print(f"  stop grain ({payload_mode}): {count:,} stop-month rows")

    if args.dry_run:
        print("dry run — no files written")
        return 0

    final = current[~mask].reset_index(drop=True)
    pr.RIDERSHIP_PATH.write_text(
        final.to_json(orient="records", indent=2), encoding="utf-8"
    )
    print(f"ridership updated: {len(current):,} -> {len(final):,} records")

    if not args.no_stops:
        remove_stop_records(args.year, args.month, args.mode, args.lines)

    if not args.no_release_notes:
        entry = build_release_entry(
            args.year, args.month, removed, args.mode, args.reason, stop_removed
        )
        if ur.prepend_release_entry(entry):
            print(f"release note added: {ur.month_label([(args.year, args.month)])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
