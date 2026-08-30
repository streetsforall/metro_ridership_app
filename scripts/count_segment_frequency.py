"""
Counts weekday departures on each segment between two consecutive stops.

Run with: python scripts/count_segment_frequency.py [--date YYYY-MM-DD] [--mode rail|bus|both]

`fetch_metro_lines.count_line_frequency` answers "how often does this line run", which
is the grain the map's line-width layer needs. This answers "how often does service run
between these two stops", which is the grain a segment layer needs, and the two are not
the same question anywhere a line branches, short-turns or loops.

The output is printed, not committed. The design drafts bake the figures they quote and
this script is what makes them checkable; a payload under `src/data/` would be a second
thing to keep in sync with a timetable nobody has asked the app to track yet.

Segments are undirected. Direction is the one distinction this whole pipeline collapses
-- the ridership export has no direction field, so a segment layer that carried one could
never be joined to a boardings figure.
"""

import argparse
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

from fetch_metro_lines import GTFS_URLS, fetch_gtfs  # noqa: E402
from stop_identity import stop_key  # noqa: E402

WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# The lettered rail lines, so the report can name them the way the app does.
RAIL_LINE_NAMES = {
    "801": "A Line", "802": "B Line", "803": "C Line",
    "804": "E Line", "805": "D Line", "806": "L Line", "807": "K Line",
}


def active_services(get_file, on: date) -> set[str]:
    """Service ids running on one date, with `calendar_dates.txt` exceptions applied."""
    day = WEEKDAY_NAMES[on.weekday()]
    stamp = on.strftime("%Y%m%d")

    active = set()
    for row in get_file("calendar.txt"):
        if row.get(day) != "1":
            continue
        if row.get("start_date", "") <= stamp <= row.get("end_date", "99999999"):
            active.add(row["service_id"])

    for row in get_file("calendar_dates.txt"):
        if row.get("date") != stamp:
            continue
        if row.get("exception_type") == "1":
            active.add(row["service_id"])
        elif row.get("exception_type") == "2":
            active.discard(row["service_id"])

    return active


def segment_counts(get_file, mode: str, on: date):
    """Weekday departures per segment, per route, keyed by a pair of stop keys.

    Returns `(by_route, route_names)` where `by_route[route_id][(key_a, key_b)]` is the
    number of trips that ran between those two stops, in either direction.
    """
    services = active_services(get_file, on)
    if not services:
        raise RuntimeError(f"No service active on {on.isoformat()} in the {mode} feed.")

    trip_route = {}
    for row in get_file("trips.txt"):
        if row["service_id"] in services:
            trip_route[row["trip_id"]] = row["route_id"]

    route_names = {}
    for row in get_file("routes.txt"):
        route_names[row["route_id"]] = (
            row.get("route_short_name") or row.get("route_long_name") or row["route_id"]
        )

    stop_names = {row["stop_id"]: row["stop_name"] for row in get_file("stops.txt")}

    # Group the stop_times rows of every counted trip, then walk each trip in order. The
    # feed is large enough that this is the one place worth being careful about memory.
    trip_stops = defaultdict(list)
    for row in get_file("stop_times.txt"):
        trip_id = row["trip_id"]
        if trip_id in trip_route:
            trip_stops[trip_id].append((int(row["stop_sequence"]), row["stop_id"]))

    by_route = defaultdict(Counter)
    unnamed = 0
    for trip_id, stops in trip_stops.items():
        stops.sort()
        route_id = trip_route[trip_id]
        for (_, a), (_, b) in zip(stops, stops[1:]):
            name_a, name_b = stop_names.get(a), stop_names.get(b)
            if not name_a or not name_b:
                unnamed += 1
                continue
            try:
                key_a = stop_key(mode.capitalize(), name_a)
                key_b = stop_key(mode.capitalize(), name_b)
            except ValueError:
                unnamed += 1
                continue
            if key_a == key_b:
                continue  # the two kerbside poles of one named stop, which is not a segment
            by_route[route_id][tuple(sorted((key_a, key_b)))] += 1

    if unnamed:
        print(f"  {unnamed} stop pairs skipped for want of a usable name")

    return by_route, route_names


def describe(values: list[int]) -> str:
    """Min, median and max, which is all the shape a design draft needs."""
    if not values:
        return "no segments"
    return (
        f"{min(values)} to {max(values)}, median {int(statistics.median(values))}, "
        f"{len(values)} segments"
    )


def report_rail(by_route, route_names, on: date) -> None:
    print(f"\nRail — weekday departures per segment, {on.isoformat()}")
    for route_id in sorted(by_route, key=lambda r: RAIL_LINE_NAMES.get(r, r)):
        counts = by_route[route_id]
        name = RAIL_LINE_NAMES.get(route_id, route_names.get(route_id, route_id))
        values = sorted(counts.values())
        print(f"\n  {name}  ({describe(values)})")
        if len(set(values)) == 1:
            print("    Every segment carries the same count, so frequency is a property")
            print("    of the line here and a segment layer would draw one flat value.")
            continue
        for pair, count in sorted(counts.items(), key=lambda kv: -kv[1]):
            print(f"    {count:>4}  {pair[0]} — {pair[1]}")


def report_bus(by_route, route_names, on: date) -> None:
    print(f"\nBus — weekday departures per segment, {on.isoformat()}")
    all_values = []
    for route_id, counts in by_route.items():
        all_values.extend(counts.values())
    if not all_values:
        print("  No segments counted.")
        return

    all_values.sort()
    lo = all_values[len(all_values) // 20]
    hi = all_values[-len(all_values) // 20 - 1]
    print(f"  {len(all_values)} segments across {len(by_route)} routes")
    print(f"  {describe(all_values)}")
    print(f"  Middle nine tenths run {lo} to {hi}")

    flat = sum(1 for counts in by_route.values() if len(set(counts.values())) == 1)
    print(f"  {flat} of {len(by_route)} routes are flat across every one of their segments")

    print("\n  The ten routes whose segments vary most")
    spread = sorted(
        by_route.items(),
        key=lambda kv: max(kv[1].values()) - min(kv[1].values()),
        reverse=True,
    )[:10]
    for route_id, counts in spread:
        name = route_names.get(route_id, route_id)
        values = list(counts.values())
        print(f"    {name:>8}  {min(values)} to {max(values)} across {len(values)} segments")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date",
        default="2026-09-09",
        help="Service date to count, which must be a weekday (default 2026-09-09).",
    )
    parser.add_argument("--mode", choices=["rail", "bus", "both"], default="rail")
    args = parser.parse_args()

    on = datetime.strptime(args.date, "%Y-%m-%d").date()
    if on.weekday() > 4:
        parser.error(f"{args.date} is a {WEEKDAY_NAMES[on.weekday()]}; pick a weekday.")

    modes = ["rail", "bus"] if args.mode == "both" else [args.mode]
    for mode in modes:
        print(f"\nFetching the {mode} feed")
        get_file = fetch_gtfs(GTFS_URLS[mode])
        by_route, route_names = segment_counts(get_file, mode, on)
        (report_rail if mode == "rail" else report_bus)(by_route, route_names, on)


if __name__ == "__main__":
    main()
