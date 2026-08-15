"""
Tests for stop_identity.py.

Pure functions over strings — no DataFrames, no Excel, no filesystem except the
one test that reads the committed alias table.
"""

import json
import re

import pytest

import stop_identity as si
from stop_identity import (
    display_stop_name,
    load_aliases,
    normalise_stop_name,
    parse_station_order,
    stop_key,
    strip_rail_platform_suffix,
)


# ---------------------------------------------------------------------------
# normalise_stop_name
# ---------------------------------------------------------------------------

class TestNormaliseStopName:
    def test_case_folded(self):
        assert normalise_stop_name("Vermont / Wilshire") == "vermont / wilshire"

    def test_leading_and_trailing_whitespace_stripped(self):
        assert normalise_stop_name("  Wardlow Station  ") == "wardlow station"

    def test_internal_whitespace_collapsed(self):
        assert normalise_stop_name("Del  Amo\tStation") == "del amo station"

    @pytest.mark.parametrize("raw", [
        "103rd / Central",
        "103rd/Central",
        "103rd /Central",
        "103rd  /  Central",
    ])
    def test_slash_spacing_unified(self, raw):
        assert normalise_stop_name(raw) == "103rd / central"

    def test_non_string_coerced(self):
        assert normalise_stop_name(1001) == "1001"

    @pytest.mark.parametrize("missing", [None, float("nan")])
    def test_missing_name_raises(self, missing):
        """A blank cell must fail loudly. Left to `str()`, NaN becomes the string
        "nan" — a plausible-looking stop whose figures are the sum of every
        blank-named row on its line, and nothing surfaces that."""
        with pytest.raises(ValueError, match="Stop name is missing"):
            normalise_stop_name(missing)


# ---------------------------------------------------------------------------
# strip_rail_platform_suffix
#
# Table-driven over every suffix form that occurs in data/raw/, so a Metro layout
# change shows up here rather than as two half-length series for one station.
# ---------------------------------------------------------------------------

REAL_SUFFIXED_NAMES = [
    ("Expo / Crenshaw Station - E Line", "Expo / Crenshaw Station"),
    ("7th Street / Metro Center Station - A / E Line", "7th Street / Metro Center Station"),
    ("Willowbrook / Rosa Parks Station - A Line", "Willowbrook / Rosa Parks Station"),
    ("Union Station - A Line", "Union Station"),
    ("Willowbrook / Rosa Parks Station - C Line", "Willowbrook / Rosa Parks Station"),
    ("Aviation Century Station - C Line", "Aviation Century Station"),
    ("AMC / LAX Station - C Line", "AMC / LAX Station"),
    ("Union Station - Metro Red & Purple Lines", "Union Station"),
    ("7th Street / Metro Center Station - Metro Red & Purple Lines",
     "7th Street / Metro Center Station"),
    ("Expo / Crenshaw Station - K Line", "Expo / Crenshaw Station"),
    ("AMC / LAX Station - K Line", "AMC / LAX Station"),
    ("Aviation Century Station - K Line", "Aviation Century Station"),
]


class TestStripRailPlatformSuffix:
    @pytest.mark.parametrize("raw,expected", REAL_SUFFIXED_NAMES)
    def test_real_names(self, raw, expected):
        assert strip_rail_platform_suffix(raw) == expected

    @pytest.mark.parametrize("name", [
        "Downtown Long Beach Station",
        "103rd Street / Watts Towers Station",
        "Pacific Coast Hwy Station",
        "Grand / LATTC Station",
    ])
    def test_unsuffixed_names_untouched(self, name):
        assert strip_rail_platform_suffix(name) == name

    def test_hyphen_that_is_not_a_platform_suffix_survives(self):
        """Bus names like this exist; the function must not eat a real hyphen."""
        assert (
            strip_rail_platform_suffix("El Monte Station - Upper Level")
            == "El Monte Station - Upper Level"
        )

    def test_two_platforms_of_one_station_agree(self):
        a = strip_rail_platform_suffix("Union Station - A Line")
        b = strip_rail_platform_suffix("Union Station - Metro Red & Purple Lines")
        assert a == b == "Union Station"


