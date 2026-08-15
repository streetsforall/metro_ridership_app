"""
Tests for fetch_stop_locations.py.

Synthetic `stops.txt` rows throughout — no network, and no dependency on what the
live GTFS feed happens to contain this week. The four behaviours that are load-bearing
and would be silent if they broke:

- bus stops sharing a name become one centroid, keeping every contributing stop_id
- `spread_m` measures the group and the warning fires above the threshold
- rail prefers the `location_type == 1` parent station over its platforms
- a stop with ridership and no geometry is **retained** in `unmatched`, not dropped
- a name reused by two different places is narrowed to the stops its own line runs past
"""

import json

import pytest

from fetch_stop_locations import (
    NEAR_LINE_M,
    SPREAD_WARN_M,
    alias_stub,
    build_document,
    group_bus_stops,
    group_rail_stops,
    haversine_m,
    join_locations,
    max_pairwise_m,
    near_any_point,
    refine_by_line,
    spread_warnings,
    stop_candidates,
)


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
    gtfs = stop_candidates([stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH)], "Bus")
    stops, unmatched, _ = join_locations(_ridership("bus:vermont-wilshire"), gtfs)
    assert stops["bus:vermont-wilshire"]["lat"] == pytest.approx(VERMONT_NORTH[0])
    assert unmatched == []

def test_a_stop_with_ridership_and_no_geometry_is_kept_not_dropped():
    """The series and the ranked table still contain it; only the map layer does not.
    Dropping would change a line's stop count between months."""
    stops, unmatched, _ = join_locations(_ridership("rail:apu-station"), {})
    assert stops == {}
    assert unmatched == [
        {"stop_key": "rail:apu-station", "name": "Apu Station", "mode": "Rail",
         "lines": [2, 4], "reason": "no-gtfs-match"}
    ]

def test_gtfs_stops_with_no_ridership_are_not_written():
    """The bus feed carries ~5,000 stops no export mentions, and this file ships."""
    gtfs = stop_candidates([
        stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH),
        stop_row("222", "Nowhere / Nothing", *VERMONT_SOUTH),
    ], "Bus")
    stops, unmatched, _ = join_locations(_ridership("bus:vermont-wilshire"), gtfs)
    assert list(stops) == ["bus:vermont-wilshire"]
    assert unmatched == []

def test_join_output_is_sorted_by_key():
    """Deterministic writes; otherwise every run is a phantom multi-megabyte diff."""
    gtfs = stop_candidates([
        stop_row("111", "Zebra / Street", *VERMONT_NORTH),
        stop_row("222", "Alpha / Street", *VERMONT_SOUTH),
    ], "Bus")
    stops, _, _ = join_locations(_ridership("bus:zebra-street", "bus:alpha-street"), gtfs)
    assert list(stops) == ["bus:alpha-street", "bus:zebra-street"]

def test_unmatched_is_sorted_by_key():
    _, unmatched, _ = join_locations(_ridership("rail:zebra-station", "rail:alpha-station"), {})
    assert [u["stop_key"] for u in unmatched] == ["rail:alpha-station", "rail:zebra-station"]


# --- refine_by_line: telling two places with the same name apart ---

# The two real `Main / Pico` intersections, 21 km apart.
MAIN_PICO_DTLA = (34.0407, -118.2468)
MAIN_PICO_SANTA_MONICA = (34.0110, -118.4900)

# A route shape that runs through downtown and nowhere near Santa Monica.
DTLA_SHAPE = [(34.0400, -118.2500), (34.0407, -118.2469), (34.0420, -118.2440)]


def _main_pico_rows():
    return [
        stop_row("111", "Main / Pico", *MAIN_PICO_DTLA),
        stop_row("222", "Main / Pico", *MAIN_PICO_SANTA_MONICA),
    ]


def test_near_any_point_accepts_a_point_on_the_shape():
    assert near_any_point(MAIN_PICO_DTLA, DTLA_SHAPE, NEAR_LINE_M)

