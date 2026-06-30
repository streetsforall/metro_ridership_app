"""
Tests for compute_line_distances.py.

Unit tests cover the Haversine formula, multi-segment accumulation, and
round-trip detection. Integration tests pin known one-way distances for
specific Metro bus and rail lines against the live metro_lines.geojson file.
"""

import json
from pathlib import Path

import pytest

from compute_line_distances import haversine_distance, is_round_trip, multi_line_string_distance

GEOJSON_PATH = Path(__file__).parent / "../public/metro_lines.geojson"
_geojson = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))


def compute_line_miles(line_id: int) -> float:
    """Looks up line_id in the GeoJSON fixture and returns its one-way distance in
    miles rounded to one decimal — mirroring the logic in the __main__ block.
    """
    feature = next(feat for feat in _geojson["features"] if feat["properties"]["line_id"] == line_id)
    coords = feature["geometry"]["coordinates"]
    effective = [coords[0]] if is_round_trip(coords) else coords
    miles = multi_line_string_distance(effective)
    return round(miles * 10) / 10


# --- haversine_distance ---

def test_haversine_same_point_origin():
    assert haversine_distance(0, 0, 0, 0) == 0

def test_haversine_same_point_la():
    assert haversine_distance(-118.2, 34.05, -118.2, 34.05) == 0

def test_haversine_one_degree_latitude():
    """One degree of latitude ≈ 69 miles; checks the formula is in the right ballpark."""
    assert abs(haversine_distance(0, 0, 0, 1) - 69.09) < 1

def test_haversine_is_symmetric():
    dist_forward = haversine_distance(-73.9857, 40.7484, -118.2437, 34.0522)
    dist_reverse = haversine_distance(-118.2437, 34.0522, -73.9857, 40.7484)
    assert abs(dist_forward - dist_reverse) < 1e-8

def test_haversine_cross_country_range():
    """NYC to LA is ~2,445 miles by great circle; sanity-checks the output magnitude."""
    distance = haversine_distance(-73.9857, 40.7484, -118.2437, 34.0522)
    assert 2400 < distance < 2500


# --- multi_line_string_distance ---

def test_multi_empty():
    assert multi_line_string_distance([]) == 0

def test_multi_single_point():
    assert multi_line_string_distance([[[0, 0]]]) == 0

def test_multi_single_segment():
    coords = [[[0, 0], [0, 1]]]
    expected = haversine_distance(0, 0, 0, 1)
    assert abs(multi_line_string_distance(coords) - expected) < 1e-8

def test_multi_consecutive_segments():
    coords = [[[0, 0], [0, 1], [0, 2]]]
    expected = haversine_distance(0, 0, 0, 1) + haversine_distance(0, 1, 0, 2)
    assert abs(multi_line_string_distance(coords) - expected) < 1e-8

def test_multi_across_linestrings():
    coords = [[[0, 0], [0, 1]], [[10, 10], [10, 11]]]
    expected = haversine_distance(0, 0, 0, 1) + haversine_distance(10, 10, 10, 11)
    assert abs(multi_line_string_distance(coords) - expected) < 1e-8

def test_multi_no_phantom_segment():
    """The gap between separate lineStrings must not be counted as a segment.
    two_separate < joined because joined adds a long cross-globe leg between them.
    """
    two_separate = [[[0, 0], [0, 1]], [[100, 0], [100, 1]]]
    joined = [[[0, 0], [0, 1], [100, 0], [100, 1]]]
    assert multi_line_string_distance(two_separate) < multi_line_string_distance(joined)


# --- is_round_trip ---

def test_round_trip_detected():
    """Second lineString starts at the endpoint of the first (outbound A→B, inbound B→A)."""
    outbound = [[0, 0], [0, 1], [0, 2]]
    inbound  = [[0, 2], [0, 1], [0, 0]]
    assert is_round_trip([outbound, inbound]) is True

def test_round_trip_single_linestring():
    assert is_round_trip([[[0, 0], [0, 1]]]) is False

def test_round_trip_three_linestrings():
    line_string = [[0, 0], [0, 1]]
    assert is_round_trip([line_string, line_string, line_string]) is False

def test_round_trip_different_start():
    first_leg  = [[0, 0], [0, 1]]
    second_leg = [[10, 10], [10, 11]]  # starts somewhere else entirely
    assert is_round_trip([first_leg, second_leg]) is False

def test_round_trip_tolerance():
    """Real GTFS data has endpoint offsets up to ~0.0002° at line junctions;
    the 0.001° tolerance must absorb them without triggering a false negative.
    """
    first_leg  = [[0, 0], [-118.378153841, 34.1708482878]]
    second_leg = [[-118.378268605, 34.1708004635], [0, 0]]  # 0.000115° lon, 0.000048° lat apart
    assert is_round_trip([first_leg, second_leg]) is True

def test_round_trip_exceeds_tolerance():
    """0.002° gap is larger than the 0.001° threshold and must not be treated as a junction."""
    first_leg  = [[0, 0], [0, 1]]
    second_leg = [[0, 1.002], [0, 0]]
    assert is_round_trip([first_leg, second_leg]) is False


# Bus lines have a single lineString, so isRoundTrip returns False and the full
# route is summed without any deduplication.

def test_bus_line_2():
    assert compute_line_miles(2) == 20.6

def test_bus_line_4():
    assert compute_line_miles(4) == 21.8

def test_bus_line_14():
    assert compute_line_miles(14) == 16.8

def test_bus_lines_not_round_trips():
    """Bus routes have a single lineString, so is_round_trip must return False,
    ensuring their full length is counted without the one-way guard.
    """
    for line_id in [2, 4, 14]:
        feature = next(feat for feat in _geojson["features"] if feat["properties"]["line_id"] == line_id)
        assert is_round_trip(feature["geometry"]["coordinates"]) is False, f"line {line_id}"


# Metro Rail lines have two lineStrings (outbound + inbound). Expected values below
# are one-way distances; without the is_round_trip guard they would be doubled
# (e.g. A Line would read 115.5 mi instead of 57.8 mi).

def test_rail_line_801():
    assert compute_line_miles(801) == 57.8

def test_rail_line_802():
    assert compute_line_miles(802) == 15.7

def test_rail_line_803():
    assert compute_line_miles(803) == 17.7

def test_rail_line_804():
    assert compute_line_miles(804) == 22.0

def test_rail_line_805():
    assert compute_line_miles(805) == 9.7

def test_rail_line_807():
    assert compute_line_miles(807) == 11.6

def test_rail_lines_are_round_trips():
    """Metro Rail stores outbound + inbound as two lineStrings; is_round_trip must
    detect this so compute_line_miles measures only the outbound leg.
    """
    for line_id in [801, 802, 803, 804, 805, 807]:
        feature = next(feat for feat in _geojson["features"] if feat["properties"]["line_id"] == line_id)
        assert is_round_trip(feature["geometry"]["coordinates"]) is True, f"line {line_id}"


# --- round-trip double-counting guard ---

def test_round_trip_guard_counts_once():
    """Without the guard a bidirectional pair doubles the distance. Verifies that
    applying the guard yields exactly one-way distance and that omitting it doubles it.
    """
    outbound = [[0, 0], [0, 1]]
    inbound  = [[0, 1], [0, 0]]
    coords = [outbound, inbound]

    one_way = multi_line_string_distance([coords[0]])
    with_guard = multi_line_string_distance([coords[0]] if is_round_trip(coords) else coords)
    without_guard = multi_line_string_distance(coords)

    assert abs(with_guard - one_way) < 1e-8
    assert abs(without_guard - one_way * 2) < 1e-8
