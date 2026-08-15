"""
Tests for stop_ridership.py — the wire format, the append-only merge, the rename
guard and the reconciliation report.

Synthetic frames and in-memory xlsx throughout, matching the existing style. The two
committed payloads are never read or written: `STOP_PATHS` is redirected to tmp files
by the tests that need it.
"""

import json
from pathlib import Path

import pandas as pd
import pytest

import convert_excel_ridership as ce
import process_ridership as pr
import stop_identity
import stop_ridership as sr
from test_convert_excel_ridership import _make_xlsx_bytes, _make_test_zip


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _long(year=2026, month=1, line=90, key="bus:stop-a", name="Stop A",
          station_order=None, wd_ons=100.0, wd_offs=90.0, sa_ons=60.0,
          sa_offs=55.0, su_ons=40.0, su_offs=35.0) -> dict:
    return dict(
        year=year, month=month, line=line, stop_key=key, stop_name=name,
        station_order=station_order, wd_ons=wd_ons, wd_offs=wd_offs,
        sa_ons=sa_ons, sa_offs=sa_offs, su_ons=su_ons, su_offs=su_offs,
    )


def _frame(rows: list[dict]) -> pd.DataFrame:
    frame = pd.DataFrame(rows, columns=sr.LONG_COLS)
    return frame.astype({"station_order": "Int64"})


def _bus_row(stop: str, line: int, direction: str = "IB", ons: float = 100.0,
             offs: float = 90.0) -> dict:
    return {
        "STOP_NAME": stop, "LINE": line, "DIRECTION": direction,
        "WD_ONS": ons, "WD_OFFS": offs, "WD_ACT": ons + offs,
        "SA_ONS": ons / 2, "SA_OFFS": offs / 2, "SA_ACT": (ons + offs) / 2,
        "SU_ONS": ons / 4, "SU_OFFS": offs / 4, "SU_ACT": (ons + offs) / 4,
    }


def _rail_row(station_order: str, line: int, route: int | None = None,
              ons: float = 500.0, offs: float = 480.0) -> dict:
    return {
        "LINE": line, "ROUTE": route if route is not None else line,
        "STATION_ORDER": station_order,
        "WD_ONS": ons, "WD_OFFS": offs, "WD_ACT": ons + offs,
        "SA_ONS": ons / 2, "SA_OFFS": offs / 2, "SA_ACT": (ons + offs) / 2,
        "SU_ONS": ons / 4, "SU_OFFS": offs / 4, "SU_ACT": (ons + offs) / 4,
    }


def _write_xlsx(dir_: Path, month: int, year: int, mode: str, rows: list[dict]) -> Path:
    cols = ce.BUS_COLS if mode == "Bus" else ce.RAIL_COLS
    path = dir_ / f"{month:02d}-{year}-{mode}.xlsx"
    path.write_bytes(_make_xlsx_bytes(rows, cols))
    return path


@pytest.fixture
def stop_paths(tmp_path, monkeypatch):
    """Redirect the two payload paths at tmp files."""
    paths = {
        "Bus": tmp_path / "stop_ridership.bus.json",
        "Rail": tmp_path / "stop_ridership.rail.json",
    }
    monkeypatch.setattr(sr, "STOP_PATHS", paths)
    return paths


# ---------------------------------------------------------------------------
# The wire format
# ---------------------------------------------------------------------------

