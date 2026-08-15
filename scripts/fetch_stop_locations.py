"""
Geometry for the stop-level ridership pipeline.

The Excel exports Metro returns for a records request carry **no coordinates** — a bus
row identifies its stop by `STOP_NAME` alone, a rail row by `STATION_ORDER`. GTFS
`stops.txt` has the coordinates and the same names, so the join is by name: both sides
run through `stop_identity.stop_key`, which is what guarantees the keys written here are
the keys `convert_excel_ridership.aggregate_to_stop_ridership` produces.

Output: `src/data/stop_locations.json`

    {"generated_from": {...},
     "stops": {"bus:vermont-wilshire": {"name", "lat", "lon", "mode",
                                        "gtfs_stop_ids", "spread_m"}},
     "unmatched": [...]}

Run with: python scripts/fetch_stop_locations.py  (or `npm run fetch-stops`)

Four things about this file that look like choices and are load-bearing:

**Unmatched stops are kept, not dropped.** A stop with ridership and no geometry still
belongs in the series and in the ranked table; it is simply absent from the map layer.
Dropping it would change a line's stop count between months depending on when GTFS last
caught up with a rename — the same silent-divergence bug class the alias table exists to
prevent. The unmatched names are written into the JSON *and* printed as an alias-table
stub so the table can be extended.

**Bus stops sharing a name are centroided.** `STOP_NAME` is a name and not a `stop_id`,
so the two sides of a street are one ridership row and must become one dot. That is
fine at the median of 41 m across the 4,929 groups that have more than one member.
`spread_m` (the widest pairwise distance in the group) is emitted for every stop and
warned on above `SPREAD_WARN_M`.

**A name used by two different places gets no coordinate.** LA reuses intersection
names between cities: `Main / Pico` is downtown *and* in Santa Monica, 21 km apart, so
the centroid is in neither. Where the route shapes of the reporting lines can say which
one is meant, they do (`refine_by_line`). Where they cannot — and usually they cannot,
because each place is served by one of the reporting lines — the stop is written to
`unmatched` as `ambiguous-name` rather than given a midpoint that is simply wrong. This
is the one case where a stop *has* geometry in GTFS and still gets none here.

**Rail prefers the `location_type == 1` parent station.** Metro models most stations as
a parent plus platform children plus entrances (`location_type == 2`, excluded). Taking
the parent is literally "one dot per station", and it sidesteps the platform-suffix
problem wherever Metro bothers to model a parent.

There is deliberately **no timestamp** in `generated_from`: this file is committed, and a
wall-clock stamp would produce a diff on every run whether or not the geometry moved.
Feed identity plus a hash of the rows actually used says the same thing without the noise.
"""

import argparse
import hashlib
import json
import math
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import pandas as pd

import stop_identity
from convert_excel_ridership import (
    BUS_COLS,
    FILENAME_RE,
    INNER_FILENAME_RE,
    RAIL_COLS,
    ZIP_FILENAME_RE,
    _read_excel_bytes,
    aggregate_to_stop_ridership,
)
from fetch_metro_lines import (
    GTFS_URLS,
    build_route_shapes,
    build_shape_points,
    fetch_gtfs,
    resolve_bus_route,
    resolve_rail_route,
)

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"
DEFAULT_OUT_PATH = REPO_ROOT / "src" / "data" / "stop_locations.json"

# Above this, a group of same-named stops is probably not one place. Two sides of a
# street are ~20 m apart; a stop pair at either end of a long block is under 150 m.
SPREAD_WARN_M = 200.0

# How close a stop has to sit to a line's route shape to count as served by it. Generous
# on purpose: shapes are sampled polylines, so the distance to the nearest *vertex*
# overstates the distance to the route. It only has to separate candidates that are
# kilometres apart, and being generous is the safe direction — an over-tight value would
# reject a real stop and shrink the map.
NEAR_LINE_M = 150.0

