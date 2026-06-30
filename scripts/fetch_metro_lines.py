"""
Fetches LA Metro GTFS data and converts route shapes to GeoJSON.
Run with: python scripts/fetch_metro_lines.py
Refresh monthly to keep route geometry up to date.

Output: public/metro_lines.geojson
"""

import io
import json
import zipfile
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).parent
OUT_PATH = SCRIPT_DIR / "../public/metro_lines.geojson"

GTFS_URLS = {
    "rail": "https://gitlab.com/LACMTA/gtfs_rail/-/raw/master/gtfs_rail.zip",
    "bus": "https://gitlab.com/LACMTA/gtfs_bus/-/raw/master/gtfs_bus.zip",
}

BRT_NAMES = {901: "G Line", 910: "J Line"}

RAIL_COLORS = {
    801: "#0072bc",
    802: "#eb131b",
    803: "#58a738",
    804: "#fdb913",
    805: "#a05da5",
    806: "#f9a825",
    807: "#e56db1",
    901: "#fc4c02",
    910: "#adB8bf",
}


def bus_line_color(line_id: int) -> str:
    """Deterministic HSL color using the golden-angle formula. Must match lines.ts."""
    hue = round((line_id * 137.508) % 360)
    return f"hsl({hue}, 75%, 45%)"


def split_csv_line(line: str) -> list[str]:
    """Splits a CSV line respecting quoted fields that may contain commas."""
    result = []
    current = ""
    in_quotes = False

    for ch in line:
        if ch == '"':
            in_quotes = not in_quotes       # toggle quoted-field mode
        elif ch == "," and not in_quotes:
            result.append(current.strip())  # commit field
            current = ""                    # start next field
        else:
            current += ch                   # accumulate character into current field

    result.append(current.strip())          # commit the final field
    return result


def parse_csv(text: str) -> list[dict]:
    """Parses a simple CSV string (no multi-line quoted fields) into a list of dicts.
    Handles quoted fields with commas inside them.
    """
    # strip \r for Windows line endings and drop blank lines
    lines = [line for line in text.replace("\r", "").split("\n") if line]
    if not lines:
        return []

    headers = split_csv_line(lines[0])  # first line is the header row
    rows = []
    for line in lines[1:]:
        values = split_csv_line(line)
        # map each data row to a dict keyed by header name
        rows.append({header: (values[idx] if idx < len(values) else "") for idx, header in enumerate(headers)})
    return rows


def fetch_gtfs(url: str):
    """Downloads a GTFS zip and returns a function to read files from it."""
    print(f"  Downloading {url} ...")
    response = requests.get(url, timeout=120)
    if not response.ok:
        raise RuntimeError(f"HTTP {response.status_code} from {url}")

    zip_file = zipfile.ZipFile(io.BytesIO(response.content))  # wrap bytes in a file-like object for ZipFile

    def get_file(name: str) -> list[dict]:  # closes over the open zip; returns [] when entry is absent
        try:
            return parse_csv(zip_file.read(name).decode("utf-8"))
        except KeyError:
            return []

    return get_file


def build_shape_points(shapes_raw: list[dict]) -> dict[str, list[dict]]:
    """Groups shape rows by shape_id and sorts each list by sequence number."""
    shape_points: dict[str, list[dict]] = {}
    # first pass: group point rows by shape_id
    for row in shapes_raw:
        sid = row["shape_id"]
        if sid not in shape_points:
            shape_points[sid] = []
        shape_points[sid].append({
            "seq": int(row["shape_pt_sequence"]),
            "lng": float(row["shape_pt_lon"]),
            "lat": float(row["shape_pt_lat"]),
        })
    # second pass: sort each shape's points by sequence number
    for sid in shape_points:
        shape_points[sid].sort(key=lambda point: point["seq"])
    return shape_points


def build_route_shapes(trips: list[dict]) -> dict[str, set[str]]:
    """Maps route_id → set of shape_ids via the trips table."""
    route_shapes: dict[str, set[str]] = {}
    for trip in trips:
        if not trip.get("route_id") or not trip.get("shape_id"):
            continue  # skip rows with missing IDs
        route_shapes.setdefault(trip["route_id"], set()).add(trip["shape_id"])
    return route_shapes