class TestWireFormat:
    def test_round_trip_is_lossless(self, tmp_path):
        rows = [
            _long(month=1, key="bus:stop-a"),
            _long(month=1, key="bus:stop-b", name="Stop B", line=117),
            _long(month=2, key="bus:stop-a"),
        ]
        path = tmp_path / "bus.json"
        sr.write_stop_ridership(path, _frame(rows))

        pd.testing.assert_frame_equal(
            sr.load_stop_ridership(path),
            _frame(rows).sort_values(sr.STOP_KEYS).reset_index(drop=True).astype(
                {col: "int64" for col in sr.VALUE_COLS}
            ),
        )

    def test_payload_shape_matches_the_decoder_contract(self, tmp_path):
        path = tmp_path / "rail.json"
        sr.write_stop_ridership(
            path,
            _frame([
                _long(key="rail:union-station", name="Union Station",
                      station_order=1, line=802),
            ]),
        )
        payload = json.loads(path.read_text(encoding="utf-8"))

        assert payload["schema"] == 1
        assert payload["cols"] == [
            "year", "month", "line", "stop",
            "wd_ons", "wd_offs", "sa_ons", "sa_offs", "su_ons", "su_offs",
        ]
        # mode is not a column — one file per mode, and the client reads the key prefix
        assert "mode" not in payload["cols"]
        assert payload["stops"] == [
            {"key": "rail:union-station", "name": "Union Station", "station_order": 1}
        ]
        assert payload["rows"] == [[2026, 1, 802, 0, 100, 90, 60, 55, 40, 35]]

    def test_stop_is_an_index_into_the_dictionary(self, tmp_path):
        path = tmp_path / "bus.json"
        sr.write_stop_ridership(
            path,
            _frame([
                _long(key="bus:zulu", name="Zulu"),
                _long(key="bus:alpha", name="Alpha", line=117),
            ]),
        )
        payload = json.loads(path.read_text(encoding="utf-8"))

        keys = [stop["key"] for stop in payload["stops"]]
        assert keys == sorted(keys)  # dictionary sorted by key
        stop_index = payload["cols"].index("stop")
        for row in payload["rows"]:
            assert 0 <= row[stop_index] < len(payload["stops"])

    def test_bus_station_order_is_null(self, tmp_path):
        path = tmp_path / "bus.json"
        sr.write_stop_ridership(path, _frame([_long()]))
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert payload["stops"][0]["station_order"] is None

    def test_writes_are_deterministic_regardless_of_input_order(self, tmp_path):
        rows = [
            _long(month=2, key="bus:stop-b", name="Stop B"),
            _long(month=1, key="bus:stop-a", line=117),
            _long(month=1, key="bus:stop-a", line=90),
        ]
        first, second = tmp_path / "a.json", tmp_path / "b.json"
        sr.write_stop_ridership(first, _frame(rows))
        sr.write_stop_ridership(second, _frame(list(reversed(rows))))
        assert first.read_bytes() == second.read_bytes()

    def test_rows_are_sorted_by_stop_keys(self, tmp_path):
        path = tmp_path / "bus.json"
        sr.write_stop_ridership(
            path,
            _frame([
                _long(year=2026, month=2, line=90, key="bus:a"),
                _long(year=2025, month=12, line=117, key="bus:b", name="B"),
                _long(year=2026, month=2, line=10, key="bus:c", name="C"),
            ]),
        )
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert [row[:3] for row in payload["rows"]] == [
            [2025, 12, 117], [2026, 2, 10], [2026, 2, 90],
        ]

    def test_values_use_metros_rounding(self, tmp_path):
        path = tmp_path / "bus.json"
        sr.write_stop_ridership(
            path, _frame([_long(wd_ons=4.4, wd_offs=4.5, sa_ons=0.5, sa_offs=0.49)])
        )
        payload = json.loads(path.read_text(encoding="utf-8"))
        row = payload["rows"][0]
        cols = payload["cols"]
        assert row[cols.index("wd_ons")] == 4      # 4.4 -> 4
        assert row[cols.index("wd_offs")] == 5     # 4.5 -> 5, half up
        assert row[cols.index("sa_ons")] == 1
        assert row[cols.index("sa_offs")] == 0

    def test_rounding_is_idempotent(self, tmp_path):
        """A committed payload re-written unchanged must produce the same bytes, or
        every run rounds the rounded values again and the diff never settles."""
        path = tmp_path / "bus.json"
        sr.write_stop_ridership(path, _frame([_long(wd_ons=4.4)]))
        before = path.read_bytes()
        sr.write_stop_ridership(path, sr.load_stop_ridership(path))
        assert path.read_bytes() == before

    def test_one_json_array_per_line(self, tmp_path):
        path = tmp_path / "bus.json"
        sr.write_stop_ridership(
            path, _frame([_long(month=1), _long(month=2), _long(month=3)])
        )
        text = path.read_text(encoding="utf-8")
        assert text.count("\n[2026,") == 3  # one row per line, for a reviewable diff

    def test_unknown_schema_is_rejected(self, tmp_path):
        path = tmp_path / "bus.json"
        path.write_text(json.dumps({"schema": 2, "cols": [], "stops": [], "rows": []}))
        with pytest.raises(ValueError, match="wire schema"):
            sr.load_stop_ridership(path)

    def test_missing_column_is_rejected(self, tmp_path):
        path = tmp_path / "bus.json"
        path.write_text(json.dumps({
            "schema": 1, "cols": ["year", "month", "line", "stop"],
            "stops": [{"key": "bus:a", "name": "A", "station_order": None}],
            "rows": [[2026, 1, 90, 0]],
        }))
        with pytest.raises(ValueError, match="wd_ons"):
            sr.load_stop_ridership(path)

    def test_absent_file_is_the_pre_ingest_state(self, tmp_path):
        frame = sr.load_stop_ridership(tmp_path / "nope.json")
        assert frame.empty
        assert list(frame.columns) == sr.LONG_COLS


