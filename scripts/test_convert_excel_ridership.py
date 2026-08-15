"""
Tests for convert_excel_ridership.py.

All tests use synthetic DataFrames or in-memory zips — no real Excel files required.
"""

import io
import zipfile
from pathlib import Path

import pandas as pd
import pytest

import convert_excel_ridership as ce
from convert_excel_ridership import (
    parse_filename,
    aggregate_to_line_ridership,
    aggregate_to_stop_ridership,
    extract_leaf_rows,
    convert_zip,
    DAYTYPE_MAP,
    LEAF_VALUE_COLS,
    STOP_OUTPUT_COLS,
    ZIP_FILENAME_RE,
    INNER_FILENAME_RE,
)


# ---------------------------------------------------------------------------
# parse_filename
# ---------------------------------------------------------------------------

class TestParseFilename:
    def test_bus_file(self):
        month, year, mode = parse_filename(Path("01-2026-Bus.xlsx"))
        assert month == 1
        assert year == 2026
        assert mode == "Bus"

    def test_rail_file(self):
        month, year, mode = parse_filename(Path("03-2026-Rail.xlsx"))
        assert month == 3
        assert year == 2026
        assert mode == "Rail"

    def test_case_insensitive_mode(self):
        _, _, mode = parse_filename(Path("02-2026-bus.xlsx"))
        assert mode == "Bus"

    def test_zero_padded_month(self):
        month, _, _ = parse_filename(Path("01-2026-Bus.xlsx"))
        assert month == 1

    def test_december(self):
        month, year, _ = parse_filename(Path("12-2025-Rail.xlsx"))
        assert month == 12
        assert year == 2025

    def test_invalid_filename_raises(self):
        with pytest.raises(ValueError, match="Expected format"):
            parse_filename(Path("Monthly_Riders.csv.gz"))

    def test_missing_mode_raises(self):
        with pytest.raises(ValueError, match="Expected format"):
            parse_filename(Path("01-2026.xlsx"))


# ---------------------------------------------------------------------------
# ZIP_FILENAME_RE / INNER_FILENAME_RE
# ---------------------------------------------------------------------------

class TestZipFilenameRegex:
    def test_bus_zip(self):
        assert ZIP_FILENAME_RE.match("Bus 2025.zip")

    def test_rail_zip(self):
        assert ZIP_FILENAME_RE.match("Rail 2025.zip")

    def test_case_insensitive(self):
        assert ZIP_FILENAME_RE.match("bus 2025.zip")

    def test_invalid_no_mode(self):
        assert not ZIP_FILENAME_RE.match("2025.zip")

    def test_invalid_wrong_extension(self):
        assert not ZIP_FILENAME_RE.match("Bus 2025.tar.gz")


class TestInnerFilenameRegex:
    def test_valid(self):
        m = INNER_FILENAME_RE.match("2025-07.xlsx")
        assert m
        assert int(m.group(1)) == 2025
        assert int(m.group(2)) == 7

    def test_december(self):
        m = INNER_FILENAME_RE.match("2025-12.xlsx")
        assert m and int(m.group(2)) == 12

    def test_invalid_format(self):
        assert not INNER_FILENAME_RE.match("01-2026-Bus.xlsx")

    def test_invalid_extension(self):
        assert not INNER_FILENAME_RE.match("2025-07.csv")


# ---------------------------------------------------------------------------
# aggregate_to_line_ridership
# ---------------------------------------------------------------------------

def _make_bus_df() -> pd.DataFrame:
    """Two lines, two stops each (one per direction), Bus mode."""
    return pd.DataFrame({
        "STOP_NAME": ["Stop A", "Stop B", "Stop C", "Stop D"],
        "LINE":      [90,       90,       117,      117],
        "DIRECTION": ["IB",     "OB",     "IB",     "OB"],
        "WD_ONS":    [100.0,    120.0,    200.0,    180.0],
        "WD_OFFS":   [90.0,     130.0,    190.0,    190.0],
        "WD_ACT":    [190.0,    250.0,    390.0,    370.0],
        "SA_ONS":    [60.0,     70.0,     100.0,    90.0],
        "SA_OFFS":   [55.0,     75.0,     95.0,     95.0],
        "SA_ACT":    [115.0,    145.0,    195.0,    185.0],
        "SU_ONS":    [40.0,     50.0,     80.0,     70.0],
        "SU_OFFS":   [35.0,     55.0,     75.0,     75.0],
        "SU_ACT":    [75.0,     105.0,    155.0,    145.0],
    })


