"""
Cross-check the hand-curated transit events (src/data/transit-events.json)
against independent sources, to catch wrong opening/extension dates like the
ones this data has already had (D Line dated 2023-10 instead of its true
2026-05; K Line dated 2021-10 instead of 2022-10).

What it checks, per event:
  1. Referential — every line_id still exists as a route in the live LA Metro
     GTFS feeds. Both the rail *and* bus feeds are read (the same two
     fetch_metro_lines.py uses), because curated events now cover bus service
     changes too; a rail-only set would WARN on every bus line.
  2. Openings — for 'opening' events on a single line, compare the curated
     month to the first month that line reports non-zero ridership in
     src/data/ridership.json. A brand-new line shows up in the ridership data
     when it opens, so the two should agree within a month.
  3. Shakeups — an event that names a Metro pick period must name one Metro
     actually ran (src/data/shakeups.json) and sit within a month of it.
  4. Sources — every event should cite a URL, and that URL should still
     resolve. Link rot is reported as WARN, never FAIL: a dead link is a
     documentation problem and must not block a data update.
  5. Everything else is flagged for MANUAL verification. That bucket is now
     the majority of the schema: extensions, closures, route/headway/hours/
     fare changes, disruptions, system-wide and multi-line events. Neither
     GTFS nor ridership can date a headway change — a frequency bump creates
     no new route_id and the line already has continuous ridership history —
     so only a human reading the cited source can confirm it.

Run from anywhere (paths resolve relative to this file):
    python scripts/check_transit_events.py
    npm run check-transit-events

Exits non-zero if any opening date disagrees with the ridership data, so it can
gate a data update. Only the referential and source-reachability checks need
the network; everything else is unit-tested in test_check_transit_events.py
without it.
"""

import json
import sys
from pathlib import Path

import requests

from fetch_metro_lines import GTFS_URLS, fetch_gtfs, resolve_bus_route

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
TRANSIT_EVENTS_PATH = REPO_ROOT / "src" / "data" / "transit-events.json"
RIDERSHIP_PATH = REPO_ROOT / "src" / "data" / "ridership.json"
SHAKEUPS_PATH = REPO_ROOT / "src" / "data" / "shakeups.json"

# Only 'opening' events carry a ridership signal a new line can be dated from.
AUTO_CHECK_CATEGORIES = {"opening"}

SOURCE_TIMEOUT_SECONDS = 15


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


def bus_route_ids(get_bus_file) -> set[int]:
    """Set of integer line ids present in the GTFS bus feed's routes.txt.

    Bus routes key off route_short_name, with a route_id-prefix fallback for the
    BRT lines (G/J), whose short_name is blank. resolve_bus_route already
    encodes exactly that, so reuse it rather than re-deriving the rule here.
    """
    ids = set()
    for route in get_bus_file("routes.txt"):
        resolved = resolve_bus_route(route)
        if resolved is not None:
            ids.add(resolved[0])
    return ids


def source_is_reachable(url: str) -> bool:
    """True if a HEAD request comes back with anything short of a 4xx/5xx.

    Deliberately permissive. thesource.metro.net answers automated HEAD requests
    with a bare 307 and no Location header (bot protection), so treating any
    redirect as breakage would flag every official Metro citation. Only a hard
    4xx/5xx or a transport error counts as link rot — and even that is WARN.
    """
    response = requests.head(url, timeout=SOURCE_TIMEOUT_SECONDS, allow_redirects=True)
    return response.status_code < 400


def check_events(
    events: list[dict],
    records: list[dict],
    known_route_ids: set[int] | None = None,
    shakeups: set[str] | None = None,
    check_source=None,
) -> list[tuple[str, str]]:
    """Return a list of (level, message) findings. Pure — no I/O of its own.

    known_route_ids may be None when the GTFS feeds couldn't be fetched, in
    which case the referential check is skipped rather than failed. Likewise
    check_source is an injected `url -> bool` callable (None = skip), so the
    whole function stays unit-testable without a network.
    """
    findings: list[tuple[str, str]] = []
    _, last_month = dataset_month_bounds(records)

    for event in events:
        eid = event["id"]
        date = event["date"]
        curated = month_int(date)

        if known_route_ids is not None:
            for line_id in event["line_ids"]:
                if line_id not in known_route_ids:
                    findings.append(
                        ("WARN", f"{eid}: line {line_id} not in current GTFS routes")
                    )

        if curated > last_month:
            findings.append(
                ("WARN", f"{eid}: dated {date}, past the latest ridership month {last_month}")
            )

        findings.extend(_check_shakeup(event, curated, shakeups))
        findings.extend(_check_source(event, check_source))
        findings.extend(_check_opening(event, records, last_month))

    return findings