# ---------------------------------------------------------------------------
# merge_stop_ridership
# ---------------------------------------------------------------------------

class TestMerge:
    def test_append_only_leaves_existing_rows_byte_identical(self, tmp_path):
        path = tmp_path / "bus.json"
        current_rows = [_long(month=1, wd_ons=100.0), _long(month=2, wd_ons=200.0)]
        sr.write_stop_ridership(path, _frame(current_rows))
        before = path.read_bytes()

        current = sr.load_stop_ridership(path)
        new = _frame([
            _long(month=1, wd_ons=999.0),   # a conflict on an existing key
            _long(month=3, wd_ons=300.0),   # and a genuinely new month
        ])
        sr.write_stop_ridership(path, sr.merge_stop_ridership(new, current))

        # The committed rows come back verbatim and in order, and the new month is
        # appended after them. Anything less and a monthly update rewrites history.
        after = path.read_text(encoding="utf-8")
        committed_rows = json.loads(before)["rows"]
        payload = json.loads(after)
        assert payload["rows"][: len(committed_rows)] == committed_rows
        assert ",\n".join(json.dumps(r, separators=(", ", ": ")) for r in committed_rows) in after

        by_month = {row[1]: row for row in payload["rows"]}
        assert by_month[1][payload["cols"].index("wd_ons")] == 100  # untouched
        assert by_month[3][payload["cols"].index("wd_ons")] == 300  # appended

    def test_overwrite_replaces(self):
        current = _frame([_long(month=1, wd_ons=100.0)])
        new = _frame([_long(month=1, wd_ons=999.0)])
        merged = sr.merge_stop_ridership(new, current, prefer_new=True)
        assert merged["wd_ons"].tolist() == [999.0]

    def test_records_outside_the_new_range_are_preserved(self):
        current = _frame([_long(year=2025, month=7)])
        new = _frame([_long(year=2026, month=6)])
        merged = sr.merge_stop_ridership(new, current)
        assert sorted(merged["month"]) == [6, 7]

    def test_duplicate_keys_collapse(self):
        """data/raw/ can hold a month as both a loose xlsx and inside its zip."""
        duplicated = _frame([_long(wd_ons=100.0), _long(wd_ons=100.0)])
        merged = sr.merge_stop_ridership(duplicated, sr.empty_stop_ridership())
        assert len(merged) == 1


# ---------------------------------------------------------------------------
# detect_renames — §1.3
# ---------------------------------------------------------------------------