def _make_bus_df_with_totals() -> pd.DataFrame:
    """Same as _make_bus_df() but with a 'Total' direction row per stop per line."""
    base = _make_bus_df()
    totals = pd.DataFrame({
        "STOP_NAME": ["Stop A+B", "Stop C+D"],
        "LINE":      [90,         117],
        "DIRECTION": ["Total",    "Total"],
        "WD_ONS":    [220.0,      380.0],   # sum of real direction rows
        "WD_OFFS":   [220.0,      380.0],
        "WD_ACT":    [440.0,      760.0],
        "SA_ONS":    [130.0,      190.0],
        "SA_OFFS":   [130.0,      190.0],
        "SA_ACT":    [260.0,      380.0],
        "SU_ONS":    [90.0,       150.0],
        "SU_OFFS":   [90.0,       150.0],
        "SU_ACT":    [180.0,      300.0],
    })
    return pd.concat([base, totals], ignore_index=True)


def _make_rail_df() -> pd.DataFrame:
    """One rail line, two stations."""
    return pd.DataFrame({
        "LINE":          [807,   807],
        "ROUTE":         ["K",   "K"],
        "STATION_ORDER": [1,     2],
        "WD_ONS":        [500.0, 300.0],
        "WD_OFFS":       [490.0, 310.0],
        "WD_ACT":        [990.0, 610.0],
        "SA_ONS":        [250.0, 150.0],
        "SA_OFFS":       [240.0, 160.0],
        "SA_ACT":        [490.0, 310.0],
        "SU_ONS":        [200.0, 100.0],
        "SU_OFFS":       [190.0, 110.0],
        "SU_ACT":        [390.0, 210.0],
    })


def _make_rail_df_with_totals() -> pd.DataFrame:
    """Same as _make_rail_df() but with line-total and route-total rows."""
    base = _make_rail_df()
    totals = pd.DataFrame({
        "LINE":          [807,         807],
        "ROUTE":         ["Total",     807],
        "STATION_ORDER": [float("nan"), "Total"],
        "WD_ONS":        [800.0,        800.0],   # sum of stations
        "WD_OFFS":       [800.0,        800.0],
        "WD_ACT":        [1600.0,      1600.0],
        "SA_ONS":        [400.0,        400.0],
        "SA_OFFS":       [400.0,        400.0],
        "SA_ACT":        [800.0,        800.0],
        "SU_ONS":        [300.0,        300.0],
        "SU_OFFS":       [300.0,        300.0],
        "SU_ACT":        [600.0,        600.0],
    })
    return pd.concat([base, totals], ignore_index=True)


