"""
Reads public/metro_lines.geojson and writes src/data/line_distances.json.
Distances are one-way route miles computed with the Haversine formula.
Rail lines store outbound + inbound as two lineStrings; only the outbound
leg is measured to avoid double-counting.
Run with: python scripts/compute_line_distances.py
"""

import json
import math
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
GEOJSON_PATH = SCRIPT_DIR / "../public/metro_lines.geojson"
OUTPUT_PATH = SCRIPT_DIR / "../src/data/line_distances.json"

EARTH_RADIUS_MILES = 3958.8
ROUND_TRIP_TOLERANCE = 0.001  # 0.001° ≈ 111 m at the equator; absorbs minor endpoint offsets in real GTFS data


def haversine_distance(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Returns the great-circle distance in miles between two coordinates using the
    Haversine formula: d = 2R · arcsin(√(sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)))
    Accurate to within ~0.5% for the distances involved in transit routes.
    """
    # convert degree differences to radians
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    # haversine term: sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
    haversine_term = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    # d = 2R · arcsin(√haversine_term)
    return EARTH_RADIUS_MILES * 2 * math.asin(math.sqrt(haversine_term))


def multi_line_string_distance(coordinates: list) -> float:
    """Returns the total route length in miles for a GeoJSON MultiLineString's
    coordinates array. Each lineString is summed independently (consecutive
    point pairs within a lineString are connected; separate lineStrings are not).
    """
    total = 0.0
    for line_string in coordinates:
        for i in range(1, len(line_string)):  # pair each point with the one before it
            total += haversine_distance(
                line_string[i - 1][0], line_string[i - 1][1],
                line_string[i][0], line_string[i][1],
            )
    return total


def is_round_trip(coordinates: list) -> bool:
    """Returns True when a MultiLineString encodes a round trip: two lineStrings where
    the second begins at the endpoint of the first (outbound + inbound directions).
    """
    if len(coordinates) != 2:
        return False
    outbound, inbound = coordinates
    end = outbound[-1]    # last point of the outbound leg
    start = inbound[0]    # first point of the inbound leg
    return (
        abs(end[0] - start[0]) < ROUND_TRIP_TOLERANCE
        and abs(end[1] - start[1]) < ROUND_TRIP_TOLERANCE
    )


if __name__ == "__main__":
    geojson = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))

    distances = {}
    for feature in geojson["features"]:
        line_id = feature["properties"]["line_id"]
        coords = feature["geometry"]["coordinates"]
        # Rail stores outbound + inbound; measure only the outbound leg.
        effective_coords = [coords[0]] if is_round_trip(coords) else coords
        miles = multi_line_string_distance(effective_coords)
        distances[str(line_id)] = round(miles * 10) / 10  # round to one decimal place

    OUTPUT_PATH.write_text(json.dumps(distances, indent=2), encoding="utf-8")
    print(f"Computed distances for {len(distances)} lines")