class TestDetectRenames:
    def _months(self, spec: dict[int, list[str]]) -> pd.DataFrame:
        return _frame([
            _long(year=2026, month=month, key=key, name=key)
            for month, keys in spec.items() for key in keys
        ])

    def test_fires_on_add_and_drop_in_the_same_month(self):
        frame = self._months({1: ["bus:old-name", "bus:other"],
                              2: ["bus:new-name", "bus:other"]})
        findings = sr.detect_renames(frame, sr.empty_stop_ridership())
        assert len(findings) == 1
        assert findings[0]["month"] == 2
        assert findings[0]["added"] == ["bus:new-name"]
        assert findings[0]["dropped"] == ["bus:old-name"]

    def test_silent_on_a_new_stop_in_the_first_month(self):
        """Every key is new in month 1; that is the dataset starting, not a rename."""
        frame = self._months({1: ["bus:a", "bus:b", "bus:c"]})
        assert sr.detect_renames(frame, sr.empty_stop_ridership()) == []

    def test_silent_on_an_addition_with_no_drop(self):
        """A line extension adds stations and removes none — 2025-09 and 2026-05."""
        frame = self._months({1: ["rail:a"], 2: ["rail:a", "rail:b"]})
        assert sr.detect_renames(frame, sr.empty_stop_ridership()) == []

    def test_silent_on_a_drop_with_no_addition(self):
        """Line 106 was discontinued at 2026-01. Nothing replaced its stops."""
        frame = self._months({1: ["bus:a", "bus:b"], 2: ["bus:a"]})
        assert sr.detect_renames(frame, sr.empty_stop_ridership()) == []

    def test_silent_when_a_stop_skips_a_month_and_returns(self):
        frame = self._months({1: ["bus:a", "bus:b"], 2: ["bus:a", "bus:new"],
                              3: ["bus:a", "bus:b", "bus:new"]})
        assert sr.detect_renames(frame, sr.empty_stop_ridership()) == []

    def test_the_wider_window_pairs_across_adjacent_months(self):
        """A stop reported under both names for one month puts the add in 2025-12 and
        the drop in 2026-01, where the same-month rule sees neither — ROADMAP risk 5.
        Advisory only; `update_stop_ridership` prints it and does not fail."""
        frame = self._months({1: ["bus:old-name", "bus:other"],
                              2: ["bus:old-name", "bus:new-name", "bus:other"],
                              3: ["bus:new-name", "bus:other"]})
        assert sr.detect_renames(frame, sr.empty_stop_ridership()) == []

        wider = sr.detect_renames(frame, sr.empty_stop_ridership(), window=1)
        assert [(f["added"], f["dropped"]) for f in wider] == [
            (["bus:new-name"], ["bus:old-name"])
        ]

    def test_the_wider_window_is_still_silent_without_churn(self):
        frame = self._months({1: ["bus:a"], 2: ["bus:a", "bus:b"], 3: ["bus:a", "bus:b"]})
        assert sr.detect_renames(frame, sr.empty_stop_ridership(), window=1) == []

    def test_compares_new_months_against_the_committed_ones(self):
        current = self._months({1: ["bus:old-name", "bus:other"]})
        new = self._months({2: ["bus:new-name", "bus:other"]})
        findings = sr.detect_renames(new, current)
        assert [f["month"] for f in findings] == [2]

    def test_an_alias_collapses_the_rename_and_silences_the_guard(self, monkeypatch):
        """The fix for a finding is an alias, and adding one removes the signal along
        with the split it was reporting."""
        monkeypatch.setattr(
            stop_identity, "_aliases_cache", {"bus": {"old-name": "new-name"}}
        )
        january = ce.aggregate_to_stop_ridership(
            pd.DataFrame([_bus_row("Old Name", 90)]), 2026, 1, "Bus"
        )
        february = ce.aggregate_to_stop_ridership(
            pd.DataFrame([_bus_row("New Name", 90)]), 2026, 2, "Bus"
        )
        frame = pd.concat([january, february], ignore_index=True)[sr.LONG_COLS]

        assert set(frame["stop_key"]) == {"bus:new-name"}
        assert sr.detect_renames(frame, sr.empty_stop_ridership()) == []


# ---------------------------------------------------------------------------
# update_stop_ridership — the step update_ridership.main() calls
# ---------------------------------------------------------------------------

