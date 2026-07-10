"""
Tests for process_ridership.py.

Unit tests cover the weighted-average pivot (compute_ridership), missing-month
padding (fill_missing_months), and merge resolution rules for both ridership
records and line metadata.  File I/O functions use tmp_path + monkeypatch so
no real data files are touched.
"""

import json
from pathlib import Path

import pandas as pd
import pytest

import convert_excel_ridership as ce
import process_ridership as pr
from process_ridership import (
    compute_ridership,
    fill_missing_months,
    load_raw_input,
    merge_line_metadata,
    merge_ridership,
)
from test_convert_excel_ridership import _make_test_zip, _make_xlsx_bytes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_raw(rows: list[dict]) -> pd.DataFrame:
    """Build a raw CSV DataFrame (post-load_raw_csv) from a list of dicts."""
    df = pd.DataFrame(rows)
    df.columns = df.columns.str.lower()
    df["line"] = df["line"].astype(int)
    return df


def make_ridership_json(rows: list[dict], path: Path) -> None:
    path.write_text(json.dumps(rows, indent=2), encoding="utf-8")


def make_metadata_json(rows: list[dict], path: Path) -> None:
    path.write_text(json.dumps(rows, indent=2), encoding="utf-8")


_BUS_ROW = {
    "STOP_NAME": "Stop A", "LINE": 90, "DIRECTION": "IB",
    "WD_ONS": 100, "WD_OFFS": 90, "WD_ACT": 190,
    "SA_ONS": 60, "SA_OFFS": 55, "SA_ACT": 115,
    "SU_ONS": 40, "SU_OFFS": 35, "SU_ACT": 75,
}
_RAIL_ROW = {
    "LINE": 807, "ROUTE": 807, "STATION_ORDER": "Station 1",
    "WD_ONS": 500, "WD_OFFS": 490, "WD_ACT": 990,
    "SA_ONS": 250, "SA_OFFS": 240, "SA_ACT": 490,
    "SU_ONS": 200, "SU_OFFS": 190, "SU_ACT": 390,
}

# The long CSV columns load_raw_csv/load_raw_input normalize to (lowercased).
_LONG_COLS = {
    "year", "month", "line", "daytype", "riders",
    "shakeup", "provider", "mode", "days",
}


# ---------------------------------------------------------------------------
# load_raw_input (format dispatch)
# ---------------------------------------------------------------------------

class TestLoadRawInput:
    def test_csv_uses_load_raw_csv(self, tmp_path):
        csv = tmp_path / "riders.csv"
        csv.write_text(
            "Year,Month,Line,DayType,Riders,Shakeup,Provider,Mode,Days\n"
            "2026,4,90,DX,6228,S1,DO,Bus,1\n",
            encoding="utf-8",
        )
        df = load_raw_input(str(csv))
        assert _LONG_COLS <= set(df.columns)
        assert df["line"].dtype.kind == "i"

    def test_xlsx_dispatches_to_convert_file(self, tmp_path):
        xlsx = tmp_path / "04-2026-Bus.xlsx"
        xlsx.write_bytes(_make_xlsx_bytes([_BUS_ROW], ce.BUS_COLS))
        df = load_raw_input(str(xlsx))
        # Same normalized schema as the CSV path
        assert _LONG_COLS <= set(df.columns)
        assert df["line"].dtype.kind == "i"
        assert set(df["daytype"]) == {"DX", "SA", "SU"}
        assert (df["month"] == 4).all() and (df["year"] == 2026).all()

    def test_zip_dispatches_to_convert_zip(self, tmp_path):
        zip_path = tmp_path / "2026-04_2026-05.zip"
        zip_path.write_bytes(_make_test_zip({
            "04-2026-Bus.xlsx": _make_xlsx_bytes([_BUS_ROW], ce.BUS_COLS),
            "05-2026-Rail.xlsx": _make_xlsx_bytes([_RAIL_ROW], ce.RAIL_COLS),
        }))
        df = load_raw_input(str(zip_path))
        assert _LONG_COLS <= set(df.columns)
        assert df["line"].dtype.kind == "i"
        assert set(df["mode"]) == {"Bus", "Rail"}
        assert set(df["month"]) == {4, 5}


# ---------------------------------------------------------------------------
# compute_ridership
# ---------------------------------------------------------------------------