class TestAggregateToLineRidership:
    def test_sums_boardings_across_stops_and_directions(self):
        result = aggregate_to_line_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        # Line 90: WD_ONS = 100 + 120 = 220
        row = result[(result["Line"] == 90) & (result["DayType"] == "DX")]
        assert row.iloc[0]["Riders"] == 220.0

    def test_bus_total_direction_rows_excluded(self):
        """Total direction rows must not inflate the sum."""
        result_with = aggregate_to_line_ridership(
            _make_bus_df_with_totals(), year=2026, month=1, mode="Bus"
        )
        result_without = aggregate_to_line_ridership(
            _make_bus_df(), year=2026, month=1, mode="Bus"
        )
        # Results should be identical — Total rows add nothing
        pd.testing.assert_frame_equal(
            result_with.reset_index(drop=True),
            result_without.reset_index(drop=True),
        )

    def test_rail_total_station_rows_excluded(self):
        """Line-total and route-total rows must not inflate the sum."""
        result_with = aggregate_to_line_ridership(
            _make_rail_df_with_totals(), year=2026, month=1, mode="Rail"
        )
        result_without = aggregate_to_line_ridership(
            _make_rail_df(), year=2026, month=1, mode="Rail"
        )
        pd.testing.assert_frame_equal(
            result_with.reset_index(drop=True),
            result_without.reset_index(drop=True),
        )

    def test_both_lines_present(self):
        result = aggregate_to_line_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        assert set(result["Line"].unique()) == {90, 117}

    def test_three_daytypes_per_line(self):
        result = aggregate_to_line_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        assert set(result["DayType"].unique()) == {"DX", "SA", "SU"}
        assert len(result) == 6  # 2 lines × 3 day types

    def test_output_columns_match_csv_schema(self):
        result = aggregate_to_line_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        assert list(result.columns) == [
            "Year", "Month", "Line", "DayType", "Riders",
            "Shakeup", "Provider", "Mode", "Days",
        ]

    def test_metadata_fields_populated(self):
        result = aggregate_to_line_ridership(_make_bus_df(), year=2026, month=2, mode="Bus")
        row = result.iloc[0]
        assert row["Year"] == 2026
        assert row["Month"] == 2
        assert row["Mode"] == "Bus"
        assert row["Provider"] == "DO"
        assert row["Days"] == 1

    def test_rail_mode(self):
        result = aggregate_to_line_ridership(_make_rail_df(), year=2026, month=1, mode="Rail")
        row = result[(result["Line"] == 807) & (result["DayType"] == "DX")]
        # 500 + 300 = 800
        assert row.iloc[0]["Riders"] == 800.0
        assert row.iloc[0]["Mode"] == "Rail"

    def test_rail_nonnumeric_route_falls_back_to_line(self):
        """_make_rail_df uses ROUTE 'K' (non-numeric); it must be grouped under
        its LINE (807), not dropped."""
        result = aggregate_to_line_ridership(_make_rail_df(), year=2026, month=1, mode="Rail")
        assert set(result["Line"].unique()) == {807}

    def test_rail_routes_split_into_separate_lines(self):
        """Metro nests ROUTE 805 (D/Purple) under LINE 802 (B/Red). Each route
        must be reported as its own line, not summed into the LINE 802 total."""
        df = pd.DataFrame({
            "LINE":          [802,   802,   802,   802],
            "ROUTE":         ["802", "802", "805", "805"],
            "STATION_ORDER": ["S1",  "S2",  "S1",  "S2"],
            "WD_ONS":        [100.0, 200.0, 40.0,  60.0],
            "WD_OFFS":       [0.0,   0.0,   0.0,   0.0],
            "WD_ACT":        [0.0,   0.0,   0.0,   0.0],
            "SA_ONS":        [10.0,  20.0,  4.0,   6.0],
            "SA_OFFS":       [0.0,   0.0,   0.0,   0.0],
            "SA_ACT":        [0.0,   0.0,   0.0,   0.0],
            "SU_ONS":        [5.0,   15.0,  2.0,   8.0],
            "SU_OFFS":       [0.0,   0.0,   0.0,   0.0],
            "SU_ACT":        [0.0,   0.0,   0.0,   0.0],
        })
        result = aggregate_to_line_ridership(df, year=2026, month=5, mode="Rail")
        assert {802, 805} <= set(result["Line"].unique())
        red = result[(result["Line"] == 802) & (result["DayType"] == "DX")]
        purple = result[(result["Line"] == 805) & (result["DayType"] == "DX")]
        assert red.iloc[0]["Riders"] == 300.0     # 100 + 200, Red only
        assert purple.iloc[0]["Riders"] == 100.0  # 40 + 60, Purple broken out

    def test_saturday_and_sunday_ridership(self):
        result = aggregate_to_line_ridership(_make_rail_df(), year=2026, month=1, mode="Rail")
        sa = result[(result["Line"] == 807) & (result["DayType"] == "SA")]
        su = result[(result["Line"] == 807) & (result["DayType"] == "SU")]
        assert sa.iloc[0]["Riders"] == 400.0  # 250 + 150
        assert su.iloc[0]["Riders"] == 300.0  # 200 + 100

    def test_string_numeric_columns_coerced(self):
        """Excel sometimes stores numeric cells as strings."""
        df = pd.DataFrame({
            "STOP_NAME": ["Stop A"],
            "LINE":      [90],
            "DIRECTION": ["IB"],
            "WD_ONS":    ["150"],
            "WD_OFFS":   ["140"],
            "WD_ACT":    ["290"],
            "SA_ONS":    ["80"],
            "SA_OFFS":   ["75"],
            "SA_ACT":    ["155"],
            "SU_ONS":    ["60"],
            "SU_OFFS":   ["55"],
            "SU_ACT":    ["115"],
        })
        result = aggregate_to_line_ridership(df, year=2026, month=1, mode="Bus")
        row = result[(result["Line"] == 90) & (result["DayType"] == "DX")]
        assert row.iloc[0]["Riders"] == 150.0

    def test_nan_ons_treated_as_zero(self):
        df = pd.DataFrame({
            "STOP_NAME": ["Stop A"],
            "LINE":      [90],
            "DIRECTION": ["IB"],
            "WD_ONS":    [float("nan")],
            "WD_OFFS":   [100.0],
            "WD_ACT":    [100.0],
            "SA_ONS":    [50.0],
            "SA_OFFS":   [45.0],
            "SA_ACT":    [95.0],
            "SU_ONS":    [30.0],
            "SU_OFFS":   [28.0],
            "SU_ACT":    [58.0],
        })
        result = aggregate_to_line_ridership(df, year=2026, month=1, mode="Bus")
        row = result[(result["Line"] == 90) & (result["DayType"] == "DX")]
        assert row.iloc[0]["Riders"] == 0.0


