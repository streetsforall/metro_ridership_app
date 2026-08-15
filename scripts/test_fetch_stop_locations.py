"""
Tests for fetch_stop_locations.py.

Synthetic `stops.txt` rows throughout — no network, and no dependency on what the
live GTFS feed happens to contain this week. The four behaviours that are load-bearing
and would be silent if they broke:

- bus stops sharing a name become one centroid, keeping every contributing stop_id
- `spread_m` measures the group and the warning fires above the threshold
- rail prefers the `location_type == 1` parent station over its platforms
- a stop with ridership and no geometry is **retained** in `unmatched`, not dropped
"""

import json

import pytest

from fetch_stop_locations import (
    SPREAD_WARN_M,
    alias_stub,
    build_document,
    drop_unnamed_rows,
    group_bus_stops,
    group_rail_stops,
    haversine_m,
    join_locations,
    max_pairwise_m,
    spread_warnings,
)

import pandas as pd


# --- helpers ---

def stop_row(stop_id, name, lat, lon, location_type="", parent=""):
    """One stops.txt row, with the columns this script reads."""
    return {
        "stop_id": stop_id,
        "stop_name": name,
        "stop_lat": str(lat),
        "stop_lon": str(lon),
        "location_type": location_type,
        "parent_station": parent,
    }


# Two sides of Vermont at Wilshire: ~40 m apart, which is the ordinary case.
VERMONT_NORTH = (34.062000, -118.291000)
VERMONT_SOUTH = (34.061640, -118.291000)


# --- haversine_m / max_pairwise_m ---

def test_haversine_zero_for_identical_points():
    assert haversine_m(VERMONT_NORTH, VERMONT_NORTH) == 0.0

def test_haversine_matches_known_separation():
    """0.001 degrees of latitude is ~111 m anywhere on Earth."""
    assert haversine_m((34.0, -118.0), (34.001, -118.0)) == pytest.approx(111.2, abs=0.5)

def test_haversine_is_symmetric():
    assert haversine_m(VERMONT_NORTH, VERMONT_SOUTH) == pytest.approx(
        haversine_m(VERMONT_SOUTH, VERMONT_NORTH)
    )

def test_max_pairwise_of_single_point_is_zero():
    assert max_pairwise_m([VERMONT_NORTH]) == 0.0

def test_max_pairwise_takes_the_widest_pair():
    """Not the first pair, and not the sum — the widest separation in the group."""
    points = [(34.0, -118.0), (34.001, -118.0), (34.002, -118.0)]
    assert max_pairwise_m(points) == pytest.approx(222.4, abs=1.0)


# --- group_bus_stops: the centroid ---

def test_bus_stops_sharing_a_name_become_one_centroid():
    rows = [
        stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH),
        stop_row("222", "Vermont / Wilshire", *VERMONT_SOUTH),
    ]
    located = group_bus_stops(rows)
    assert list(located) == ["bus:vermont-wilshire"]
    stop = located["bus:vermont-wilshire"]
    assert stop["lat"] == pytest.approx((VERMONT_NORTH[0] + VERMONT_SOUTH[0]) / 2)
    assert stop["lon"] == pytest.approx(-118.291)

def test_bus_centroid_records_every_contributing_stop_id():
    """The ids are what makes a suspicious spread_m traceable."""
    rows = [
        stop_row("222", "Vermont / Wilshire", *VERMONT_NORTH),
        stop_row("111", "Vermont / Wilshire", *VERMONT_SOUTH),
    ]
    located = group_bus_stops(rows)
    assert located["bus:vermont-wilshire"]["gtfs_stop_ids"] == ["111", "222"]

def test_bus_names_differing_only_in_spacing_fold_onto_one_key():
    """Normalisation is stop_identity's; this asserts the join goes through it."""
    rows = [
        stop_row("111", "Pacific /RR-Xing", *VERMONT_NORTH),
        stop_row("222", "Pacific / RR-Xing", *VERMONT_SOUTH),
    ]
    assert len(group_bus_stops(rows)) == 1

def test_bus_stop_with_no_coordinate_is_skipped():
    rows = [stop_row("111", "Vermont / Wilshire", "", "")]
    assert group_bus_stops(rows) == {}

def test_bus_stop_with_no_name_is_skipped_rather_than_raising():
    """A blank name has no key. It must not take the whole run down with it."""
    rows = [
        stop_row("111", "", *VERMONT_NORTH),
        stop_row("222", "Vermont / Wilshire", *VERMONT_SOUTH),
    ]
    assert list(group_bus_stops(rows)) == ["bus:vermont-wilshire"]