def _check_shakeup(
    event: dict, curated: int, shakeups: set[str] | None
) -> list[tuple[str, str]]:
    """Validate an event's optional `shakeup` pick-period id."""
    eid = event["id"]
    shakeup = event.get("shakeup")
    if shakeup is None:
        return []

    if not (len(shakeup) == 6 and shakeup.isdigit()):
        return [("FAIL", f"{eid}: shakeup {shakeup!r} is not a YYYYMM id")]

    findings = []
    if shakeups is not None and shakeup not in shakeups:
        findings.append(
            ("FAIL", f"{eid}: shakeup {shakeup} is not a pick period Metro ran")
        )

    diff = month_diff(curated, int(shakeup))
    if diff > 1:
        findings.append(
            (
                "FAIL",
                f"{eid}: dated {event['date']} but claims shakeup {shakeup} "
                f"({diff} months apart)",
            )
        )
    return findings


def _check_source(event: dict, check_source) -> list[tuple[str, str]]:
    """Check that an event cites a source and that the link still resolves."""
    eid = event["id"]
    source = event.get("source")

    if not source:
        return [("WARN", f"{eid}: no source URL cited")]
    if not source.startswith("https://"):
        return [("WARN", f"{eid}: source is not https: {source}")]
    if check_source is None:
        return []

    try:
        reachable = check_source(source)
    except Exception as exc:  # noqa: BLE001 - link checking must never abort the run
        return [("WARN", f"{eid}: source unreachable ({exc}): {source}")]

    if not reachable:
        return [("WARN", f"{eid}: source returned an error status: {source}")]
    return []


def _check_opening(
    event: dict, records: list[dict], last_month: int
) -> list[tuple[str, str]]:
    """Cross-check a single-line opening against ridership first-appearance."""
    eid = event["id"]
    date = event["date"]
    curated = month_int(date)
    first_month, _ = dataset_month_bounds(records)

    is_single_line_opening = (
        event["category"] in AUTO_CHECK_CATEGORIES and len(event["line_ids"]) == 1
    )
    if not is_single_line_opening:
        return [
            ("MANUAL", f"{eid}: {event['category']} - verify by hand (no automatable signal)")
        ]

    line_id = event["line_ids"][0]
    first_nonzero = first_nonzero_month(records, line_id)
    if first_nonzero is None:
        return [("INFO", f"{eid}: line {line_id} has no ridership data; cannot cross-check")]
    if first_nonzero == first_month:
        return [("INFO", f"{eid}: line {line_id} present from dataset start; no opening signal")]

    diff = month_diff(curated, first_nonzero)
    if diff <= 1:
        return [("OK", f"{eid}: {date} matches first ridership month {first_nonzero}")]
    return [
        (
            "FAIL",
            f"{eid}: dated {date} but line {line_id} first appears "
            f"{first_nonzero} ({diff} months off)",
        )
    ]


def fetch_known_route_ids() -> set[int] | None:
    """Combined rail + bus GTFS route id set, or None if either feed fails.

    An all-or-nothing set on purpose: a partial set (say rail only, because the
    bus feed timed out) would emit a WARN for every bus line in the data, which
    reads as a data error when it is really a network error.
    """
    ids: set[int] = set()
    for mode, reader in (("rail", rail_route_ids), ("bus", bus_route_ids)):
        try:
            get_file = fetch_gtfs(GTFS_URLS[mode])
        except Exception as exc:  # noqa: BLE001 - network failure must not abort offline checks
            print(f"  WARNING: could not fetch {mode} GTFS ({exc}); skipping referential check.")
            return None
        mode_ids = reader(get_file)
        print(f"  {len(mode_ids)} {mode} routes in feed.")
        ids |= mode_ids
    return ids


def main() -> int:
    events = load_json(TRANSIT_EVENTS_PATH)
    records = load_json(RIDERSHIP_PATH)
    shakeups = set(load_json(SHAKEUPS_PATH))

    print("Fetching LA Metro GTFS feeds (rail + bus) for the referential check...")
    known_route_ids = fetch_known_route_ids()
    print()

    findings = check_events(
        events,
        records,
        known_route_ids=known_route_ids,
        shakeups=shakeups,
        check_source=source_is_reachable,
    )

    print("Transit event cross-check:\n")
    for level, message in findings:
        print(f"  [{level:6}] {message}")

    fails = [f for f in findings if f[0] == "FAIL"]
    print(f"\n{len(findings)} findings, {len(fails)} discrepancy(ies).")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