# ---------------------------------------------------------------------------
# convert_zip
# ---------------------------------------------------------------------------

def _make_xlsx_bytes(df_rows: list[dict], cols: list[str]) -> bytes:
    """Build minimal xlsx bytes with the 2-row merged header + data rows."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        # Row 0: day-type group labels (sparse — only first of each group)
        header0 = [""] * len(cols)
        header0[3] = "Weekday"
        header0[6] = "Saturday"
        header0[9] = "Sunday"
        # Row 1: sub-column names
        header1 = cols[:]
        data = pd.DataFrame([header0, header1] + [
            [row.get(c, "") for c in cols] for row in df_rows
        ])
        data.to_excel(writer, sheet_name="Export", index=False, header=False)
    return buf.getvalue()


def _make_test_zip(entries: dict[str, bytes]) -> bytes:
    """Build an in-memory zip with the given {name: bytes} entries."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


class TestConvertZip:
    def _bus_rows(self) -> list[dict]:
        return [
            {"STOP_NAME": "Stop A", "LINE": 90, "DIRECTION": "IB",
             "WD_ONS": 100, "WD_OFFS": 90, "WD_ACT": 190,
             "SA_ONS": 60,  "SA_OFFS": 55, "SA_ACT": 115,
             "SU_ONS": 40,  "SU_OFFS": 35, "SU_ACT": 75},
        ]

    def _rail_rows(self) -> list[dict]:
        return [
            {"LINE": 807, "ROUTE": 807, "STATION_ORDER": "Station 1",
             "WD_ONS": 500, "WD_OFFS": 490, "WD_ACT": 990,
             "SA_ONS": 250, "SA_OFFS": 240, "SA_ACT": 490,
             "SU_ONS": 200, "SU_OFFS": 190, "SU_ACT": 390},
        ]

    def test_bus_zip_correct_mode_and_months(self, tmp_path):
        bus_xlsx = _make_xlsx_bytes(self._bus_rows(), ce.BUS_COLS)
        zip_bytes = _make_test_zip({
            "Bus 2025/2025-07.xlsx": bus_xlsx,
            "Bus 2025/2025-08.xlsx": bus_xlsx,
        })
        zip_path = tmp_path / "Bus 2025.zip"
        zip_path.write_bytes(zip_bytes)

        result = convert_zip(zip_path)
        assert set(result["Month"].unique()) == {7, 8}
        assert all(result["Mode"] == "Bus")
        assert all(result["Year"] == 2025)

    def test_rail_zip_correct_mode(self, tmp_path):
        rail_xlsx = _make_xlsx_bytes(self._rail_rows(), ce.RAIL_COLS)
        zip_bytes = _make_test_zip({"2025-07.xlsx": rail_xlsx})
        zip_path = tmp_path / "Rail 2025.zip"
        zip_path.write_bytes(zip_bytes)

        result = convert_zip(zip_path)
        assert all(result["Mode"] == "Rail")
        assert all(result["Year"] == 2025)
        assert all(result["Month"] == 7)

    def test_non_xlsx_entries_ignored(self, tmp_path):
        bus_xlsx = _make_xlsx_bytes(self._bus_rows(), ce.BUS_COLS)
        zip_bytes = _make_test_zip({
            "Bus 2025/2025-07.xlsx": bus_xlsx,
            "Bus 2025/README.txt": b"ignore me",
        })
        zip_path = tmp_path / "Bus 2025.zip"
        zip_path.write_bytes(zip_bytes)

        result = convert_zip(zip_path)
        assert len(result) > 0  # only xlsx processed

    def test_typed_inner_file_with_unparseable_zip_name_raises(self, tmp_path):
        """A YYYY-MM.xlsx inner file needs its mode from the zip name; an
        unparseable zip name must raise rather than guess."""
        rail_xlsx = _make_xlsx_bytes(self._rail_rows(), ce.RAIL_COLS)
        zip_path = tmp_path / "mystery.zip"
        zip_path.write_bytes(_make_test_zip({"2025-07.xlsx": rail_xlsx}))
        with pytest.raises(ValueError, match="Cannot parse mode"):
            convert_zip(zip_path)

    def test_empty_zip_raises(self, tmp_path):
        zip_path = tmp_path / "Bus 2025.zip"
        zip_path.write_bytes(_make_test_zip({"ignored.txt": b""}))
        with pytest.raises(ValueError, match="No .*files found"):
            convert_zip(zip_path)

    def test_date_range_zip_mixed_modes_and_months(self, tmp_path):
        """A date-range zip named YYYY-MM_YYYY-MM.zip whose inner files are
        MM-YYYY-{Bus|Rail}.xlsx: mode/month/year come from each inner filename."""
        bus_xlsx = _make_xlsx_bytes(self._bus_rows(), ce.BUS_COLS)
        rail_xlsx = _make_xlsx_bytes(self._rail_rows(), ce.RAIL_COLS)
        zip_bytes = _make_test_zip({
            "04-2026-Bus.xlsx": bus_xlsx,
            "04-2026-Rail.xlsx": rail_xlsx,
            "05-2026-Bus.xlsx": bus_xlsx,
        })
        zip_path = tmp_path / "2026-04_2026-05.zip"
        zip_path.write_bytes(zip_bytes)

        result = convert_zip(zip_path)
        assert set(result["Mode"].unique()) == {"Bus", "Rail"}
        assert set(result["Month"].unique()) == {4, 5}
        assert all(result["Year"] == 2026)
        # Bus line 90 and Rail line 807 both present
        assert {90, 807} <= set(result["Line"].unique())

    def test_date_range_zip_no_matching_files_raises(self, tmp_path):
        zip_path = tmp_path / "2026-04_2026-05.zip"
        zip_path.write_bytes(_make_test_zip({"notes.txt": b"nothing here"}))
        with pytest.raises(ValueError, match="No .*files found"):
            convert_zip(zip_path)


