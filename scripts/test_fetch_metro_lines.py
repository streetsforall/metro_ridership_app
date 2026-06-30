"""
Tests for fetch_metro_lines.py.

Unit tests cover CSV parsing, color generation, GTFS shape/route assembly,
and route-ID resolution. Integration tests for process_gtfs_feed patch out
the network layer so no real HTTP requests are made.
"""

import io
import re
import zipfile
from unittest.mock import MagicMock, patch

import pytest

from fetch_metro_lines import (
    build_route_shapes,
    build_shape_points,
    bus_line_color,
    fetch_gtfs,
    get_coord_arrays,
    parse_csv,
    process_gtfs_feed,
    resolve_bus_route,
    resolve_rail_route,
    split_csv_line,
)


# --- split_csv_line ---

def test_split_simple():
    assert split_csv_line("a,b,c") == ["a", "b", "c"]

def test_split_trims_whitespace():
    assert split_csv_line("a, b , c") == ["a", "b", "c"]

def test_split_quoted_commas():
    assert split_csv_line('"hello, world",b') == ["hello, world", "b"]

def test_split_multiple_quoted():
    assert split_csv_line('"a,b","c,d"') == ["a,b", "c,d"]

def test_split_empty_trailing_field():
    assert split_csv_line("a,b,") == ["a", "b", ""]

def test_split_single_field():
    assert split_csv_line("only") == ["only"]

def test_split_empty_string():
    assert split_csv_line("") == [""]


# --- parse_csv ---

def test_parse_empty():
    assert parse_csv("") == []

def test_parse_headers_only():
    assert parse_csv("id,name") == []

def test_parse_maps_to_objects():
    csv = "id,name\n1,Alice\n2,Bob"
    assert parse_csv(csv) == [{"id": "1", "name": "Alice"}, {"id": "2", "name": "Bob"}]

def test_parse_windows_line_endings():
    """\\r\\n line endings from Windows-generated GTFS files must be stripped."""
    csv = "id,name\r\n1,Alice\r\n2,Bob"
    assert parse_csv(csv) == [{"id": "1", "name": "Alice"}, {"id": "2", "name": "Bob"}]

def test_parse_quoted_fields_with_commas():
    csv = 'route_id,route_long_name\n801,"Metro A Line, Blue"'
    assert parse_csv(csv) == [{"route_id": "801", "route_long_name": "Metro A Line, Blue"}]

def test_parse_missing_trailing_fields():
    """Rows shorter than the header row must get empty strings for the missing columns."""
    csv = "a,b,c\n1,2"
    assert parse_csv(csv) == [{"a": "1", "b": "2", "c": ""}]

def test_parse_skips_blank_lines():
    csv = "id,name\n1,Alice\n\n2,Bob"
    assert parse_csv(csv) == [{"id": "1", "name": "Alice"}, {"id": "2", "name": "Bob"}]


# --- bus_line_color ---

def test_bus_color_hsl_format():
    assert re.match(r"^hsl\(\d+, 75%, 45%\)$", bus_line_color(1))

def test_bus_color_deterministic():
    assert bus_line_color(42) == bus_line_color(42)

def test_bus_color_different_ids():
    assert bus_line_color(1) != bus_line_color(2)

def test_bus_color_hue_range():
    for line_id in [1, 2, 10, 100, 500, 999]:
        match = re.match(r"^hsl\((\d+),", bus_line_color(line_id))
        hue = int(match.group(1))
        assert 0 <= hue < 360

def test_bus_color_golden_angle_formula():
    """Verifies the exact golden-angle formula: hue = round((line_id * 137.508) % 360)."""
    line_id = 5
    expected_hue = round((line_id * 137.508) % 360)
    assert bus_line_color(line_id) == f"hsl({expected_hue}, 75%, 45%)"


# --- helpers ---

def make_get_file(**files):
    """Fake get_file backed by pre-built data, replacing a real zip lookup."""
    def get_file(name):
        return files.get(name, [])
    return get_file

def _rail_shapes(shape_id="s1"):
    """Returns two shape-point rows for shape_id, enough to form a single segment."""
    return [
        {"shape_id": shape_id, "shape_pt_sequence": "1", "shape_pt_lon": "-118.0", "shape_pt_lat": "34.0"},
        {"shape_id": shape_id, "shape_pt_sequence": "2", "shape_pt_lon": "-118.1", "shape_pt_lat": "34.1"},
    ]


# --- fetch_gtfs ---