class TestComputeRidership:
    def _raw(self, **kwargs):
        defaults = dict(year=2024, month=1, line=2, provider="DO",
                        mode="Bus", shakeup=202312, days=23)
        return {**defaults, **kwargs}

    def test_single_shakeup_pivot(self):
        raw = make_raw([
            self._raw(daytype="DX", riders=1000),
            self._raw(daytype="SA", riders=500),
            self._raw(daytype="SU", riders=300),
        ])
        result = compute_ridership(raw)
        assert len(result) == 1
        row = result.iloc[0]
        assert row["est_wkday_ridership"] == 1000
        assert row["est_sat_ridership"] == 500
        assert row["est_sun_ridership"] == 300

    def test_output_columns(self):
        raw = make_raw([
            self._raw(daytype="DX", riders=100),
            self._raw(daytype="SA", riders=50),
            self._raw(daytype="SU", riders=25),
        ])
        result = compute_ridership(raw)
        assert list(result.columns) == pr.RIDERSHIP_COLS

    def test_line_name_is_int(self):
        raw = make_raw([
            self._raw(daytype="DX", riders=100),
            self._raw(daytype="SA", riders=50),
            self._raw(daytype="SU", riders=25),
        ])
        result = compute_ridership(raw)
        assert result["line_name"].dtype.kind == "i"

    def test_weighted_average_across_shakeups(self):
        """Two shakeup periods in the same month are days-weighted and rounded
        using Metro's +0.5 convention: int(average(riders + 0.5, weights=days))."""
        raw = make_raw([
            # shakeup A: 20 weekdays, 100 riders
            self._raw(daytype="DX", riders=100, shakeup=202312, days=20),
            # shakeup B: 10 weekdays, 200 riders
            self._raw(daytype="DX", riders=200, shakeup=202401, days=10),
            # SA/SU each have a single shakeup for simplicity
            self._raw(daytype="SA", riders=50, shakeup=202312, days=5),
            self._raw(daytype="SU", riders=30, shakeup=202312, days=5),
        ])
        result = compute_ridership(raw)
        # (100.5*20 + 200.5*10) / 30 = 133.833… → int = 133
        assert result.iloc[0]["est_wkday_ridership"] == 133

    def test_multiple_lines(self):
        raw = make_raw([
            self._raw(line=2, daytype="DX", riders=1000),
            self._raw(line=2, daytype="SA", riders=500),
            self._raw(line=2, daytype="SU", riders=300),
            self._raw(line=4, daytype="DX", riders=2000),
            self._raw(line=4, daytype="SA", riders=1000),
            self._raw(line=4, daytype="SU", riders=600),
        ])
        result = compute_ridership(raw)
        assert len(result) == 2
        assert set(result["line_name"]) == {2, 4}

    def test_multiple_months(self):
        raw = make_raw([
            self._raw(month=1, daytype="DX", riders=100),
            self._raw(month=1, daytype="SA", riders=50),
            self._raw(month=1, daytype="SU", riders=25),
            self._raw(month=2, daytype="DX", riders=110),
            self._raw(month=2, daytype="SA", riders=55),
            self._raw(month=2, daytype="SU", riders=28),
        ])
        result = compute_ridership(raw)
        assert len(result) == 2
        assert set(result["month"]) == {1, 2}


# ---------------------------------------------------------------------------
# fill_missing_months
# ---------------------------------------------------------------------------

class TestFillMissingMonths:
    def _base(self, **kwargs):
        defaults = dict(year=2024, month=1, line_name=2,
                        est_wkday_ridership=1000.0,
                        est_sat_ridership=500.0,
                        est_sun_ridership=300.0)
        return {**defaults, **kwargs}

    def test_no_gaps_unchanged(self):
        df = pd.DataFrame([self._base()])
        result = fill_missing_months(df)
        assert len(result) == 1

    def test_missing_line_filled_with_zeros(self):
        """Line 2 has data for Jan; line 4 does not.  Line 4 should get a zero row."""
        df = pd.DataFrame([
            self._base(line_name=2, month=1),
            self._base(line_name=4, month=2),
        ])
        result = fill_missing_months(df)
        # 2 lines × 2 months = 4 rows
        assert len(result) == 4
        missing = result[(result["line_name"] == 2) & (result["month"] == 2)]
        assert missing.iloc[0]["est_wkday_ridership"] == 0

    def test_existing_values_preserved(self):
        df = pd.DataFrame([
            self._base(line_name=2, month=1, est_wkday_ridership=999.0),
            self._base(line_name=4, month=1, est_wkday_ridership=888.0),
        ])
        result = fill_missing_months(df)
        assert result[(result["line_name"] == 2)]["est_wkday_ridership"].iloc[0] == 999.0
        assert result[(result["line_name"] == 4)]["est_wkday_ridership"].iloc[0] == 888.0

    def test_output_sorted(self):
        df = pd.DataFrame([
            self._base(year=2024, month=3, line_name=10),
            self._base(year=2024, month=1, line_name=2),
        ])
        result = fill_missing_months(df)
        assert list(result["year"]) == sorted(result["year"].tolist())

    def test_output_columns(self):
        df = pd.DataFrame([self._base()])
        result = fill_missing_months(df)
        assert list(result.columns) == pr.RIDERSHIP_COLS