# ---------------------------------------------------------------------------
# extract_leaf_rows — the single source of truth for what counts as an observation
# ---------------------------------------------------------------------------

class TestExtractLeafRows:
    def test_bus_total_direction_rows_dropped(self):
        leaf = extract_leaf_rows(_make_bus_df_with_totals(), mode="Bus")
        assert len(leaf) == 4
        assert "Total" not in set(leaf["DIRECTION"])

    def test_rail_line_and_route_total_rows_dropped(self):
        leaf = extract_leaf_rows(_make_rail_df_with_totals(), mode="Rail")
        assert len(leaf) == 2
        assert "Total" not in set(leaf["STATION_ORDER"].astype(str))

    def test_rail_line_resolved_to_route(self):
        """ROUTE 805 (D/Purple) is nested under LINE 802 (B/Red) in the export.
        The resolution lives here, so every aggregation inherits it."""
        leaf = extract_leaf_rows(_make_nested_route_rail_df(), mode="Rail")
        assert sorted(set(leaf["LINE"])) == [802, 805]

    def test_rail_nonnumeric_route_falls_back_to_line(self):
        leaf = extract_leaf_rows(_make_rail_df(), mode="Rail")
        assert set(leaf["LINE"]) == {807}

    def test_all_leaf_value_columns_coerced_to_numbers(self):
        df = pd.DataFrame({
            "STOP_NAME": ["Stop A"],
            "LINE":      [90],
            "DIRECTION": ["IB"],
            "WD_ONS":    ["150"],   "WD_OFFS": ["140"],           "WD_ACT": ["290"],
            "SA_ONS":    ["80"],    "SA_OFFS": [float("nan")],    "SA_ACT": ["155"],
            "SU_ONS":    ["60"],    "SU_OFFS": ["55"],            "SU_ACT": ["115"],
        })
        leaf = extract_leaf_rows(df, mode="Bus")
        for col in LEAF_VALUE_COLS:
            assert pd.api.types.is_numeric_dtype(leaf[col])
        assert leaf.iloc[0]["SA_OFFS"] == 0.0

    def test_returns_a_copy(self):
        """Callers mutate the result; the raw frame must not follow."""
        df = _make_bus_df()
        leaf = extract_leaf_rows(df, mode="Bus")
        leaf["WD_ONS"] = 0.0
        assert df["WD_ONS"].iloc[0] == 100.0