# Past this, the group is not one stop with a wide footprint — it is one *name* used by
# two different places, and no single coordinate is right. `Main / Pico` is an
# intersection in downtown LA and another in Santa Monica, 21 km apart. Such a stop gets
# **no** coordinate rather than the midpoint, and is reported as `ambiguous-name`.
#
# The gap it sits in, measured rather than assumed: the widest group that survives is
# `bus:sunset-marquez` at 899.5 m, and the tightest genuinely-ambiguous one left after
# `refine_by_line` is `bus:foothill-osborne` at 1,485.4 m. Nothing lies between. Moving
# this constant below ~900 m starts discarding real stops.
AMBIGUOUS_M = 1_000.0

# GTFS `location_type`: 0 (or blank) is a stop/platform, 1 a parent station, 2 an
# entrance. Entrances are geometry for a station that already has a dot of its own.
STOP_OR_PLATFORM = "0"
PARENT_STATION = "1"

# Coordinates are rounded to six decimals — ~0.1 m at this latitude, which is finer than
# the underlying survey and keeps the committed file from carrying float noise.
COORD_PRECISION = 6

EARTH_RADIUS_M = 6_371_000.0


# --- geometry ---

def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in metres between two (lat, lon) pairs."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def max_pairwise_m(points: list[tuple[float, float]]) -> float:
    """The widest distance within a group of points; 0.0 for a group of one.

    Groups are tiny (the largest same-named bus group in the feed is a handful of
    stops), so the quadratic scan is cheaper than anything cleverer.
    """
    return max(
        (haversine_m(points[i], points[j])
         for i in range(len(points))
         for j in range(i + 1, len(points))),
        default=0.0,
    )


def _parse_point(row: dict) -> tuple[float, float] | None:
    """(lat, lon) from a stops.txt row, or None when either is missing or unparseable.

    A stop with no coordinate is not geometry; it must fall through to `unmatched`
    rather than be written as a dot at (0, 0) in the Gulf of Guinea.
    """
    try:
        return float(row["stop_lat"]), float(row["stop_lon"])
    except (KeyError, TypeError, ValueError):
        return None


# --- grouping stops.txt into one location per key ---

def _summarise_group(mode: str, members: list[dict]) -> dict:
    """Collapse the GTFS rows sharing a `stop_key` into one location.

    The coordinate is the centroid; `gtfs_stop_ids` and `spread_m` describe exactly the
    points that produced it, so a wide `spread_m` can always be traced back to the ids
    that caused it.
    """
    points = [member["point"] for member in members]
    return {
        # `min` rather than "first seen": stops.txt order is not guaranteed stable
        # between feed publications and this file is committed.
        "name": min(member["name"] for member in members),
        "lat": round(sum(p[0] for p in points) / len(points), COORD_PRECISION),
        "lon": round(sum(p[1] for p in points) / len(points), COORD_PRECISION),
        "mode": mode,
        "gtfs_stop_ids": sorted(member["stop_id"] for member in members),
        "spread_m": round(max_pairwise_m(points), 1),
    }


