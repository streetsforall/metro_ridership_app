"""
Cross-check the hand-curated transit events (src/data/transit-events.json)
against independent sources, to catch wrong opening/extension dates like the
ones this data has already had (D Line dated 2023-10 instead of its true
2026-05; K Line dated 2021-10 instead of 2022-10).

What it checks, per event:
  1. Referential — every line_id still exists as a route in the live LA Metro
     GTFS rail feed (the same feed fetch_metro_lines.py uses).
  2. Openings — for 'opening' events on a single line, compare the curated
     month to the first month that line reports non-zero ridership in
     src/data/ridership.json. A brand-new line shows up in the ridership data
     when it opens, so the two should agree within a month.
  3. Everything else (extensions, disruptions, system-wide, multi-line
     openings) is flagged for MANUAL verification: a station extension does not
     create a new route_id and the line already has ridership history, so
     neither GTFS nor ridership can date it automatically.

Run from anywhere (paths resolve relative to this file):
    python scripts/check_transit_events.py
    npm run check-transit-events

Exits non-zero if any opening date disagrees with the ridership data, so it can
gate a data update. Only the referential check needs the network; the date/
ridership logic is unit-tested in test_check_transit_events.py without it.
"""

import json
import sys
from pathlib import Path

from fetch_metro_lines import GTFS_URLS, fetch_gtfs

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
TRANSIT_EVENTS_PATH = REPO_ROOT / "src" / "data" / "transit-events.json"
RIDERSHIP_PATH = REPO_ROOT / "src" / "data" / "ridership.json"

# Only 'opening' events carry a ridership signal a new line can be dated from.
AUTO_CHECK_CATEGORIES = {"opening"}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def month_int(date: str) -> int:
    """'YYYY-MM' -> YYYYMM integer."""
    year, month = date.split("-")
    return int(year) * 100 + int(month)


def month_diff(a: int, b: int) -> int:
    """Absolute difference in months between two YYYYMM integers."""
    ai = (a // 100) * 12 + (a % 100)
    bi = (b // 100) * 12 + (b % 100)
    return abs(ai - bi)


def dataset_month_bounds(records: list[dict]) -> tuple[int, int]:
    """(earliest, latest) YYYYMM present across all ridership records."""
    months = [r["year"] * 100 + r["month"] for r in records]
    return min(months), max(months)


def first_nonzero_month(records: list[dict], line_id: int) -> int | None:
    """Earliest YYYYMM a line reports non-zero ridership, or None if it never does.

    The ridership ETL pads every line back to the dataset start with zeros, so a
    line's first *record* is meaningless; only the first *non-zero* month marks
    when service actually shows up.
    """
    earliest = None
    for r in records:
        if r["line_name"] != line_id:
            continue
        if not (
            r.get("est_wkday_ridership")
            or r.get("est_sat_ridership")
            or r.get("est_sun_ridership")
        ):
            continue
        ym = r["year"] * 100 + r["month"]
        if earliest is None or ym < earliest:
            earliest = ym
    return earliest


def rail_route_ids(get_rail_file) -> set[int]:
    """Set of integer route_ids present in the GTFS rail feed's routes.txt."""
    ids = set()
    for route in get_rail_file("routes.txt"):
        try:
            ids.add(int(route["route_id"]))
        except (KeyError, ValueError):
            continue
    return ids


def check_events(
    events: list[dict], records: list[dict], known_route_ids: set[int] | None
) -> list[tuple[str, str]]:
    """Return a list of (level, message) findings. Pure — no I/O.

    known_route_ids may be None when the GTFS feed couldn't be fetched, in which
    case the referential check is skipped rather than failed.
    """
    findings: list[tuple[str, str]] = []
    first_month, last_month = dataset_month_bounds(records)

    for event in events:
        eid = event["id"]
        date = event["date"]
        curated = month_int(date)

        if known_route_ids is not None:
            for line_id in event["line_ids"]:
                if line_id not in known_route_ids:
                    findings.append(
                        ("WARN", f"{eid}: line {line_id} not in current GTFS rail routes")
                    )

        if curated > last_month:
            findings.append(
                ("WARN", f"{eid}: dated {date}, past the latest ridership month {last_month}")
            )

        is_single_line_opening = (
            event["category"] in AUTO_CHECK_CATEGORIES and len(event["line_ids"]) == 1
        )
        if not is_single_line_opening:
            findings.append(
                ("MANUAL", f"{eid}: {event['category']} - verify by hand (no automatable signal)")
            )
            continue

        line_id = event["line_ids"][0]
        first_nonzero = first_nonzero_month(records, line_id)
        if first_nonzero is None:
            findings.append(
                ("INFO", f"{eid}: line {line_id} has no ridership data; cannot cross-check")
            )
        elif first_nonzero == first_month:
            findings.append(
                ("INFO", f"{eid}: line {line_id} present from dataset start; no opening signal")
            )
        else:
            diff = month_diff(curated, first_nonzero)
            if diff <= 1:
                findings.append(
                    ("OK", f"{eid}: {date} matches first ridership month {first_nonzero}")
                )
            else:
                findings.append(
                    (
                        "FAIL",
                        f"{eid}: dated {date} but line {line_id} first appears "
                        f"{first_nonzero} ({diff} months off)",
                    )
                )

    return findings


def main() -> int:
    events = load_json(TRANSIT_EVENTS_PATH)
    records = load_json(RIDERSHIP_PATH)

    print("Fetching LA Metro GTFS rail feed for the referential check...")
    try:
        get_rail_file = fetch_gtfs(GTFS_URLS["rail"])
        known_route_ids: set[int] | None = rail_route_ids(get_rail_file)
        print(f"  {len(known_route_ids)} rail routes in feed.\n")
    except Exception as exc:  # noqa: BLE001 - network failure must not abort offline checks
        print(f"  WARNING: could not fetch GTFS ({exc}); skipping referential check.\n")
        known_route_ids = None

    findings = check_events(events, records, known_route_ids)

    print("Transit event cross-check:\n")
    for level, message in findings:
        print(f"  [{level:6}] {message}")

    fails = [f for f in findings if f[0] == "FAIL"]
    print(f"\n{len(findings)} findings, {len(fails)} discrepancy(ies).")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