def test_near_any_point_rejects_a_point_20km_away():
    assert not near_any_point(MAIN_PICO_SANTA_MONICA, DTLA_SHAPE, NEAR_LINE_M)

def test_near_any_point_respects_the_tolerance():
    """~111 m north of the shape: inside 150 m, outside 50 m."""
    just_off = (34.0407 + 0.001, -118.2469)
    assert near_any_point(just_off, DTLA_SHAPE, 150.0)
    assert not near_any_point(just_off, DTLA_SHAPE, 50.0)


def test_refine_keeps_only_the_stop_its_line_runs_past():
    members = stop_candidates(_main_pico_rows(), "Bus")["bus:main-pico"]
    kept = refine_by_line(members, {30}, {30: DTLA_SHAPE})
    assert [m["stop_id"] for m in kept] == ["111"]

def test_refine_keeps_everything_when_the_line_has_no_shape():
    """No shape is no evidence. A bad centroid beats inventing a location."""
    members = stop_candidates(_main_pico_rows(), "Bus")["bus:main-pico"]
    assert len(refine_by_line(members, {30}, {})) == 2

def test_refine_keeps_everything_rather_than_rejecting_all():
    """If the filter would empty the group, the stop would vanish from the map. Keep
    the bad centroid and let `spread_m` say so."""
    members = stop_candidates(_main_pico_rows(), "Bus")["bus:main-pico"]
    far_away = {30: [(40.7, -74.0)]}
    assert len(refine_by_line(members, {30}, far_away)) == 2

def test_refine_considers_every_line_that_reports_there():
    """A stop served by two lines is kept if *either* runs past it."""
    members = stop_candidates(_main_pico_rows(), "Bus")["bus:main-pico"]
    shapes = {30: [(40.7, -74.0)], 33: DTLA_SHAPE}
    assert [m["stop_id"] for m in refine_by_line(members, {30, 33}, shapes)] == ["111"]


def test_join_narrows_a_stop_whose_name_is_reused():
    candidates = stop_candidates(_main_pico_rows(), "Bus")
    ridership = {"bus:main-pico": {"name": "Main / Pico", "mode": "Bus", "lines": {30}}}
    stops, _, refined = join_locations(ridership, candidates, {30: DTLA_SHAPE})
    stop = stops["bus:main-pico"]
    assert stop["lat"] == pytest.approx(MAIN_PICO_DTLA[0])
    assert stop["gtfs_stop_ids"] == ["111"]
    assert stop["spread_m"] == 0.0

def test_join_reports_what_it_narrowed():
    """Moving a dot silently is the failure mode. Each swap is recorded."""
    candidates = stop_candidates(_main_pico_rows(), "Bus")
    ridership = {"bus:main-pico": {"name": "Main / Pico", "mode": "Bus", "lines": {30}}}
    _, _, refined = join_locations(ridership, candidates, {30: DTLA_SHAPE})
    assert len(refined) == 1
    assert refined[0]["stop_key"] == "bus:main-pico"
    assert refined[0]["spread_before_m"] > 20_000
    assert refined[0]["spread_after_m"] == 0.0
    assert refined[0]["dropped_gtfs_stop_ids"] == ["222"]

def test_join_leaves_an_ordinary_pair_alone():
    """Two sides of a street are below the threshold, so the shapes are never consulted
    — 4,945 stops are in this case and refining them all would be pointless work."""
    candidates = stop_candidates([
        stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH),
        stop_row("222", "Vermont / Wilshire", *VERMONT_SOUTH),
    ], "Bus")
    ridership = {"bus:vermont-wilshire": {"name": "V", "mode": "Bus", "lines": {204}}}
    stops, _, refined = join_locations(ridership, candidates, {204: DTLA_SHAPE})
    assert stops["bus:vermont-wilshire"]["gtfs_stop_ids"] == ["111", "222"]
    assert refined == []