def _collect_members(rows: list[dict], mode: str, aliases: dict) -> dict[str, list[dict]]:
    """Bucket stops.txt rows by `stop_key`, dropping rows with no name or no coordinate."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        point = _parse_point(row)
        if point is None:
            continue
        try:
            key = stop_identity.stop_key(mode, row.get("stop_name"), aliases)
        except ValueError:
            continue  # blank or punctuation-only name; nothing to key on
        groups[key].append({
            "stop_id": row.get("stop_id", ""),
            "name": stop_identity.display_stop_name(mode, row["stop_name"]),
            "location_type": row.get("location_type", "") or STOP_OR_PLATFORM,
            "point": point,
        })
    return groups


def stop_candidates(rows: list[dict], mode: str, aliases: dict | None = None) -> dict[str, list[dict]]:
    """The GTFS stops that could be each `stop_key`, before anything is averaged.

    Kept separate from the averaging because a name shared by two genuinely different
    places can only be resolved once you know which lines report ridership there — see
    `refine_by_line`.

    Bus keeps `location_type` 0 only. Every row in Metro's bus feed carries a blank
    `location_type`, which GTFS defines as 0; the filter is here so a feed that starts
    modelling entrances does not silently drag them into a centroid.

    Rail keeps 0 and 1, and where a station is modelled as a parent (`1`) plus platforms
    (`0`), **only the parent survives** — one dot per station, and no dependence on how
    many platforms happen to be listed. Entrances (`2`) never contribute.
    """
    allowed = (STOP_OR_PLATFORM,) if mode == "Bus" else (STOP_OR_PLATFORM, PARENT_STATION)
    kept = [
        row for row in rows
        if (row.get("location_type", "") or STOP_OR_PLATFORM) in allowed
    ]
    groups = _collect_members(kept, mode, aliases)
    if mode == "Rail":
        groups = {
            key: [m for m in members if m["location_type"] == PARENT_STATION] or members
            for key, members in groups.items()
        }
    return groups


def group_bus_stops(rows: list[dict], aliases: dict | None = None) -> dict[str, dict]:
    """One location per bus `stop_key`, centroiding the stops that share a name."""
    return {
        key: _summarise_group("Bus", members)
        for key, members in stop_candidates(rows, "Bus", aliases).items()
    }


def group_rail_stops(rows: list[dict], aliases: dict | None = None) -> dict[str, dict]:
    """One location per rail `stop_key`, preferring the parent station."""
    return {
        key: _summarise_group("Rail", members)
        for key, members in stop_candidates(rows, "Rail", aliases).items()
    }


# --- telling two places with the same name apart ---

def build_line_shapes(get_file, mode: str) -> dict[int, list[tuple[float, float]]]:
    """`line_id -> every shape point that line runs over`, from the feed's own tables.

    Reuses `fetch_metro_lines`'s `build_shape_points` / `build_route_shapes` and its
    route resolvers, so "which line is this" is decided the same way here as it is for
    the route geometry on the map. Unlike `get_coord_arrays`, every shape is kept rather
    than the longest one — a stop on a short branch is exactly the case this has to
    catch.
    """
    shape_points = build_shape_points(get_file("shapes.txt"))
    route_shapes = build_route_shapes(get_file("trips.txt"))
    resolve = resolve_rail_route if mode == "Rail" else resolve_bus_route

    lines: dict[int, list[tuple[float, float]]] = defaultdict(list)
    for route in get_file("routes.txt"):
        resolved = resolve(route)
        if resolved is None:
            continue
        line_id, _ = resolved
        for shape_id in route_shapes.get(route["route_id"], ()):
            lines[line_id].extend(
                (point["lat"], point["lng"]) for point in shape_points.get(shape_id, ())
            )
    return dict(lines)


def near_any_point(
    point: tuple[float, float], others: list[tuple[float, float]], tolerance_m: float
) -> bool:
    """Whether `point` is within `tolerance_m` of any of `others`.

    Bounding-box rejection first, because the shape-point lists run to thousands of
    entries and almost every comparison is a miss by kilometres.
    """
    lat_span = tolerance_m / 111_320.0
    lon_span = lat_span / max(math.cos(math.radians(point[0])), 0.01)
    for other in others:
        if abs(other[0] - point[0]) > lat_span or abs(other[1] - point[1]) > lon_span:
            continue
        if haversine_m(point, other) <= tolerance_m:
            return True
    return False


def refine_by_line(
    members: list[dict],
    lines: set[int] | list[int],
    line_shapes: dict[int, list[tuple[float, float]]],
    tolerance_m: float = NEAR_LINE_M,
) -> list[dict]:
    """Narrow same-named GTFS stops to the ones on a line that reports ridership there.

    `Main / Pico` is an intersection in downtown LA and another in Santa Monica, 21 km
    apart. Averaging them puts the dot in neither. But the ridership row knows which
    *line* it is on, and a line only runs over one of the two, so the route shape tells
    them apart.

    Returns every member unchanged when the lines have no shapes, or when the filter
    would reject all of them — a stop with a bad centroid is still better than a stop
    that silently vanishes from the map.
    """
    points = [point for line in lines for point in line_shapes.get(int(line), ())]
    if not points:
        return list(members)
    kept = [m for m in members if near_any_point(m["point"], points, tolerance_m)]
    return kept or list(members)


def spread_warnings(stops: dict[str, dict], threshold: float = SPREAD_WARN_M) -> list[dict]:
    """The stops whose contributing points are too far apart to be one place."""
    return sorted(
        (dict(stop, stop_key=key) for key, stop in stops.items()
         if stop["spread_m"] > threshold),
        key=lambda stop: -stop["spread_m"],
    )


# --- the ridership side: which stop_keys need geometry ---

def iter_raw_frames(paths: list[Path]):
    """Yield `(df, year, month, mode)` for every monthly export under `paths`.

    Mirrors `convert_excel_ridership.convert_zip`'s two archive conventions. That
    function cannot be reused because it aggregates to line grain as it iterates; see
    the PR body — the iteration wants extracting, but not by this PR.
    """
    for path in paths:
        if path.suffix.lower() != ".zip":
            match = FILENAME_RE.match(path.name)
            if not match:
                continue
            month, year, mode = int(match.group(1)), int(match.group(2)), match.group(3).capitalize()
            cols = BUS_COLS if mode == "Bus" else RAIL_COLS
            yield _read_excel_bytes(path.read_bytes(), path.name, cols), year, month, mode
            continue

        typed = ZIP_FILENAME_RE.match(path.name)
        typed_mode = typed.group(1).capitalize() if typed else None
        with zipfile.ZipFile(path) as zf:
            for entry in sorted(zf.infolist(), key=lambda e: e.filename):
                basename = Path(entry.filename).name
                outer = FILENAME_RE.match(basename)
                if outer:
                    month, year = int(outer.group(1)), int(outer.group(2))
                    mode = outer.group(3).capitalize()
                else:
                    inner = INNER_FILENAME_RE.match(basename)
                    if not inner:
                        continue
                    if typed_mode is None:
                        # Same refusal as convert_zip. Skipping would drop the archive's
                        # stops out of the file entirely — not even into `unmatched`.
                        raise ValueError(
                            f"Cannot parse mode from '{path.name}'. Zips with "
                            "'YYYY-MM.xlsx' inner files must be named 'Bus YYYY.zip' "
                            "or 'Rail YYYY.zip'."
                        )
                    year, month, mode = int(inner.group(1)), int(inner.group(2)), typed_mode
                cols = BUS_COLS if mode == "Bus" else RAIL_COLS
                yield _read_excel_bytes(zf.read(entry.filename), basename, cols), year, month, mode


def collect_ridership_stops(paths: list[Path]) -> tuple[dict[str, dict], list[str]]:
    """Every `stop_key` that has ridership, and the months they came from.

    Goes through `aggregate_to_stop_ridership` rather than reading the names directly:
    the keys this file is written against must be produced by the same function the
    merge step will produce them with, or the join silently drops stops.
    """
    found: dict[str, dict] = {}
    months: set[str] = set()

    for df, year, month, mode in iter_raw_frames(paths):
        months.add(f"{year:04d}-{month:02d}")
        stops = aggregate_to_stop_ridership(df, year, month, mode)
        for key, name, line in zip(stops["stop_key"], stops["stop_name"], stops["line"]):
            entry = found.setdefault(key, {"name": name, "mode": mode, "lines": set()})
            entry["lines"].add(int(line))

    return found, sorted(months)


# --- the join ---

def join_locations(
    ridership: dict[str, dict],
    candidates: dict[str, list[dict]],
    line_shapes: dict[int, list[tuple[float, float]]] | None = None,
    ambiguous_m: float = AMBIGUOUS_M,
) -> tuple[dict[str, dict], list[dict], list[dict]]:
    """Attach geometry to the stops that have ridership.

    Returns `(stops, unmatched, refined)`. Only keys with ridership are written — the bus
    feed carries thousands of stops no export mentions, and this file is shipped to the
    client. Keys with ridership and no usable geometry go to `unmatched` with a `reason`;
    they are **not** dropped, because the ridership series and the ranked table still
    contain them. Two reasons occur:

    - `no-gtfs-match` — GTFS does not list the name at all, usually a rename the alias
      table has not caught up with.
    - `ambiguous-name` — GTFS lists it in two places more than `ambiguous_m` apart, so
      one coordinate cannot be right and none is written. `Main / Pico` is an
      intersection in downtown LA and another in Santa Monica.

    Before giving up on a wide group, its members are re-checked against the route shapes
    of the lines that report ridership there (`refine_by_line`); each narrowing is
    recorded in `refined` so the run says what it changed rather than quietly moving dots.
    That rescues a group whose stray members no reporting line runs past. It cannot
    rescue a name whose *two* places are each served by one of the reporting lines —
    which is most of them, and is why the `ambiguous-name` case exists.
    """
    stops, unmatched, refined = {}, [], []
    for key in sorted(ridership):
        entry = ridership[key]
        members = candidates.get(key)
        if not members:
            unmatched.append({
                "stop_key": key,
                "name": entry["name"],
                "mode": entry["mode"],
                "lines": sorted(entry["lines"]),
                "reason": "no-gtfs-match",
            })
            continue

        located = _summarise_group(entry["mode"], members)
        # Gated on `ambiguous_m`, not on the warning threshold: narrowing exists to
        # rescue a stop that would otherwise lose its coordinate, and a 300 m group is
        # not in that danger. `--spread-warn` stays purely cosmetic.
        if line_shapes and located["spread_m"] > ambiguous_m:
            kept = refine_by_line(members, entry["lines"], line_shapes)
            narrowed = _summarise_group(entry["mode"], kept)
            if narrowed["spread_m"] < located["spread_m"]:
                refined.append({
                    "stop_key": key,
                    "spread_before_m": located["spread_m"],
                    "spread_after_m": narrowed["spread_m"],
                    "dropped_gtfs_stop_ids": sorted(
                        set(located["gtfs_stop_ids"]) - set(narrowed["gtfs_stop_ids"])
                    ),
                })
                located = narrowed

        if located["spread_m"] > ambiguous_m:
            unmatched.append({
                "stop_key": key,
                "name": entry["name"],
                "mode": entry["mode"],
                "lines": sorted(entry["lines"]),
                "reason": "ambiguous-name",
                "spread_m": located["spread_m"],
                "gtfs_stop_ids": located["gtfs_stop_ids"],
            })
            continue

        stops[key] = located
    return stops, unmatched, refined


def needing_alias(unmatched: list[dict]) -> list[dict]:
    """The unmatched entries an alias could actually fix.

    Only `no-gtfs-match`. An `ambiguous-name` stop is one GTFS *does* list, twice, in two
    places — aliasing it would fold it onto one of them and assert a location the data
    does not support. Offering it in the paste-ready stub would be advice that is wrong.
    """
    return [u for u in unmatched if u.get("reason") == "no-gtfs-match"]


def alias_stub(unmatched: list[dict]) -> str:
    """The unmatched keys as a `stop_aliases.json` fragment, ready to paste and fill in.

    Valid JSON with no commentary, because the point is that it pastes verbatim; the
    names it corresponds to are printed above it. Every value is the empty string on
    purpose — the target is the name GTFS uses now, and only a human with a map can say
    what that is.
    """
    stub = {
        prefix: {
            u["stop_key"].split(":", 1)[1]: ""
            for u in unmatched
            if u["stop_key"].startswith(f"{prefix}:")
        }
        for prefix in ("bus", "rail")
    }
    return json.dumps(stub, indent=2)


# --- assembly ---

def _feed_provenance(url: str, rows: list[dict], feed_info: list[dict]) -> dict:
    """What identifies the feed this geometry came from.

    A content hash rather than a timestamp: Metro's rail feed publishes `feed_info.txt`
    with every date field blank, so the hash is the only thing that changes when the
    geometry does.
    """
    info = feed_info[0] if feed_info else {}
    digest = hashlib.sha256(
        json.dumps(rows, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "url": url,
        "feed_start_date": info.get("feed_start_date", ""),
        "feed_end_date": info.get("feed_end_date", ""),
        "stop_rows": len(rows),
        "stops_sha256": digest,
    }


def build_document(
    stops: dict[str, dict],
    unmatched: list[dict],
    feeds: dict[str, dict],
    archives: list[str],
    months: list[str],
    ridership_counts: dict[str, int],
    spread_warn_m: float = SPREAD_WARN_M,
    refined: list[dict] | None = None,
    ambiguous_m: float = AMBIGUOUS_M,
) -> dict:
    """The committed JSON. Every collection is sorted here rather than relied on from
    upstream, so two runs against one feed produce byte-identical output (ROADMAP
    risk 3)."""
    refined = refined or []
    matched: dict[str, int] = defaultdict(int)
    for key in stops:
        matched[key.split(":", 1)[0]] += 1

    return {
        "generated_from": {
            "gtfs": feeds,
            "ridership": {"archives": archives, "months": months},
            "stop_keys": dict(sorted(ridership_counts.items())),
            "matched": {mode: matched.get(mode, 0) for mode in sorted(ridership_counts)},
            "spread_warn_m": spread_warn_m,
            "near_line_m": NEAR_LINE_M,
            "ambiguous_m": ambiguous_m,
            # The whole record, not a count: a narrowed stop's entry is otherwise
            # indistinguishable from an ordinary group, and the evidence that its dot
            # moved 8.5 km would exist only in a console someone has since closed.
            "refined_by_line": sorted(refined, key=lambda r: r["stop_key"]),
        },
        "stops": {key: stops[key] for key in sorted(stops)},
        "unmatched": sorted(unmatched, key=lambda u: u["stop_key"]),
    }


def _raw_inputs(raw_dir: Path) -> list[Path]:
    archives = sorted(p for p in raw_dir.glob("*.zip"))
    archives += sorted(p for p in raw_dir.glob("*.xlsx") if FILENAME_RE.match(p.name))
    if not archives:
        raise SystemExit(
            f"No ridership archives found in {raw_dir}. The stop list this file is "
            "written against comes from the exports, not from GTFS."
        )
    return archives


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Join GTFS coordinates onto the stop names Metro's ridership "
                    "exports carry, and write src/data/stop_locations.json."
    )
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR,
                        help="directory of ridership archives (default: data/raw)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_PATH,
                        help="output path (default: src/data/stop_locations.json)")
    parser.add_argument("--spread-warn", type=float, default=SPREAD_WARN_M,
                        help=f"warn above this centroid spread in metres (default: {SPREAD_WARN_M:g})")
    parser.add_argument("--ambiguous", type=float, default=AMBIGUOUS_M,
                        help="above this spread, write no coordinate at all "
                             f"(default: {AMBIGUOUS_M:g})")
    args = parser.parse_args(argv)

    aliases = stop_identity.load_aliases()

    inputs = _raw_inputs(args.raw_dir)
    print(f"Reading ridership stops from {len(inputs)} archive(s) in {args.raw_dir}...")
    ridership, months = collect_ridership_stops(inputs)
    if not ridership:
        raise SystemExit(
            f"No monthly exports inside {args.raw_dir}. Expected 'MM-YYYY-{{Bus|Rail}}.xlsx' "
            "files, loose or inside a zip."
        )
    counts: dict[str, int] = defaultdict(int)
    for key in ridership:
        counts[key.split(":", 1)[0]] += 1
    print(f"  {len(ridership):,} stop keys over {len(months)} months "
          f"({months[0]} .. {months[-1]})")

    candidates: dict[str, list[dict]] = {}
    line_shapes: dict[int, list[tuple[float, float]]] = {}
    feeds: dict[str, dict] = {}
    for feed, url in GTFS_URLS.items():
        mode = "Rail" if feed == "rail" else "Bus"
        print(f"[{mode}]")
        get_file = fetch_gtfs(url)
        rows = get_file("stops.txt")
        feeds[feed] = _feed_provenance(url, rows, get_file("feed_info.txt"))
        keyed = stop_candidates(rows, mode, aliases)
        print(f"  {len(rows):,} stops.txt rows -> {len(keyed):,} keyed locations")
        candidates.update(keyed)
        print("  Reading route shapes to tell same-named stops apart...")
        # Merged rather than replaced: 901 and 910 resolve in both feeds, and the bus
        # feed is read second.
        for line_id, points in build_line_shapes(get_file, mode).items():
            line_shapes.setdefault(line_id, []).extend(points)

    stops, unmatched, refined = join_locations(
        ridership, candidates, line_shapes, args.ambiguous
    )

    print("\nMatch rate:")
    for prefix in sorted(counts):
        matched = sum(1 for key in stops if key.startswith(f"{prefix}:"))
        total = counts[prefix]
        print(f"  {prefix}: {matched:,}/{total:,} ({matched / total:.1%})")

    if refined:
        print(f"\n{len(refined)} stop(s) narrowed to the GTFS stops their own lines run "
              f"past (within {NEAR_LINE_M:g} m of the route shape):")
        for entry in sorted(refined, key=lambda e: -e["spread_before_m"]):
            print(f"  {entry['spread_before_m']:>9.1f} m -> {entry['spread_after_m']:>7.1f} m  "
                  f"{entry['stop_key']}  (dropped {', '.join(entry['dropped_gtfs_stop_ids'])})")

    warned = spread_warnings(stops, args.spread_warn)
    if warned:
        print(f"\n{len(warned)} stop(s) still above {args.spread_warn:g} m spread — a name "
              "reused by two places the same line runs past centroids into neither:")
        for stop in warned:
            print(f"  {stop['spread_m']:>8.1f} m  {stop['stop_key']}  "
                  f"({', '.join(stop['gtfs_stop_ids'])})")

    ambiguous = [u for u in unmatched if u["reason"] == "ambiguous-name"]
    if ambiguous:
        print(f"\n{len(ambiguous)} stop(s) name two places more than {args.ambiguous:g} m "
              "apart, so no single coordinate is right and none was written. They keep "
              "their ridership and are absent from the map layer:")
        for stop in sorted(ambiguous, key=lambda s: -s["spread_m"]):
            print(f"  {stop['spread_m']:>9.1f} m  {stop['stop_key']:<38} "
                  f"(line {', '.join(str(n) for n in stop['lines'])})")

    missing = needing_alias(unmatched)
    if missing:
        print(f"\n{len(missing)} stop(s) GTFS does not list at all. They are kept in the "
              "output and are simply absent from the map layer.")
        for stop in missing:
            print(f"  {stop['stop_key']:<44} {stop['name']}  "
                  f"(line {', '.join(str(n) for n in stop['lines'])})")
        print("\nPaste into scripts/stop_aliases.json, filling in the name GTFS uses now:")
        print(alias_stub(missing))

    document = build_document(
        stops, unmatched, feeds,
        archives=[p.name for p in inputs],
        months=months,
        ridership_counts=dict(counts),
        spread_warn_m=args.spread_warn,
        refined=refined,
        ambiguous_m=args.ambiguous,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(document, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )
    print(f"\nWritten to {args.out} ({args.out.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