# ---------------------------------------------------------------------------
# aggregate_to_stop_ridership
# ---------------------------------------------------------------------------

def _make_bus_df_one_stop_two_directions() -> pd.DataFrame:
    """One line, one stop name, both directions — the collapse case."""
    return pd.DataFrame({
        "STOP_NAME": ["Vermont / Wilshire", "Vermont / Wilshire"],
        "LINE":      [204,                  204],
        "DIRECTION": ["North",              "South"],
        "WD_ONS":    [100.0,                120.0],
        "WD_OFFS":   [90.0,                 130.0],
        "WD_ACT":    [190.0,                250.0],
        "SA_ONS":    [60.0,                 70.0],
        "SA_OFFS":   [55.0,                 75.0],
        "SA_ACT":    [115.0,                145.0],
        "SU_ONS":    [40.0,                 50.0],
        "SU_OFFS":   [35.0,                 55.0],
        "SU_ACT":    [75.0,                 105.0],
    })


def _make_bus_df_with_unnamed_stop() -> pd.DataFrame:
    """A leaf row carrying riders and no stop name — the shape of the row in
    06-2026-Bus.xlsx that used to take the whole ingest down."""
    return pd.DataFrame({
        "STOP_NAME": ["Vermont / Wilshire", None,  "   "],
        "LINE":      [204,                  155,   155],
        "DIRECTION": ["North",              "East", "West"],
        "WD_ONS":    [100.0,                2.9,   1.1],
        "WD_OFFS":   [90.0,                 1.6,   0.4],
        "WD_ACT":    [190.0,                4.5,   1.5],
        "SA_ONS":    [60.0,                 4.5,   0.0],
        "SA_OFFS":   [55.0,                 0.0,   0.0],
        "SA_ACT":    [115.0,                4.5,   0.0],
        "SU_ONS":    [40.0,                 1.0,   0.0],
        "SU_OFFS":   [35.0,                 3.0,   0.0],
        "SU_ACT":    [75.0,                 4.0,   0.0],
    })


class TestUnnamedStopRows:
    """A row can carry riders and no stop name. `stop_identity` refuses to invent an
    identity for it, so before this was handled `aggregate_to_stop_ridership` raised on
    any file containing one — which `data/raw/06-2026-Bus.xlsx` does."""

    def test_stop_grain_does_not_raise(self):
        result = aggregate_to_stop_ridership(
            _make_bus_df_with_unnamed_stop(), year=2026, month=6, mode="Bus"
        )
        assert list(result["stop_key"]) == ["bus:vermont-wilshire"]

    def test_the_nameless_riders_stay_in_the_line_total(self):
        """Dropping them upstream in extract_leaf_rows would take them out of the line
        totals too, quietly restating committed history in ridership.json. Those riders
        really did board line 155; only where is missing."""
        lines = aggregate_to_line_ridership(
            _make_bus_df_with_unnamed_stop(), year=2026, month=6, mode="Bus"
        )
        weekday = lines[lines["DayType"] == "DX"].set_index("Line")["Riders"]
        assert weekday[155] == pytest.approx(4.0)

    def test_leaf_rows_still_carries_them(self):
        leaf = extract_leaf_rows(_make_bus_df_with_unnamed_stop(), "Bus")
        assert len(leaf) == 3

    def test_it_says_so_on_stdout(self, capsys):
        """Silently discarding rows is how a pipeline loses data nobody notices."""
        aggregate_to_stop_ridership(
            _make_bus_df_with_unnamed_stop(), year=2026, month=6, mode="Bus"
        )
        assert "2 leaf row(s) have no stop name" in capsys.readouterr().out

    def test_a_fully_named_frame_prints_nothing(self, capsys):
        aggregate_to_stop_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        assert capsys.readouterr().out == ""