# ---------------------------------------------------------------------------
# merge_ridership
# ---------------------------------------------------------------------------

class TestMergeRidership:
    def _rec(self, **kwargs):
        defaults = dict(year=2024, month=1, line_name=2,
                        est_wkday_ridership=1000.0,
                        est_sat_ridership=500.0,
                        est_sun_ridership=300.0)
        return {**defaults, **kwargs}

    def test_new_record_added(self, tmp_path, monkeypatch):
        make_ridership_json([self._rec(month=1)], tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec(month=1), self._rec(month=2)])
        final, current = merge_ridership(new_df)

        assert len(final) == 2
        assert len(current) == 1

    def test_new_data_wins_on_conflict(self, tmp_path, monkeypatch):
        make_ridership_json([self._rec(est_wkday_ridership=999.0)], tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec(est_wkday_ridership=1234.0)])
        final, _ = merge_ridership(new_df)

        assert final.iloc[0]["est_wkday_ridership"] == 1234.0

    def test_old_records_outside_new_range_preserved(self, tmp_path, monkeypatch):
        """An old record whose year/month isn't in new_df must survive."""
        make_ridership_json(
            [self._rec(year=2020, month=6), self._rec(year=2024, month=1)],
            tmp_path / "r.json",
        )
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec(year=2024, month=1)])
        final, _ = merge_ridership(new_df)

        assert len(final) == 2
        assert any((final["year"] == 2020) & (final["month"] == 6))

    def test_no_duplicates(self, tmp_path, monkeypatch):
        make_ridership_json([self._rec()], tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec()])
        final, _ = merge_ridership(new_df)

        dupes = final.duplicated(subset=["year", "month", "line_name"])
        assert not dupes.any()

    def test_no_change_returns_equal_dataframes(self, tmp_path, monkeypatch):
        make_ridership_json([self._rec()], tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec()])
        final, current = merge_ridership(new_df)

        assert final.equals(current)


# ---------------------------------------------------------------------------
# merge_line_metadata
# ---------------------------------------------------------------------------

class TestMergeLineMetadata:
    def _meta(self, line=2, mode="Bus", provider="DO"):
        return dict(line=line, mode=mode, provider=provider)

    def _raw(self, line=2, mode="Bus", provider="DO"):
        return dict(year=2024, month=1, line=line, daytype="DX", riders=100,
                    shakeup=202312, provider=provider, mode=mode, days=23)

    def test_new_line_added(self, tmp_path, monkeypatch):
        make_metadata_json([self._meta(line=2)], tmp_path / "m.json")
        monkeypatch.setattr(pr, "METADATA_PATH", tmp_path / "m.json")

        raw = make_raw([self._raw(line=2), self._raw(line=4)])
        final, current = merge_line_metadata(raw)

        assert len(final) == 2
        assert len(current) == 1
        assert 4 in final["line"].values

    def test_existing_line_not_duplicated(self, tmp_path, monkeypatch):
        make_metadata_json([self._meta(line=2)], tmp_path / "m.json")
        monkeypatch.setattr(pr, "METADATA_PATH", tmp_path / "m.json")

        raw = make_raw([self._raw(line=2)])
        final, _ = merge_line_metadata(raw)

        assert len(final) == 1

    def test_no_change_same_length(self, tmp_path, monkeypatch):
        make_metadata_json([self._meta(line=2)], tmp_path / "m.json")
        monkeypatch.setattr(pr, "METADATA_PATH", tmp_path / "m.json")

        raw = make_raw([self._raw(line=2)])
        final, current = merge_line_metadata(raw)

        assert len(final) == len(current)

    def test_same_line_different_modes_not_collapsed(self, tmp_path, monkeypatch):
        """A line that appears as both Bus and Rail must produce two metadata rows."""
        make_metadata_json([], tmp_path / "m.json")
        monkeypatch.setattr(pr, "METADATA_PATH", tmp_path / "m.json")

        raw = make_raw([
            self._raw(line=801, mode="Rail", provider="DO"),
            self._raw(line=801, mode="Bus", provider="DO"),
        ])
        final, _ = merge_line_metadata(raw)

        assert len(final) == 2