def test_fetch_gtfs_http_error():
    mock_res = MagicMock()
    mock_res.ok = False
    mock_res.status_code = 404
    with patch("fetch_metro_lines.requests.get", return_value=mock_res):
        with pytest.raises(RuntimeError, match="404"):
            fetch_gtfs("http://fake-url")

def test_fetch_gtfs_missing_zip_entry_returns_empty():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w"):
        pass
    buf.seek(0)
    mock_res = MagicMock()
    mock_res.ok = True
    mock_res.content = buf.read()
    with patch("fetch_metro_lines.requests.get", return_value=mock_res):
        get_file = fetch_gtfs("http://fake-url")
    assert get_file("missing.txt") == []


# --- process_gtfs_feed: Rail ---

def test_process_rail_feature_structure():
    routes = [{"route_id": "801", "route_long_name": "Metro A Line", "route_short_name": ""}]
    trips = [{"route_id": "801", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Rail")
    assert len(features) == 1
    feature = features[0]
    assert feature["type"] == "Feature"
    assert set(feature["properties"].keys()) == {"line_id", "name", "color", "mode"}
    assert feature["geometry"]["type"] == "MultiLineString"

def test_process_rail_strips_metro_prefix():
    routes = [{"route_id": "801", "route_long_name": "Metro A Line", "route_short_name": ""}]
    trips = [{"route_id": "801", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Rail")
    assert features[0]["properties"]["name"] == "A Line"

def test_process_rail_skips_unknown_route_id():
    routes = [{"route_id": "999", "route_long_name": "Unknown", "route_short_name": ""}]
    trips = [{"route_id": "999", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Rail")
    assert features == []

def test_process_rail_assigns_canonical_color():
    routes = [{"route_id": "801", "route_long_name": "Metro A Line", "route_short_name": ""}]
    trips = [{"route_id": "801", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Rail")
    assert features[0]["properties"]["color"] == "#0072bc"

def test_process_rail_includes_all_distinct_shapes():
    """Rail includes every distinct shape to capture branches, unlike Bus which picks one."""
    routes = [{"route_id": "801", "route_long_name": "Metro A Line", "route_short_name": ""}]
    trips = [{"route_id": "801", "shape_id": "s1"}, {"route_id": "801", "shape_id": "s2"}]
    shapes = _rail_shapes("s1") + _rail_shapes("s2")
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": shapes})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Rail")
    assert len(features[0]["geometry"]["coordinates"]) == 2

def test_process_rail_fallback_name_when_empty():
    routes = [{"route_id": "801", "route_long_name": "", "route_short_name": ""}]
    trips = [{"route_id": "801", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Rail")
    assert features[0]["properties"]["name"] == "Line 801"

def test_process_rail_sorts_shape_points_by_sequence():
    """Shape points in GTFS can arrive out of order; they must be sorted by sequence."""
    routes = [{"route_id": "801", "route_long_name": "Metro A Line", "route_short_name": ""}]
    trips = [{"route_id": "801", "shape_id": "s1"}]
    shapes = [
        {"shape_id": "s1", "shape_pt_sequence": "3", "shape_pt_lon": "-118.3", "shape_pt_lat": "34.3"},
        {"shape_id": "s1", "shape_pt_sequence": "1", "shape_pt_lon": "-118.1", "shape_pt_lat": "34.1"},
        {"shape_id": "s1", "shape_pt_sequence": "2", "shape_pt_lon": "-118.2", "shape_pt_lat": "34.2"},
    ]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": shapes})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Rail")
    first_coord = features[0]["geometry"]["coordinates"][0][0]
    assert first_coord == [-118.1, 34.1]


# --- process_gtfs_feed: Bus ---

def test_process_bus_uses_route_short_name():
    routes = [{"route_id": "2-100", "route_short_name": "2", "route_long_name": ""}]
    trips = [{"route_id": "2-100", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Bus")
    assert features[0]["properties"]["line_id"] == 2
    assert features[0]["properties"]["name"] == "Line 2"

def test_process_bus_brt_fallback_901():
    """BRT lines have an empty short name; line_id is parsed from the route_id prefix."""
    routes = [{"route_id": "901-13201", "route_short_name": "", "route_long_name": ""}]
    trips = [{"route_id": "901-13201", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Bus")
    assert features[0]["properties"]["line_id"] == 901
    assert features[0]["properties"]["name"] == "G Line"

def test_process_bus_brt_fallback_910():
    """BRT lines have an empty short name; line_id is parsed from the route_id prefix."""
    routes = [{"route_id": "910-xxx", "route_short_name": "", "route_long_name": ""}]
    trips = [{"route_id": "910-xxx", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Bus")
    assert features[0]["properties"]["name"] == "J Line"

def test_process_bus_picks_longest_shape():
    """Bus picks only the longest shape to keep file size manageable."""
    routes = [{"route_id": "2-100", "route_short_name": "2", "route_long_name": ""}]
    trips = [{"route_id": "2-100", "shape_id": "short"}, {"route_id": "2-100", "shape_id": "long"}]
    shapes = [
        {"shape_id": "short", "shape_pt_sequence": "1", "shape_pt_lon": "-118.0", "shape_pt_lat": "34.0"},
        {"shape_id": "short", "shape_pt_sequence": "2", "shape_pt_lon": "-118.1", "shape_pt_lat": "34.1"},
        {"shape_id": "long", "shape_pt_sequence": "1", "shape_pt_lon": "-118.0", "shape_pt_lat": "34.0"},
        {"shape_id": "long", "shape_pt_sequence": "2", "shape_pt_lon": "-118.1", "shape_pt_lat": "34.1"},
        {"shape_id": "long", "shape_pt_sequence": "3", "shape_pt_lon": "-118.2", "shape_pt_lat": "34.2"},
    ]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": shapes})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Bus")
    coords = features[0]["geometry"]["coordinates"]
    assert len(coords) == 1
    assert len(coords[0]) == 3

def test_process_bus_uses_bus_line_color():
    routes = [{"route_id": "2-100", "route_short_name": "2", "route_long_name": ""}]
    trips = [{"route_id": "2-100", "shape_id": "s1"}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": trips, "shapes.txt": _rail_shapes()})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Bus")
    assert features[0]["properties"]["color"] == bus_line_color(2)

def test_process_skips_route_with_no_trips():
    routes = [{"route_id": "801", "route_long_name": "Metro A Line", "route_short_name": ""}]
    data = make_get_file(**{"routes.txt": routes, "trips.txt": [], "shapes.txt": []})
    with patch("fetch_metro_lines.fetch_gtfs", return_value=data):
        features = process_gtfs_feed("http://fake", "Rail")
    assert features == []


# --- build_shape_points ---

def test_build_shape_points_groups_by_shape_id():
    rows = [
        {"shape_id": "a", "shape_pt_sequence": "1", "shape_pt_lon": "-118.0", "shape_pt_lat": "34.0"},
        {"shape_id": "b", "shape_pt_sequence": "1", "shape_pt_lon": "-118.1", "shape_pt_lat": "34.1"},
        {"shape_id": "a", "shape_pt_sequence": "2", "shape_pt_lon": "-118.2", "shape_pt_lat": "34.2"},
    ]
    result = build_shape_points(rows)
    assert set(result.keys()) == {"a", "b"}
    assert len(result["a"]) == 2
    assert len(result["b"]) == 1

def test_build_shape_points_sorts_by_sequence():
    rows = [
        {"shape_id": "a", "shape_pt_sequence": "3", "shape_pt_lon": "-118.3", "shape_pt_lat": "34.3"},
        {"shape_id": "a", "shape_pt_sequence": "1", "shape_pt_lon": "-118.1", "shape_pt_lat": "34.1"},
        {"shape_id": "a", "shape_pt_sequence": "2", "shape_pt_lon": "-118.2", "shape_pt_lat": "34.2"},
    ]
    result = build_shape_points(rows)
    seqs = [p["seq"] for p in result["a"]]
    assert seqs == [1, 2, 3]

def test_build_shape_points_parses_numeric_types():
    rows = [{"shape_id": "a", "shape_pt_sequence": "5", "shape_pt_lon": "-118.5", "shape_pt_lat": "34.5"}]
    result = build_shape_points(rows)
    point = result["a"][0]
    assert isinstance(point["seq"], int)
    assert isinstance(point["lng"], float)
    assert isinstance(point["lat"], float)
    assert point["lng"] == -118.5
    assert point["lat"] == 34.5


# --- build_route_shapes ---

def test_build_route_shapes_maps_route_to_shapes():
    trips = [
        {"route_id": "801", "shape_id": "s1"},
        {"route_id": "801", "shape_id": "s2"},
        {"route_id": "802", "shape_id": "s3"},
    ]
    result = build_route_shapes(trips)
    assert result["801"] == {"s1", "s2"}
    assert result["802"] == {"s3"}

def test_build_route_shapes_skips_missing_fields():
    trips = [
        {"route_id": "801"},           # no shape_id
        {"shape_id": "s1"},            # no route_id
        {"route_id": "", "shape_id": "s2"},  # empty route_id
    ]
    result = build_route_shapes(trips)
    assert result == {}

def test_build_route_shapes_deduplicates_same_shape():
    trips = [
        {"route_id": "801", "shape_id": "s1"},
        {"route_id": "801", "shape_id": "s1"},
    ]
    result = build_route_shapes(trips)
    assert result["801"] == {"s1"}


# --- resolve_rail_route ---

def test_resolve_rail_returns_line_id_and_name():
    result = resolve_rail_route({"route_id": "801", "route_long_name": "Metro A Line"})
    assert result == (801, "A Line")

def test_resolve_rail_strips_metro_prefix():
    result = resolve_rail_route({"route_id": "802", "route_long_name": "Metro B Line"})
    assert result[1] == "B Line"

def test_resolve_rail_fallback_name_when_empty():
    result = resolve_rail_route({"route_id": "801", "route_long_name": ""})
    assert result == (801, "Line 801")

def test_resolve_rail_returns_none_for_non_numeric_id():
    assert resolve_rail_route({"route_id": "abc", "route_long_name": "X"}) is None

def test_resolve_rail_returns_none_when_not_in_rail_colors():
    assert resolve_rail_route({"route_id": "999", "route_long_name": "Unknown"}) is None


# --- resolve_bus_route ---

def test_resolve_bus_uses_short_name():
    result = resolve_bus_route({"route_id": "2-100", "route_short_name": "2"})
    assert result == (2, "Line 2")

def test_resolve_bus_brt_fallback_901():
    """When route_short_name is empty, falls back to the numeric prefix of route_id."""
    result = resolve_bus_route({"route_id": "901-13201", "route_short_name": ""})
    assert result == (901, "G Line")

def test_resolve_bus_brt_fallback_910():
    """When route_short_name is empty, falls back to the numeric prefix of route_id."""
    result = resolve_bus_route({"route_id": "910-xxx", "route_short_name": ""})
    assert result == (910, "J Line")

def test_resolve_bus_returns_none_when_no_name():
    assert resolve_bus_route({"route_id": "", "route_short_name": ""}) is None

def test_resolve_bus_returns_none_for_non_numeric_short_name():
    assert resolve_bus_route({"route_id": "X-100", "route_short_name": "X"}) is None


# --- get_coord_arrays ---

def _make_shape_points(*lnglats):
    """Builds a shape-point list from (lng, lat) pairs, assigning sequential seq values."""
    return [{"seq": i + 1, "lng": lng, "lat": lat} for i, (lng, lat) in enumerate(lnglats)]

def test_get_coord_arrays_rail_returns_all_shapes():
    shape_points = {
        "s1": _make_shape_points((-118.0, 34.0), (-118.1, 34.1)),
        "s2": _make_shape_points((-118.2, 34.2), (-118.3, 34.3)),
    }
    result = get_coord_arrays(["s1", "s2"], shape_points, "Rail")
    assert result is not None
    assert len(result) == 2

def test_get_coord_arrays_rail_skips_missing_shape_id():
    shape_points = {"s1": _make_shape_points((-118.0, 34.0), (-118.1, 34.1))}
    result = get_coord_arrays(["s1", "missing"], shape_points, "Rail")
    assert result is not None
    assert len(result) == 1

def test_get_coord_arrays_bus_picks_longest():
    shape_points = {
        "short": _make_shape_points((-118.0, 34.0), (-118.1, 34.1)),
        "long":  _make_shape_points((-118.0, 34.0), (-118.1, 34.1), (-118.2, 34.2)),
    }
    result = get_coord_arrays(["short", "long"], shape_points, "Bus")
    assert result is not None
    assert len(result) == 1
    assert len(result[0]) == 3

def test_get_coord_arrays_bus_coordinate_format():
    shape_points = {"s1": _make_shape_points((-118.5, 34.5), (-118.6, 34.6))}
    result = get_coord_arrays(["s1"], shape_points, "Bus")
    assert result == [[[-118.5, 34.5], [-118.6, 34.6]]]

def test_get_coord_arrays_returns_none_when_no_valid_shapes():
    assert get_coord_arrays(["missing"], {}, "Rail") is None
    assert get_coord_arrays(["missing"], {}, "Bus") is None