# ---------------------------------------------------------------------------
# parse_station_order
# ---------------------------------------------------------------------------

class TestParseStationOrder:
    def test_numeric_prefix_split(self):
        assert parse_station_order("1001-Downtown Long Beach Station") == (
            1001, "Downtown Long Beach Station",
        )

    def test_leading_zeros_preserved_as_int(self):
        assert parse_station_order("0012-Expo / Crenshaw Station - E Line") == (
            12, "Expo / Crenshaw Station - E Line",
        )

    def test_splits_on_first_hyphen_only(self):
        """Station names contain hyphens of their own; only the prefix is taken."""
        assert parse_station_order("1026-Union Station - A Line") == (
            1026, "Union Station - A Line",
        )

    def test_total_row(self):
        assert parse_station_order("Total") == (None, "Total")

    def test_nan(self):
        assert parse_station_order(float("nan")) == (None, "")

    def test_none(self):
        assert parse_station_order(None) == (None, "")

    def test_non_numeric_prefix_is_not_a_split(self):
        assert parse_station_order("S1-Something") == (None, "S1-Something")

    def test_no_hyphen(self):
        assert parse_station_order("Station 1") == (None, "Station 1")

    def test_integer_cell(self):
        assert parse_station_order(1) == (None, "1")


# ---------------------------------------------------------------------------
# stop_key
# ---------------------------------------------------------------------------

KEY_RE = re.compile(r"^(bus|rail):[a-z0-9]+(-[a-z0-9]+)*$")


class TestStopKey:
    def test_bus_key(self):
        assert stop_key("Bus", "Vermont / Wilshire") == "bus:vermont-wilshire"

    def test_rail_key(self):
        assert stop_key("Rail", "Union Station") == "rail:union-station"

    def test_modes_are_namespaced(self):
        assert stop_key("Bus", "Union Station") != stop_key("Rail", "Union Station")

    @pytest.mark.parametrize("variant", [
        "Vermont / Wilshire",
        "vermont / wilshire",
        "VERMONT / WILSHIRE",
        "  Vermont  /  Wilshire  ",
        "Vermont/Wilshire",
    ])
    def test_stable_under_case_and_whitespace_change(self, variant):
        assert stop_key("Bus", variant) == "bus:vermont-wilshire"

    def test_rail_platform_suffix_folded_into_one_key(self):
        assert (
            stop_key("Rail", "Union Station - A Line")
            == stop_key("Rail", "Union Station - Metro Red & Purple Lines")
            == "rail:union-station"
        )

    @pytest.mark.parametrize("raw,expected", [
        ("103rd / Central", "bus:103rd-central"),
        ("6th / Private Right-Of-Way", "bus:6th-private-right-of-way"),
        ("Avenue San Luis / Us-101 S Exit 28", "bus:avenue-san-luis-us-101-s-exit-28"),
        ("District  /  Produce Plaza", "bus:district-produce-plaza"),
    ])
    def test_real_bus_names(self, raw, expected):
        assert stop_key("Bus", raw) == expected

    @pytest.mark.parametrize("raw", [
        "Willowbrook / Rosa Parks Station",
        "AMC / LAX Station",
        "103rd Street / Watts Towers Station",
        "Grand Arts / Bunker Hill Station",
    ])
    def test_keys_are_url_safe(self, raw):
        assert KEY_RE.match(stop_key("Rail", raw))

    def test_unknown_mode_raises(self):
        with pytest.raises(ValueError, match="Unknown mode"):
            stop_key("Trolley", "Somewhere")

    def test_empty_name_raises(self):
        with pytest.raises(ValueError, match="no usable characters"):
            stop_key("Bus", "   ")

    @pytest.mark.parametrize("missing", [None, float("nan")])
    def test_missing_name_raises(self, missing):
        """`stop_key("Bus", float("nan"))` must not quietly become `bus:nan`."""
        with pytest.raises(ValueError, match="Stop name is missing"):
            stop_key("Bus", missing)