def _make_nested_route_rail_df() -> pd.DataFrame:
    """Two stations on ROUTE 802 (B/Red) and two on ROUTE 805 (D/Purple), both
    filed by Metro under LINE 802 — the shape that has mis-attributed the Purple
    Line's riders to the Red Line before."""
    return pd.DataFrame({
        "LINE":          [802,   802,   802,   802],
        "ROUTE":         ["802", "802", "805", "805"],
        "STATION_ORDER": ["4001-Union Station - Metro Red & Purple Lines",
                          "4002-Civic Center / Grand Park Station",
                          "5006-Wilshire / Vermont Station",
                          "5007-Wilshire / Normandie Station"],
        "WD_ONS":        [100.0, 200.0, 40.0,  60.0],
        "WD_OFFS":       [110.0, 190.0, 45.0,  55.0],
        "WD_ACT":        [210.0, 390.0, 85.0,  115.0],
        "SA_ONS":        [10.0,  20.0,  4.0,   6.0],
        "SA_OFFS":       [11.0,  19.0,  5.0,   5.0],
        "SA_ACT":        [21.0,  39.0,  9.0,   11.0],
        "SU_ONS":        [5.0,   15.0,  2.0,   8.0],
        "SU_OFFS":       [6.0,   14.0,  3.0,   7.0],
        "SU_ACT":        [11.0,  29.0,  5.0,   15.0],
    })


class TestAggregateToStopRidership:
    def test_output_columns_match_the_frozen_schema(self):
        result = aggregate_to_stop_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        assert list(result.columns) == STOP_OUTPUT_COLS

    def test_activity_columns_dropped(self):
        """*_ACT equals ons + offs; it is recomputed client-side, never shipped."""
        result = aggregate_to_stop_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        assert not [c for c in result.columns if c.endswith("_act")]

    def test_metadata_fields_populated(self):
        result = aggregate_to_stop_ridership(_make_bus_df(), year=2026, month=2, mode="Bus")
        assert set(result["year"]) == {2026}
        assert set(result["month"]) == {2}
        assert set(result["mode"]) == {"Bus"}

    def test_one_row_per_line_per_stop(self):
        result = aggregate_to_stop_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        assert len(result) == 4
        assert not result.duplicated(subset=["line", "stop_key"]).any()

    def test_bus_direction_collapsed(self):
        """Both directions of a stop share a name and therefore a coordinate; the
        grain is stop x line, not stop x line x direction."""
        result = aggregate_to_stop_ridership(
            _make_bus_df_one_stop_two_directions(), year=2026, month=1, mode="Bus"
        )
        assert len(result) == 1
        row = result.iloc[0]
        assert row["stop_key"] == "bus:vermont-wilshire"
        assert row["wd_ons"] == 220.0    # 100 + 120
        assert row["wd_offs"] == 220.0   # 90 + 130

    def test_alightings_preserved(self):
        """Offs are new signal — the line-level pipeline discards them entirely."""
        result = aggregate_to_stop_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        stop_a = result[result["stop_key"] == "bus:stop-a"].iloc[0]
        assert stop_a["wd_offs"] == 90.0
        assert stop_a["sa_offs"] == 55.0
        assert stop_a["su_offs"] == 35.0

    def test_bus_total_direction_rows_excluded(self):
        with_totals = aggregate_to_stop_ridership(
            _make_bus_df_with_totals(), year=2026, month=1, mode="Bus"
        )
        without = aggregate_to_stop_ridership(
            _make_bus_df(), year=2026, month=1, mode="Bus"
        )
        pd.testing.assert_frame_equal(with_totals, without)

    def test_rail_total_rows_excluded(self):
        with_totals = aggregate_to_stop_ridership(
            _make_rail_df_with_totals(), year=2026, month=1, mode="Rail"
        )
        without = aggregate_to_stop_ridership(
            _make_rail_df(), year=2026, month=1, mode="Rail"
        )
        pd.testing.assert_frame_equal(with_totals, without)

    def test_station_order_parsed_for_rail(self):
        result = aggregate_to_stop_ridership(
            _make_nested_route_rail_df(), year=2026, month=5, mode="Rail"
        )
        union = result[result["stop_key"] == "rail:union-station"].iloc[0]
        assert union["station_order"] == 4001
        assert union["stop_name"] == "Union Station"

    def test_station_order_is_null_for_bus(self):
        result = aggregate_to_stop_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        assert result["station_order"].isna().all()

    def test_rows_sorted_deterministically(self):
        """An unstable order would produce a phantom multi-megabyte diff on write."""
        result = aggregate_to_stop_ridership(
            _make_nested_route_rail_df(), year=2026, month=5, mode="Rail"
        )
        expected = result.sort_values(["line", "stop_key"]).reset_index(drop=True)
        pd.testing.assert_frame_equal(result, expected)