def test_a_name_used_by_two_places_gets_no_coordinate_at_all():
    """The centroid of downtown LA and Santa Monica is in neither, so writing it would
    put a dot on the map that is simply wrong. No coordinate, and say why."""
    candidates = stop_candidates(_main_pico_rows(), "Bus")
    ridership = {"bus:main-pico": {"name": "Main / Pico", "mode": "Bus", "lines": {30}}}
    stops, unmatched, _ = join_locations(ridership, candidates)  # no shapes to rescue it
    assert stops == {}
    assert unmatched[0]["reason"] == "ambiguous-name"
    assert unmatched[0]["spread_m"] > 20_000

def test_an_ambiguous_stop_keeps_its_ridership_identity_and_evidence():
    """It still belongs in the series and the ranked table; only the map skips it. The
    ids are carried so the next person can see which two places collided."""
    candidates = stop_candidates(_main_pico_rows(), "Bus")
    ridership = {"bus:main-pico": {"name": "Main / Pico", "mode": "Bus", "lines": {30, 33}}}
    _, unmatched, _ = join_locations(ridership, candidates)
    assert unmatched[0]["stop_key"] == "bus:main-pico"
    assert unmatched[0]["lines"] == [30, 33]
    assert unmatched[0]["gtfs_stop_ids"] == ["111", "222"]

def test_refinement_rescues_a_stop_that_would_have_been_ambiguous():
    """The order matters: narrow first, then judge. Judging first would discard a stop
    the route shapes could have placed."""
    candidates = stop_candidates(_main_pico_rows(), "Bus")
    ridership = {"bus:main-pico": {"name": "Main / Pico", "mode": "Bus", "lines": {30}}}
    stops, unmatched, refined = join_locations(ridership, candidates, {30: DTLA_SHAPE})
    assert unmatched == []
    assert stops["bus:main-pico"]["gtfs_stop_ids"] == ["111"]
    assert len(refined) == 1

def test_a_wide_but_plausible_stop_keeps_its_centroid():
    """A transit centre spans a few hundred metres and is still one place. Only the
    kilometre-scale collisions lose their coordinate."""
    rows = [
        stop_row("111", "North Hollywood Station", 34.16800, -118.37700),
        stop_row("222", "North Hollywood Station", 34.16600, -118.37600),  # ~250 m
    ]
    ridership = {"bus:north-hollywood-station": {"name": "N", "mode": "Bus", "lines": {224}}}
    stops, unmatched, _ = join_locations(ridership, stop_candidates(rows, "Bus"))
    assert unmatched == []
    assert 200 < stops["bus:north-hollywood-station"]["spread_m"] < 1000

def test_ambiguous_threshold_is_configurable():
    candidates = stop_candidates(_main_pico_rows(), "Bus")
    ridership = {"bus:main-pico": {"name": "Main / Pico", "mode": "Bus", "lines": {30}}}
    stops, unmatched, _ = join_locations(ridership, candidates, ambiguous_m=50_000.0)
    assert unmatched == []
    assert stops["bus:main-pico"]["spread_m"] > 20_000


# --- alias_stub ---

def test_alias_stub_is_valid_json_ready_to_paste():
    _, unmatched, _ = join_locations(_ridership("rail:apu-station", "bus:pico-union"), {})
    stub = json.loads(alias_stub(unmatched))
    assert stub == {"bus": {"pico-union": ""}, "rail": {"apu-station": ""}}

def test_alias_stub_has_both_tables_even_when_one_side_is_empty():
    _, unmatched, _ = join_locations(_ridership("rail:apu-station"), {})
    assert json.loads(alias_stub(unmatched)) == {"bus": {}, "rail": {"apu-station": ""}}


# --- build_document ---

def _document():
    gtfs = stop_candidates([stop_row("111", "Vermont / Wilshire", *VERMONT_NORTH)], "Bus")
    stops, unmatched, _ = join_locations(
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