# ---------------------------------------------------------------------------
# aliases
# ---------------------------------------------------------------------------

class TestAliases:
    def test_alias_collapses_a_rename_onto_one_key(self):
        aliases = {"rail": {"apu-station": "apu-citrus-college-station"}}
        assert (
            stop_key("Rail", "APU Station", aliases)
            == stop_key("Rail", "APU / Citrus College Station", aliases)
            == "rail:apu-citrus-college-station"
        )

    def test_alias_table_is_per_mode(self):
        aliases = {"rail": {"foo": "bar"}}
        assert stop_key("Bus", "Foo", aliases) == "bus:foo"
        assert stop_key("Rail", "Foo", aliases) == "rail:bar"

    def test_alias_chain_is_followed(self):
        aliases = {"bus": {"a-stop": "b-stop", "b-stop": "c-stop"}}
        assert stop_key("Bus", "A Stop", aliases) == "bus:c-stop"

    def test_alias_cycle_raises(self):
        aliases = {"bus": {"a-stop": "b-stop", "b-stop": "a-stop"}}
        with pytest.raises(ValueError, match="Alias cycle"):
            stop_key("Bus", "A Stop", aliases)

    def test_no_aliases_is_a_noop(self):
        assert stop_key("Bus", "A Stop", None) == "bus:a-stop"
        assert stop_key("Bus", "A Stop", {}) == "bus:a-stop"

    def test_committed_table_loads_and_has_both_modes(self):
        aliases = load_aliases()
        assert set(aliases) == {"bus", "rail"}

    def test_commentary_keys_are_ignored(self, tmp_path):
        path = tmp_path / "aliases.json"
        path.write_text(json.dumps({"_comment": "hi", "bus": {"x": "y"}}), encoding="utf-8")
        assert load_aliases(path) == {"bus": {"x": "y"}}

    def test_missing_table_is_empty(self, tmp_path):
        assert load_aliases(tmp_path / "nope.json") == {}

    def test_committed_table_targets_are_canonical(self):
        """Every alias target must itself be a valid unprefixed slug, or the key it
        produces would not be URL-safe."""
        for mode_table in load_aliases().values():
            for source, target in mode_table.items():
                assert re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", source)
                assert re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", target)


# ---------------------------------------------------------------------------
# display_stop_name
# ---------------------------------------------------------------------------

class TestDisplayStopName:
    def test_case_preserved(self):
        assert display_stop_name("Bus", "Vermont / Wilshire") == "Vermont / Wilshire"

    def test_whitespace_tidied(self):
        assert display_stop_name("Bus", "  Vermont  /  Wilshire ") == "Vermont / Wilshire"

    def test_rail_platform_suffix_removed(self):
        assert display_stop_name("Rail", "Union Station - A Line") == "Union Station"

    def test_bus_hyphenated_name_kept(self):
        """Bus names are never passed through the rail suffix stripper."""
        assert (
            display_stop_name("Bus", "Del Amo Station - Discharge Only")
            == "Del Amo Station - Discharge Only"
        )

    def test_agrees_with_stop_key_for_rail_platforms(self):
        """Rows sharing a key must also share a name, or the UI shows one place
        under two labels."""
        names = ["Union Station - A Line", "Union Station - Metro Red & Purple Lines"]
        assert len({stop_key("Rail", n) for n in names}) == 1
        assert len({display_stop_name("Rail", n) for n in names}) == 1


# ---------------------------------------------------------------------------
# module hygiene
# ---------------------------------------------------------------------------

def test_alias_cache_is_not_shared_with_explicit_paths(tmp_path):
    """Passing a path must not poison the default cached table."""
    path = tmp_path / "aliases.json"
    path.write_text(json.dumps({"bus": {"x": "y"}}), encoding="utf-8")
    load_aliases(path)
    assert load_aliases() == si._read_aliases(si.ALIASES_PATH)