def test_bus_excludes_non_stop_location_types():
    """Metro's bus feed leaves location_type blank, which GTFS defines as 0. An
    entrance appearing in a future feed must not drag the centroid toward the door."""
    rows = [
        stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH),
        stop_row("999", "Vermont / Wilshire", 34.10, -118.29, location_type="2"),
    ]
    located = group_bus_stops(rows)
    assert located["bus:vermont-wilshire"]["gtfs_stop_ids"] == ["111"]

def test_bus_applies_the_alias_table():
    aliases = {"bus": {"old-corner": "new-corner"}}
    rows = [stop_row("111", "Old Corner", *VERMONT_NORTH)]
    assert list(group_bus_stops(rows, aliases)) == ["bus:new-corner"]


# --- spread_m and its warning threshold ---

def test_spread_m_is_zero_for_a_lone_stop():
    rows = [stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH)]
    assert group_bus_stops(rows)["bus:vermont-wilshire"]["spread_m"] == 0.0

def test_spread_m_measures_two_sides_of_a_street():
    rows = [
        stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH),
        stop_row("222", "Vermont / Wilshire", *VERMONT_SOUTH),
    ]
    assert group_bus_stops(rows)["bus:vermont-wilshire"]["spread_m"] == pytest.approx(40, abs=2)

def test_ordinary_street_pair_does_not_warn():
    rows = [
        stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH),
        stop_row("222", "Vermont / Wilshire", *VERMONT_SOUTH),
    ]
    assert spread_warnings(group_bus_stops(rows)) == []

def test_name_reused_by_two_different_places_warns():
    """"Main / Pico" exists in both downtown LA and Santa Monica. The centroid lands
    in neither, and the warning is the only thing that says so."""
    rows = [
        stop_row("111", "Main / Pico", 34.0407, -118.2468),
        stop_row("222", "Main / Pico", 34.0110, -118.4900),
    ]
    warned = spread_warnings(group_bus_stops(rows))
    assert [w["stop_key"] for w in warned] == ["bus:main-pico"]
    assert warned[0]["spread_m"] > 20_000

def test_warning_threshold_is_configurable():
    rows = [
        stop_row("111", "Vermont / Wilshire", 34.000000, -118.0),
        stop_row("222", "Vermont / Wilshire", 34.001000, -118.0),  # ~111 m
    ]
    located = group_bus_stops(rows)
    assert spread_warnings(located, threshold=200.0) == []
    assert len(spread_warnings(located, threshold=100.0)) == 1

def test_warnings_are_ordered_worst_first():
    rows = [
        stop_row("111", "Near / Pair", 34.000, -118.0),
        stop_row("222", "Near / Pair", 34.005, -118.0),
        stop_row("333", "Far / Pair", 34.000, -118.0),
        stop_row("444", "Far / Pair", 34.100, -118.0),
    ]
    warned = spread_warnings(group_bus_stops(rows))
    assert [w["stop_key"] for w in warned] == ["bus:far-pair", "bus:near-pair"]

def test_default_threshold_is_the_documented_one():
    assert SPREAD_WARN_M == 200.0


# --- group_rail_stops: parent-station preference ---

# The parent sits ~55 m north of the platforms' midpoint, deliberately: put it *at* the
# midpoint and the preference test passes whether or not the preference is implemented.
STATION_PARENT = (34.056700, -118.234250)
STATION_PLATFORM_A = (34.056500, -118.234000)
STATION_PLATFORM_B = (34.055900, -118.234500)


def test_rail_prefers_the_parent_station_over_its_platforms():
    """One dot per station: the parent's coordinate, not the mean of the platforms."""
    rows = [
        stop_row("80214", "Union Station", *STATION_PLATFORM_A, location_type="0", parent="80214S"),
        stop_row("80215", "Union Station", *STATION_PLATFORM_B, location_type="0", parent="80214S"),
        stop_row("80214S", "Union Station", *STATION_PARENT, location_type="1"),
    ]
    stop = group_rail_stops(rows)["rail:union-station"]
    assert stop["lat"] == pytest.approx(STATION_PARENT[0])
    assert stop["lon"] == pytest.approx(STATION_PARENT[1])
    # Not the platform centroid, which is the thing it would silently fall back to.
    platform_mean = (STATION_PLATFORM_A[0] + STATION_PLATFORM_B[0]) / 2
    assert abs(stop["lat"] - platform_mean) > 1e-4

