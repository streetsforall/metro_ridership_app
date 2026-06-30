"""
Tests for convert_excel_ridership.py.

All tests use synthetic DataFrames — no real Excel files are required.
"""

from pathlib import Path

import pandas as pd
import pytest

import convert_excel_ridership as ce
from convert_excel_ridership import (
    parse_filename,
    aggregate_to_line_ridership,
    DAYTYPE_MAP,
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


class TestAggregateToLineRidership:
    def test_sums_boardings_across_stops_and_directions(self):
        result = aggregate_to_line_ridership(_make_bus_df(), year=2026, month=1, mode="Bus")
        # Line 90: WD_ONS = 100 + 120 = 220
        row = result[(result["Line"] == 90) & (result["DayType"] == "DX")]
        assert row.iloc[0]["Riders"] == 220.0

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
# DAYTYPE_MAP completeness
# ---------------------------------------------------------------------------

def test_daytype_map_covers_all_ons_columns():
    assert set(DAYTYPE_MAP.keys()) == {"WD_ONS", "SA_ONS", "SU_ONS"}
    assert set(DAYTYPE_MAP.values()) == {"DX", "SA", "SU"}