class TestUpdateStopRidership:
    def test_splits_by_source_export_not_by_app_mode(self, tmp_path, stop_paths):
        """G Line (901) arrives in the Bus workbook, so it belongs in the bus payload
        even though the app files it under the train filter."""
        files = [
            _write_xlsx(tmp_path, 1, 2026, "Bus",
                        [_bus_row("Stop A", 90), _bus_row("Canoga", 901)]),
            _write_xlsx(tmp_path, 1, 2026, "Rail",
                        [_rail_row("1001-Union Station", 802)]),
        ]
        sr.update_stop_ridership(files)

        bus = json.loads(stop_paths["Bus"].read_text(encoding="utf-8"))
        rail = json.loads(stop_paths["Rail"].read_text(encoding="utf-8"))
        line_index = bus["cols"].index("line")
        assert 901 in {row[line_index] for row in bus["rows"]}
        assert [stop["key"] for stop in rail["stops"]] == ["rail:union-station"]

    def test_second_run_is_byte_identical(self, tmp_path, stop_paths):
        files = [_write_xlsx(tmp_path, 1, 2026, "Bus", [_bus_row("Stop A", 90)])]
        sr.update_stop_ridership(files)
        first = stop_paths["Bus"].read_bytes()
        sr.update_stop_ridership(files)
        assert stop_paths["Bus"].read_bytes() == first

    def test_loose_xlsx_and_its_zip_do_not_double_count(self, tmp_path, stop_paths):
        rows = [_bus_row("Stop A", 90, ons=100.0)]
        loose = _write_xlsx(tmp_path, 1, 2026, "Bus", rows)
        zip_path = tmp_path / "2026-01_2026-01.zip"
        zip_path.write_bytes(_make_test_zip(
            {"01-2026-Bus.xlsx": _make_xlsx_bytes(rows, ce.BUS_COLS)}
        ))

        sr.update_stop_ridership([loose, zip_path])
        payload = json.loads(stop_paths["Bus"].read_text(encoding="utf-8"))
        assert len(payload["rows"]) == 1
        assert payload["rows"][0][payload["cols"].index("wd_ons")] == 100

    def test_dry_run_writes_nothing(self, tmp_path, stop_paths):
        files = [_write_xlsx(tmp_path, 1, 2026, "Bus", [_bus_row("Stop A", 90)])]
        summary = sr.update_stop_ridership(files, dry_run=True)
        assert summary["Bus"]["added"] == 1
        assert not stop_paths["Bus"].exists()

    def test_rename_guard_fails_the_ingest(self, tmp_path, stop_paths):
        files = [
            _write_xlsx(tmp_path, 1, 2026, "Bus", [_bus_row("Old Name", 90)]),
            _write_xlsx(tmp_path, 2, 2026, "Bus", [_bus_row("New Name", 90)]),
        ]
        with pytest.raises(sr.RenameGuardError, match="rename, not a new stop"):
            sr.update_stop_ridership(files)
        assert not stop_paths["Bus"].exists()  # nothing written

    def test_allow_new_stops_overrides_the_guard(self, tmp_path, stop_paths):
        files = [
            _write_xlsx(tmp_path, 1, 2026, "Bus", [_bus_row("Old Name", 90)]),
            _write_xlsx(tmp_path, 2, 2026, "Bus", [_bus_row("New Name", 90)]),
        ]
        sr.update_stop_ridership(files, allow_new_stops=True)
        payload = json.loads(stop_paths["Bus"].read_text(encoding="utf-8"))
        assert len(payload["stops"]) == 2

    def test_append_only_by_default(self, tmp_path, stop_paths):
        first = _write_xlsx(tmp_path, 1, 2026, "Bus", [_bus_row("Stop A", 90, ons=100.0)])
        sr.update_stop_ridership([first])

        # Metro restates the same month with a different figure
        restated = _write_xlsx(tmp_path, 1, 2026, "Bus", [_bus_row("Stop A", 90, ons=555.0)])
        summary = sr.update_stop_ridership([restated])
        payload = json.loads(stop_paths["Bus"].read_text(encoding="utf-8"))
        assert payload["rows"][0][payload["cols"].index("wd_ons")] == 100
        assert summary["Bus"]["added"] == 0

        sr.update_stop_ridership([restated], prefer_new=True)
        payload = json.loads(stop_paths["Bus"].read_text(encoding="utf-8"))
        assert payload["rows"][0][payload["cols"].index("wd_ons")] == 555


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------

class TestReconcile:
    def _ridership(self, wk: float) -> pd.DataFrame:
        return pd.DataFrame([dict(
            year=2026, month=1, line_name=90,
            est_wkday_ridership=wk, est_sat_ridership=0, est_sun_ridership=0,
        )])

    def test_agreement_is_zero_deviation(self):
        stops = _frame([_long(wd_ons=60.0), _long(key="bus:b", name="B", wd_ons=40.0)])
        result = sr.reconcile(stops, self._ridership(100.0))
        weekday = result[result["measure"] == "wd_ons"].iloc[0]
        assert weekday["deviation"] == 0.0

    def test_deviation_is_relative_to_the_line_total(self):
        stops = _frame([_long(wd_ons=102.0)])
        result = sr.reconcile(stops, self._ridership(100.0))
        weekday = result[result["measure"] == "wd_ons"].iloc[0]
        assert weekday["deviation"] == pytest.approx(0.02)

    def test_zero_line_totals_are_skipped(self):
        """No denominator, and a line that reported nobody is not a discrepancy."""
        stops = _frame([_long(wd_ons=0.0, sa_ons=0.0, su_ons=0.0)])
        assert sr.reconcile(stops, self._ridership(0.0)).empty

    def test_check_reports_and_fails_above_tolerance(self, tmp_path, monkeypatch,
                                                     stop_paths, capsys):
        ridership = tmp_path / "ridership.json"
        ridership.write_text(json.dumps(self._ridership(100.0).to_dict("records")))
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", ridership)
        sr.write_stop_ridership(stop_paths["Bus"], _frame([_long(wd_ons=110.0)]))

        assert sr.check_reconciliation(tolerance=0.02) == 1
        assert "10.00%" in capsys.readouterr().out

    def test_check_passes_within_tolerance(self, tmp_path, monkeypatch, stop_paths):
        ridership = tmp_path / "ridership.json"
        ridership.write_text(json.dumps(self._ridership(100.0).to_dict("records")))
        monkeypatch.setattr(pr, "RIDERSHIP_PATH", ridership)
        sr.write_stop_ridership(stop_paths["Bus"], _frame([_long(wd_ons=101.0)]))

        assert sr.check_reconciliation(tolerance=0.02) == 0