def test_rail_records_only_the_ids_that_produced_the_coordinate():
    """gtfs_stop_ids and spread_m must describe the same point set, or a wide spread
    cannot be traced back to the ids that caused it."""
    rows = [
        stop_row("80214", "Union Station", *STATION_PLATFORM_A, location_type="0", parent="80214S"),
        stop_row("80214S", "Union Station", *STATION_PARENT, location_type="1"),
    ]
    stop = group_rail_stops(rows)["rail:union-station"]
    assert stop["gtfs_stop_ids"] == ["80214S"]
    assert stop["spread_m"] == 0.0

def test_rail_falls_back_to_centroiding_platforms_when_there_is_no_parent():
    rows = [
        stop_row("80301", "Avalon Station", *STATION_PLATFORM_A, location_type="0"),
        stop_row("80302", "Avalon Station", *STATION_PLATFORM_B, location_type="0"),
    ]
    stop = group_rail_stops(rows)["rail:avalon-station"]
    assert stop["lat"] == pytest.approx((STATION_PLATFORM_A[0] + STATION_PLATFORM_B[0]) / 2)
    assert stop["gtfs_stop_ids"] == ["80301", "80302"]

def test_rail_excludes_entrances():
    """location_type 2 is a doorway to a station that already has a dot."""
    rows = [
        stop_row("80214S", "Union Station", *STATION_PARENT, location_type="1"),
        stop_row("80214A", "Union Station - Alameda Entrance", 34.0600, -118.2300, location_type="2"),
    ]
    located = group_rail_stops(rows)
    assert list(located) == ["rail:union-station"]
    assert located["rail:union-station"]["gtfs_stop_ids"] == ["80214S"]

def test_rail_platform_suffixes_fold_onto_one_station():
    """The suffix strip is stop_identity's; this asserts the join goes through it,
    because it is what turns three platform rows into one dot."""
    rows = [
        stop_row("1", "Union Station - A Line", *STATION_PLATFORM_A, location_type="1"),
        stop_row("2", "Union Station - Metro Red & Purple Lines", *STATION_PLATFORM_B,
                 location_type="1"),
    ]
    assert list(group_rail_stops(rows)) == ["rail:union-station"]

def test_rail_alias_folds_a_renamed_station_onto_the_current_name():
    aliases = {"rail": {"apu-station": "apu-citrus-college-station"}}
    rows = [stop_row("80427S", "APU / Citrus College Station", *STATION_PARENT, location_type="1")]
    located = group_rail_stops(rows, aliases)
    assert list(located) == ["rail:apu-citrus-college-station"]

def test_rail_blank_location_type_is_treated_as_a_platform():
    rows = [stop_row("80301", "Avalon Station", *STATION_PARENT)]
    assert list(group_rail_stops(rows)) == ["rail:avalon-station"]


# --- join_locations: unmatched is retained ---

def _ridership(*keys):
    return {
        key: {"name": key.split(":", 1)[1].replace("-", " ").title(), "mode":
              "Bus" if key.startswith("bus:") else "Rail", "lines": {2, 4}}
        for key in keys
    }


def test_matched_stops_carry_their_geometry():
    gtfs = group_bus_stops([stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH)])
    stops, unmatched = join_locations(_ridership("bus:vermont-wilshire"), gtfs)
    assert stops["bus:vermont-wilshire"]["lat"] == pytest.approx(VERMONT_NORTH[0])
    assert unmatched == []

def test_a_stop_with_ridership_and_no_geometry_is_kept_not_dropped():
    """The series and the ranked table still contain it; only the map layer does not.
    Dropping would change a line's stop count between months."""
    stops, unmatched = join_locations(_ridership("rail:apu-station"), {})
    assert stops == {}
    assert unmatched == [
        {"stop_key": "rail:apu-station", "name": "Apu Station", "mode": "Rail", "lines": [2, 4]}
    ]

def test_gtfs_stops_with_no_ridership_are_not_written():
    """The bus feed carries ~5,000 stops no export mentions, and this file ships."""
    gtfs = group_bus_stops([
        stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH),
        stop_row("222", "Nowhere / Nothing", *VERMONT_SOUTH),
    ])
    stops, unmatched = join_locations(_ridership("bus:vermont-wilshire"), gtfs)
    assert list(stops) == ["bus:vermont-wilshire"]
    assert unmatched == []

