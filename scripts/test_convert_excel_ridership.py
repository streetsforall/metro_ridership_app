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
    convert_zip,
    DAYTYPE_MAP,
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
# DAYTYPE_MAP completeness
# ---------------------------------------------------------------------------

def test_daytype_map_covers_all_ons_columns():
    assert set(DAYTYPE_MAP.keys()) == {"WD_ONS", "SA_ONS", "SU_ONS"}
    assert set(DAYTYPE_MAP.values()) == {"DX", "SA", "SU"}