class TestDLineNotAttributedToBLine:
    """ROUTE 805 (D/Purple) is nested under LINE 802 (B/Red) in Metro's export.
    Any aggregation that skips extract_leaf_rows files the D Line's stations under
    the B Line. This has bitten the line-level pipeline before; it must not bite
    the stop level."""

    def test_d_line_stations_are_filed_under_805(self):
        result = aggregate_to_stop_ridership(
            _make_nested_route_rail_df(), year=2026, month=5, mode="Rail"
        )
        purple_stops = set(result[result["line"] == 805]["stop_key"])
        assert purple_stops == {
            "rail:wilshire-vermont-station",
            "rail:wilshire-normandie-station",
        }

    def test_b_line_does_not_carry_the_d_lines_stations(self):
        result = aggregate_to_stop_ridership(
            _make_nested_route_rail_df(), year=2026, month=5, mode="Rail"
        )
        red_stops = set(result[result["line"] == 802]["stop_key"])
        assert red_stops == {"rail:union-station", "rail:civic-center-grand-park-station"}
        assert "rail:wilshire-vermont-station" not in red_stops

    def test_b_line_boardings_exclude_the_d_lines(self):
        result = aggregate_to_stop_ridership(
            _make_nested_route_rail_df(), year=2026, month=5, mode="Rail"
        )
        red = result[result["line"] == 802]["wd_ons"].sum()
        purple = result[result["line"] == 805]["wd_ons"].sum()
        assert red == 300.0     # 100 + 200, Red only
        assert purple == 100.0  # 40 + 60, Purple broken out


class TestReconciliationInvariant:
    """Per-line sums at stop grain equal the line-level Riders for the same frame,
    asserted **pre-rounding**. This is the single best guard that the leaf-row rule
    has not forked between the two aggregations.

    Note this is an invariant of one frame, not of the shipped files: line ridership
    additionally passes through process_ridership's days-weighted average and each
    stop is rounded on write, so `ridership.json` and the stop files will not agree
    to the digit. See scripts/README.md.
    """

    DAYTYPES = [("wd_ons", "DX"), ("sa_ons", "SA"), ("su_ons", "SU")]

    def _assert_reconciles(self, df, mode):
        stops = aggregate_to_stop_ridership(df, year=2026, month=1, mode=mode)
        lines = aggregate_to_line_ridership(df, year=2026, month=1, mode=mode)
        for stop_col, daytype in self.DAYTYPES:
            per_line = stops.groupby("line")[stop_col].sum()
            expected = lines[lines["DayType"] == daytype].set_index("Line")["Riders"]
            assert set(per_line.index) == set(expected.index)
            for line_id, total in per_line.items():
                assert total == pytest.approx(expected[line_id]), (
                    f"{mode} line {line_id} {daytype}"
                )

    def test_bus(self):
        self._assert_reconciles(_make_bus_df(), "Bus")

    def test_bus_with_total_rows(self):
        self._assert_reconciles(_make_bus_df_with_totals(), "Bus")

    def test_bus_with_collapsed_directions(self):
        self._assert_reconciles(_make_bus_df_one_stop_two_directions(), "Bus")

    def test_rail(self):
        self._assert_reconciles(_make_rail_df(), "Rail")

    def test_rail_with_total_rows(self):
        self._assert_reconciles(_make_rail_df_with_totals(), "Rail")

    def test_rail_with_nested_routes(self):
        self._assert_reconciles(_make_nested_route_rail_df(), "Rail")


# ---------------------------------------------------------------------------
# DAYTYPE_MAP completeness
# ---------------------------------------------------------------------------

def test_daytype_map_covers_all_ons_columns():
    assert set(DAYTYPE_MAP.keys()) == {"WD_ONS", "SA_ONS", "SU_ONS"}
    assert set(DAYTYPE_MAP.values()) == {"DX", "SA", "SU"}