def test_join_output_is_sorted_by_key():
    """Deterministic writes; otherwise every run is a phantom multi-megabyte diff."""
    gtfs = group_bus_stops([
        stop_row("111", "Zebra / Street", *VERMONT_NORTH),
        stop_row("222", "Alpha / Street", *VERMONT_SOUTH),
    ])
    stops, _ = join_locations(_ridership("bus:zebra-street", "bus:alpha-street"), gtfs)
    assert list(stops) == ["bus:alpha-street", "bus:zebra-street"]

def test_unmatched_is_sorted_by_key():
    _, unmatched = join_locations(_ridership("rail:zebra-station", "rail:alpha-station"), {})
    assert [u["stop_key"] for u in unmatched] == ["rail:alpha-station", "rail:zebra-station"]


# --- alias_stub ---

def test_alias_stub_is_valid_json_ready_to_paste():
    _, unmatched = join_locations(_ridership("rail:apu-station", "bus:pico-union"), {})
    stub = json.loads(alias_stub(unmatched))
    assert stub == {"bus": {"pico-union": ""}, "rail": {"apu-station": ""}}

def test_alias_stub_has_both_tables_even_when_one_side_is_empty():
    _, unmatched = join_locations(_ridership("rail:apu-station"), {})
    assert json.loads(alias_stub(unmatched)) == {"bus": {}, "rail": {"apu-station": ""}}


# --- drop_unnamed_rows ---

def test_drop_unnamed_rows_removes_blank_bus_stop_names():
    """Works around a nameless row in 06-2026-Bus.xlsx that aggregate_to_stop_ridership
    raises on; see the function's docstring."""
    df = pd.DataFrame({"STOP_NAME": ["Vermont / Wilshire", None, "  "], "LINE": [2, 155, 4]})
    kept, dropped = drop_unnamed_rows(df, "Bus")
    assert list(kept["STOP_NAME"]) == ["Vermont / Wilshire"]
    assert dropped == 2

def test_drop_unnamed_rows_leaves_rail_alone():
    """Rail identity is STATION_ORDER, and extract_leaf_rows already drops blanks."""
    df = pd.DataFrame({"STATION_ORDER": ["1001-Union Station"], "LINE": [801]})
    kept, dropped = drop_unnamed_rows(df, "Rail")
    assert dropped == 0
    assert len(kept) == 1


# --- build_document ---

def _document():
    gtfs = group_bus_stops([stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH)])
    stops, unmatched = join_locations(
        _ridership("bus:vermont-wilshire", "rail:apu-station"), gtfs
    )
    return build_document(
        stops, unmatched,
        feeds={"bus": {"url": "http://fake", "stop_rows": 1}},
        archives=["Bus 2025.zip"],
        months=["2025-07"],
        ridership_counts={"bus": 1, "rail": 1},
    )


def test_document_has_the_three_top_level_keys():
    assert set(_document()) == {"generated_from", "stops", "unmatched"}

def test_document_reports_the_match_rate_it_achieved():
    generated = _document()["generated_from"]
    assert generated["stop_keys"] == {"bus": 1, "rail": 1}
    assert generated["matched"] == {"bus": 1, "rail": 0}

def test_document_carries_no_timestamp():
    """A wall-clock stamp would diff this committed file on every run whether or not
    the geometry moved. Feed identity says the same thing without the noise."""
    assert "generated_at" not in json.dumps(_document())

def test_document_sorts_stops_and_unmatched_it_is_handed():
    """`build_document` must not inherit its ordering from the caller. Sorting only in
    `join_locations` would leave the committed file's determinism resting on a
    guarantee made somewhere else — ROADMAP risk 3, a phantom multi-megabyte diff."""
    document = build_document(
        stops={"bus:zebra": {"name": "Z"}, "bus:alpha": {"name": "A"}},
        unmatched=[{"stop_key": "rail:zebra"}, {"stop_key": "rail:alpha"}],
        feeds={}, archives=[], months=[], ridership_counts={"bus": 2, "rail": 2},
    )
    assert list(document["stops"]) == ["bus:alpha", "bus:zebra"]
    assert [u["stop_key"] for u in document["unmatched"]] == ["rail:alpha", "rail:zebra"]


def test_document_records_the_threshold_actually_used():
    """`--spread-warn 100` must not warn at 100 and then record 200 as provenance."""
    document = build_document(
        stops={}, unmatched=[], feeds={}, archives=[], months=[],
        ridership_counts={"bus": 0}, spread_warn_m=100.0,
    )
    assert document["generated_from"]["spread_warn_m"] == 100.0