def resolve_rail_route(route: dict) -> tuple[int, str] | None:
    """Returns (line_id, name) for a rail route, or None to skip it."""
    try:
        line_id = int(route["route_id"])
    except (ValueError, KeyError):
        return None
    if line_id not in RAIL_COLORS:
        return None
    long_name = route.get("route_long_name", "")
    # Strip "Metro " prefix to get "A Line", "B Line", etc.
    if long_name.lower().startswith("metro "):
        long_name = long_name[6:].strip()
    name = long_name or f"Line {line_id}"
    return line_id, name


def resolve_bus_route(route: dict) -> tuple[int, str] | None:
    """Returns (line_id, name) for a bus/BRT route, or None to skip it."""
    short_name = route.get("route_short_name", "").strip()
    if not short_name:
        # BRT lines (G/J) have an empty short_name; fall back to the numeric prefix of route_id
        short_name = (route.get("route_id", "").split("-")[0]).strip()
    if not short_name:
        return None
    try:
        line_id = int(short_name)
    except ValueError:
        return None
    name = BRT_NAMES.get(line_id, f"Line {line_id}")
    return line_id, name


def get_coord_arrays(
    shape_ids: list[str], shape_points: dict[str, list[dict]], mode: str
) -> list[list[list[float]]] | None:
    """Returns coordinate arrays for a route, or None when no valid shapes exist.

    Rail includes all distinct shapes to capture branches. Bus picks only the
    single longest shape to keep the output file size manageable.
    """
    if mode == "Rail":
        arrays = [
            [[point["lng"], point["lat"]] for point in shape_points[sid]]
            for sid in shape_ids
            if sid in shape_points
        ]
        return arrays or None
    else:
        valid = [sid for sid in shape_ids if sid in shape_points]
        if not valid:
            return None
        longest = max(valid, key=lambda sid: len(shape_points[sid]))
        return [[[point["lng"], point["lat"]] for point in shape_points[longest]]]


def process_gtfs_feed(url: str, mode: str) -> list[dict]:
    """Builds GeoJSON features from one GTFS feed.

    Args:
        mode: 'Rail' or 'Bus'
    """
    get_file = fetch_gtfs(url)

    print("  Parsing routes...")
    routes = get_file("routes.txt")
    print("  Parsing trips...")
    trips = get_file("trips.txt")
    print("  Parsing shapes...")
    shapes_raw = get_file("shapes.txt")

    print("  Building shape geometries...")
    shape_points = build_shape_points(shapes_raw)
    route_shapes = build_route_shapes(trips)

    # select resolver based on feed mode
    resolve = resolve_rail_route if mode == "Rail" else resolve_bus_route
    features = []
    for route in routes:
        result = resolve(route)
        if result is None:
            continue
        line_id, name = result
        color = RAIL_COLORS.get(line_id) or bus_line_color(line_id)  # brand color for known IDs, generated hue for bus
        shape_ids = list(route_shapes.get(route["route_id"], set()))
        coord_arrays = get_coord_arrays(shape_ids, shape_points, mode)
        if not coord_arrays:
            continue
        features.append({
            "type": "Feature",
            "properties": {"line_id": line_id, "name": name, "color": color, "mode": mode},
            "geometry": {"type": "MultiLineString", "coordinates": coord_arrays},
        })
    return features


def main() -> None:
    """Fetches both GTFS feeds, merges the features, and writes metro_lines.geojson."""
    print("Fetching LA Metro GTFS data...\n")

    print("[Rail]")
    rail_features = process_gtfs_feed(GTFS_URLS["rail"], "Rail")
    print(f"  Built {len(rail_features)} rail features\n")

    print("[Bus]")
    bus_features = process_gtfs_feed(GTFS_URLS["bus"], "Bus")
    print(f"  Built {len(bus_features)} bus features\n")

    all_features = rail_features + bus_features  # merge rail and bus into one list
    geojson = {"type": "FeatureCollection", "features": all_features}  # GeoJSON FeatureCollection envelope

    OUT_PATH.write_text(json.dumps(geojson, indent=2), encoding="utf-8")
    print(f"Written to {OUT_PATH}")
    print(f"Total features: {len(all_features)}")


if __name__ == "__main__":
    main()
