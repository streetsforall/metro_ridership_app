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

    def test_leading_gap_padded(self):
        """Line 4 starts reporting in Feb; it gets a pad row for Jan."""
        df = pd.DataFrame([
            self._base(line_name=2, month=1),
            self._base(line_name=2, month=2),
            self._base(line_name=4, month=2),
        ])
        result = fill_missing_months(df)

        pad = result[(result["line_name"] == 4) & (result["month"] == 1)]
        assert len(pad) == 1
        assert pd.isna(pad.iloc[0]["est_wkday_ridership"])

    def test_pad_rows_are_null_not_zero(self):
        """Pads must stay NaN so merge_ridership can tell them from a line that
        genuinely reported zero riders."""
        df = pd.DataFrame([
            self._base(line_name=2, month=1),
            self._base(line_name=4, month=2),
        ])
        result = fill_missing_months(df)

        pad = result[(result["line_name"] == 4) & (result["month"] == 1)]
        assert pad[pr.RIDERSHIP_COLS[3:]].isnull().all().all()

    def test_trailing_gap_not_padded(self):
        """The line-106 shape: a line that stops reporting mid-batch gets no
        rows for the months after its last report.  A zero row there would
        assert the line ran and carried nobody."""
        df = pd.DataFrame([
            self._base(line_name=2, month=m) for m in (1, 2, 3)
        ] + [
            self._base(line_name=106, month=1),
        ])
        result = fill_missing_months(df)

        trailing = result[(result["line_name"] == 106) & (result["month"] > 1)]
        assert trailing.empty
        assert len(result) == 4

    def test_interior_gap_not_padded(self):
        """A line that reported, paused, and resumed keeps a real gap."""
        df = pd.DataFrame([
            self._base(line_name=2, month=m) for m in (1, 2, 3)
        ] + [
            self._base(line_name=4, month=1),
            self._base(line_name=4, month=3),
        ])
        result = fill_missing_months(df)

        gap = result[(result["line_name"] == 4) & (result["month"] == 2)]
        assert gap.empty

    def test_all_zero_report_is_not_treated_as_missing(self):
        """Line 60 genuinely reported zeros in 2026-01.  Reported-ness comes
        from the merge, not the values, so such a row is kept as reported — and
        therefore still anchors where padding stops."""
        df = pd.DataFrame([
            self._base(line_name=2, month=1),
            self._base(line_name=2, month=2),
            self._base(line_name=60, month=1, est_wkday_ridership=0.0,
                       est_sat_ridership=0.0, est_sun_ridership=0.0),
        ])
        result = fill_missing_months(df)

        jan = result[(result["line_name"] == 60) & (result["month"] == 1)]
        assert len(jan) == 1
        assert jan.iloc[0]["est_wkday_ridership"] == 0
        # Feb is trailing for line 60, so it is absent rather than padded.
        assert result[(result["line_name"] == 60) & (result["month"] == 2)].empty

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

    def test_pad_does_not_overwrite_existing_value(self, tmp_path, monkeypatch):
        """The regression this whole backfill exists for: a pad row (NaN) must
        never replace a real committed figure with a zero."""
        make_ridership_json([self._rec(month=1, est_wkday_ridership=4062.0)],
                            tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec(
            month=1, est_wkday_ridership=float("nan"),
            est_sat_ridership=float("nan"), est_sun_ridership=float("nan"),
        )])
        final, _ = merge_ridership(new_df)

        assert final.iloc[0]["est_wkday_ridership"] == 4062.0
        assert final.iloc[0]["est_sat_ridership"] == 500.0

    def test_genuine_zero_report_still_wins(self, tmp_path, monkeypatch):
        """A line that really reported zero riders is not a pad: it overwrites
        the existing value like any other new figure.  This is what a mask
        keyed on ``== 0`` instead of ``isnull`` would get wrong."""
        make_ridership_json([self._rec(month=1, est_wkday_ridership=4062.0)],
                            tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec(
            month=1, est_wkday_ridership=0.0,
            est_sat_ridership=0.0, est_sun_ridership=0.0,
        )])
        final, _ = merge_ridership(new_df)

        assert final.iloc[0]["est_wkday_ridership"] == 0.0

    def test_unbacked_pad_written_as_zero(self, tmp_path, monkeypatch):
        """A pad for a key ridership.json has never seen is zero-filled, not
        left as a JSON null."""
        make_ridership_json([self._rec(month=1)], tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec(
            month=2, est_wkday_ridership=float("nan"),
            est_sat_ridership=float("nan"), est_sun_ridership=float("nan"),
        )])
        final, _ = merge_ridership(new_df)

        feb = final[final["month"] == 2].iloc[0]
        assert feb["est_wkday_ridership"] == 0.0
        assert not final.isnull().any().any()

    def test_append_only_zero_fills_pads(self, tmp_path, monkeypatch):
        """prefer_new=False appends pads too; they must not reach the JSON as
        nulls."""
        make_ridership_json([self._rec(month=1)], tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([self._rec(
            month=2, est_wkday_ridership=float("nan"),
            est_sat_ridership=float("nan"), est_sun_ridership=float("nan"),
        )])
        final, _ = merge_ridership(new_df, prefer_new=False)

        assert final[final["month"] == 2].iloc[0]["est_wkday_ridership"] == 0.0
        assert not final.isnull().any().any()

    def test_append_only_preserves_existing_on_conflict(self, tmp_path, monkeypatch):
        """prefer_new=False: an existing key keeps its old value; only absent
        keys are added."""
        make_ridership_json([self._rec(month=1, est_wkday_ridership=999.0)], tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")

        new_df = pd.DataFrame([
            self._rec(month=1, est_wkday_ridership=1234.0),  # conflict -> ignored
            self._rec(month=2, est_wkday_ridership=555.0),   # new -> added
        ])
        final, current = merge_ridership(new_df, prefer_new=False)

        jan = final[(final["month"] == 1)].iloc[0]
        feb = final[(final["month"] == 2)].iloc[0]
        assert jan["est_wkday_ridership"] == 999.0  # existing preserved
        assert feb["est_wkday_ridership"] == 555.0  # new appended
        assert len(final) == 2 and len(current) == 1


# ---------------------------------------------------------------------------
# compute_ridership -> fill_missing_months -> merge_ridership
#
# The padding hazard only shows up end-to-end: fill_missing_months manufactures
# rows for months a line never reported, and merge_ridership lets new data win.
# ---------------------------------------------------------------------------

class TestIngestPipeline:
    def _raw(self, month, line, riders):
        """One month of one line, all three DayTypes at the same figure."""
        return [
            dict(year=2026, month=month, line=line, daytype=dt, riders=riders,
                 shakeup=202512, provider="DO", mode="Bus", days=20)
            for dt in ("DX", "SA", "SU")
        ]

    def _ingest(self, raw_rows, tmp_path, monkeypatch, existing):
        make_ridership_json(existing, tmp_path / "r.json")
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", tmp_path / "r.json")
        new_df = fill_missing_months(compute_ridership(make_raw(raw_rows)))
        final, _ = merge_ridership(new_df)
        return final

    def _rec(self, month, line, riders):
        return dict(year=2026, month=month, line_name=line,
                    est_wkday_ridership=float(riders),
                    est_sat_ridership=float(riders),
                    est_sun_ridership=float(riders))

    # merge_ridership reads ridership.json as a DataFrame, so it needs at least
    # one row to have columns to merge on.  This one is outside every batch's
    # range and so never participates.
    _UNRELATED = dict(year=2020, month=1, line_name=999,
                      est_wkday_ridership=1.0, est_sat_ridership=1.0,
                      est_sun_ridership=1.0)

    def test_pause_and_resume_does_not_zero_committed_history(
        self, tmp_path, monkeypatch
    ):
        """Line 4 reported in Jan and Mar but not Feb.  A batch spanning Jan–Mar
        pads Feb; that pad must not overwrite the real Feb figure already in
        ridership.json."""
        raw = (
            self._raw(1, 2, 1000) + self._raw(2, 2, 1100) + self._raw(3, 2, 1200)
            + self._raw(1, 4, 500) + self._raw(3, 4, 600)
        )
        final = self._ingest(raw, tmp_path, monkeypatch, existing=[
            self._rec(1, 4, 500), self._rec(2, 4, 550), self._rec(3, 4, 600),
        ])

        feb = final[(final["line_name"] == 4) & (final["month"] == 2)]
        assert len(feb) == 1
        assert feb.iloc[0]["est_wkday_ridership"] == 550.0

    def test_discontinued_line_gets_no_trailing_zero_rows(
        self, tmp_path, monkeypatch
    ):
        """The line-106 case: line 106 stops reporting after Jan.  A Jan–Mar
        batch must not write Feb/Mar rows claiming it carried nobody."""
        raw = (
            self._raw(1, 2, 1000) + self._raw(2, 2, 1100) + self._raw(3, 2, 1200)
            + self._raw(1, 106, 4062)
        )
        final = self._ingest(raw, tmp_path, monkeypatch, existing=[
            self._rec(1, 106, 4062),
        ])

        assert final[(final["line_name"] == 106) & (final["month"] > 1)].empty
        assert len(final) == 4

    def test_line_start_is_padded_with_zeros(self, tmp_path, monkeypatch):
        """The line-74 case, and the reason padding exists at all: a line whose
        first report falls mid-batch gets zeros for the months before it."""
        raw = (
            self._raw(1, 2, 1000) + self._raw(2, 2, 1100) + self._raw(3, 2, 1200)
            + self._raw(3, 74, 2979)
        )
        final = self._ingest(raw, tmp_path, monkeypatch, existing=[self._UNRELATED])

        line74 = final[final["line_name"] == 74].sort_values("month")
        assert list(line74["month"]) == [1, 2, 3]
        assert list(line74["est_wkday_ridership"]) == [0.0, 0.0, 2979.0]

    def test_no_nulls_reach_the_output(self, tmp_path, monkeypatch):
        raw = self._raw(1, 2, 1000) + self._raw(2, 2, 1100) + self._raw(2, 74, 900)
        final = self._ingest(raw, tmp_path, monkeypatch, existing=[self._UNRELATED])
        assert not final.isnull().any().any()


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
