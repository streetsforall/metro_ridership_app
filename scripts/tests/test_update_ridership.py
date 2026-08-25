"""
Tests for update_ridership.py — the auto-scan / add-only-new-data entry point.

Synthetic xlsx/zip inputs are built in-memory (reusing helpers from
test_convert_excel_ridership); ridership.json / metadata / release-notes paths
are monkeypatched to tmp files so no real data is touched.
"""

import json
from pathlib import Path

import pandas as pd
import pytest

import convert_excel_ridership as ce
import process_ridership as pr
import stop_ridership as sr
import update_ridership as ur
from test_convert_excel_ridership import _make_test_zip, _make_xlsx_bytes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def stop_paths(tmp_path, monkeypatch):
    """Redirect the stop payloads at tmp files for **every** test in this module.

    `main()` now writes the stop grain too, so without this a test run would
    overwrite the two committed multi-megabyte data files.
    """
    paths = {
        "Bus": tmp_path / "stop_ridership.bus.json",
        "Rail": tmp_path / "stop_ridership.rail.json",
    }
    monkeypatch.setattr(sr, "STOP_PATHS", paths)
    return paths

def _bus_row(line: int, direction: str, val: float) -> dict:
    return {
        "STOP_NAME": f"Stop {line}", "LINE": line, "DIRECTION": direction,
        "WD_ONS": val, "WD_OFFS": 0, "WD_ACT": val,
        "SA_ONS": val, "SA_OFFS": 0, "SA_ACT": val,
        "SU_ONS": val, "SU_OFFS": 0, "SU_ACT": val,
    }


def _write_bus_xlsx(dir_: Path, month: int, year: int, rows: list[dict]) -> Path:
    path = dir_ / f"{month:02d}-{year}-Bus.xlsx"
    path.write_bytes(_make_xlsx_bytes(rows, ce.BUS_COLS))
    return path


def _setup_data(tmp_path, monkeypatch, ridership_rows, meta_rows=None):
    """Point pr's ridership/metadata paths at tmp json files."""
    rpath = tmp_path / "ridership.json"
    mpath = tmp_path / "metadata.json"
    rpath.write_text(json.dumps(ridership_rows, indent=2), encoding="utf-8")
    mpath.write_text(json.dumps(meta_rows or [], indent=2), encoding="utf-8")
    monkeypatch.setattr(pr, "RIDERSHIP_PATH", rpath)
    monkeypatch.setattr(pr, "METADATA_PATH", mpath)
    return rpath, mpath


def _rec(year=2026, month=1, line=90, wk=100.0, sa=60.0, su=40.0):
    return dict(year=year, month=month, line_name=line,
                est_wkday_ridership=wk, est_sat_ridership=sa, est_sun_ridership=su)


# ---------------------------------------------------------------------------
# discover_inputs
# ---------------------------------------------------------------------------

class TestDiscoverInputs:
    def test_globs_supported_extensions_in_dir(self, tmp_path):
        (tmp_path / "a.zip").write_bytes(b"")
        (tmp_path / "b.xlsx").write_bytes(b"")
        (tmp_path / "c.csv").write_text("x")
        (tmp_path / "notes.txt").write_text("ignore")
        (tmp_path / ".gitkeep").write_text("")
        found = {p.name for p in ur.discover_inputs([str(tmp_path)])}
        assert found == {"a.zip", "b.xlsx", "c.csv"}

    def test_explicit_file_kept(self, tmp_path):
        f = tmp_path / "one.zip"
        f.write_bytes(b"")
        assert ur.discover_inputs([str(f)]) == [f]

    def test_missing_path_skipped(self, tmp_path):
        assert ur.discover_inputs([str(tmp_path / "nope")]) == []


# ---------------------------------------------------------------------------
# load_and_compute — per-file fill scoping
# ---------------------------------------------------------------------------

class TestLoadAndComputeFillScoping:
    def test_fill_is_scoped_per_file(self, tmp_path):
        """A line present only in one single-month file must NOT be zero-filled
        into another file's month (the line-106 regression)."""
        a = _write_bus_xlsx(tmp_path, 1, 2026, [_bus_row(90, "IB", 100), _bus_row(106, "IB", 50)])
        b = _write_bus_xlsx(tmp_path, 2, 2026, [_bus_row(90, "IB", 110)])

        new_df, raw_df, coverage = ur.load_and_compute([a, b])
        keys = set(map(tuple, new_df[["year", "month", "line_name"]].to_numpy()))

        assert (2026, 1, 106) in keys      # line 106 in its own month
        assert (2026, 2, 106) not in keys  # but NOT cross-filled into Feb
        assert (2026, 1, 90) in keys and (2026, 2, 90) in keys
        assert coverage[a] == {(2026, 1)} and coverage[b] == {(2026, 2)}

    def test_overlapping_sources_deduped(self, tmp_path):
        """The same month delivered as both a loose xlsx and inside a zip
        collapses to one set of records."""
        rows = [_bus_row(90, "IB", 100)]
        loose = _write_bus_xlsx(tmp_path, 1, 2026, rows)
        zip_path = tmp_path / "2026-01_2026-01.zip"
        zip_path.write_bytes(_make_test_zip({"01-2026-Bus.xlsx": _make_xlsx_bytes(rows, ce.BUS_COLS)}))

        new_df, _, _ = ur.load_and_compute([loose, zip_path])
        assert len(new_df[(new_df["line_name"] == 90) & (new_df["month"] == 1)]) == 1


class TestDiffAgainstCurrent:
    def test_pads_are_not_counted_as_corrections(self, tmp_path, monkeypatch):
        """fill_missing_months leaves pads as NaN and merge_ridership backfills
        them, so a pad over an existing record is not a pending correction."""
        _setup_data(tmp_path, monkeypatch, [_rec(month=1, wk=100.0)])

        new_df = pd.DataFrame([_rec(
            month=1, wk=float("nan"), sa=float("nan"), su=float("nan"),
        )])
        assert ur.diff_against_current(new_df, overwrite=True)["updated_records"] == 0

    def test_real_change_still_counted(self, tmp_path, monkeypatch):
        _setup_data(tmp_path, monkeypatch, [_rec(month=1, wk=100.0)])

        new_df = pd.DataFrame([_rec(month=1, wk=123.0)])
        assert ur.diff_against_current(new_df, overwrite=True)["updated_records"] == 1


# ---------------------------------------------------------------------------
# main — append-only / overwrite / no-op
# ---------------------------------------------------------------------------

class TestMainAppendOnly:
    def test_new_month_appended_existing_untouched(self, tmp_path, monkeypatch):
        rpath, _ = _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        f = _write_bus_xlsx(tmp_path, 2, 2026, [_bus_row(90, "IB", 222)])

        rc = ur.main([str(f), "--no-release-notes"])
        assert rc == 0

        out = pd.read_json(rpath)
        jan = out[out["month"] == 1].iloc[0]
        feb = out[out["month"] == 2].iloc[0]
        assert jan["est_wkday_ridership"] == 100.0   # untouched
        assert feb["est_wkday_ridership"] == 222.0   # appended

    def test_conflict_ignored_without_overwrite(self, tmp_path, monkeypatch):
        rpath, _ = _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        f = _write_bus_xlsx(tmp_path, 1, 2026, [_bus_row(90, "IB", 999)])

        before = rpath.read_text(encoding="utf-8")
        ur.main([str(f), "--no-release-notes"])
        assert rpath.read_text(encoding="utf-8") == before  # nothing written

    def test_overwrite_updates_existing(self, tmp_path, monkeypatch):
        rpath, _ = _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        f = _write_bus_xlsx(tmp_path, 1, 2026, [_bus_row(90, "IB", 999)])

        ur.main([str(f), "--overwrite", "--no-release-notes"])
        out = pd.read_json(rpath)
        assert out[out["month"] == 1].iloc[0]["est_wkday_ridership"] == 999.0

    def test_no_op_when_up_to_date(self, tmp_path, monkeypatch, capsys):
        rpath, _ = _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0, sa=100.0, su=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        f = _write_bus_xlsx(tmp_path, 1, 2026, [_bus_row(90, "IB", 100)])

        before = rpath.read_text(encoding="utf-8")
        rc = ur.main([str(f), "--no-release-notes"])
        assert rc == 0
        assert "no new data" in capsys.readouterr().out
        assert rpath.read_text(encoding="utf-8") == before


# ---------------------------------------------------------------------------
# main — release notes + dry run
# ---------------------------------------------------------------------------

_SAMPLE_NOTES = (
    "# Data Release Notes\n\n"
    "Intro paragraph.\n\n"
    "Entries are newest first.\n\n"
    "---\n\n"
    "## Jan 2026\n\n"
    "- **Added:** 1 records across 1 lines\n\n"
)


class TestReleaseNotesAndDryRun:
    def _setup_with_notes(self, tmp_path, monkeypatch):
        _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        notes = tmp_path / "DATA_RELEASE_NOTES.md"
        notes.write_text(_SAMPLE_NOTES, encoding="utf-8")
        monkeypatch.setattr(ur, "RELEASE_NOTES_PATH", notes)
        f = _write_bus_xlsx(tmp_path, 2, 2026, [_bus_row(90, "IB", 222)])
        return notes, f

    def test_entry_prepended_before_first_heading(self, tmp_path, monkeypatch):
        notes, f = self._setup_with_notes(tmp_path, monkeypatch)
        ur.main([str(f)])

        text = notes.read_text(encoding="utf-8")
        assert "Intro paragraph." in text          # intro preserved
        assert "## Feb 2026" in text                # new entry added
        assert text.index("## Feb 2026") < text.index("## Jan 2026")  # newest first
        assert "`02-2026-Bus.xlsx`" in text         # source attributed

    def test_no_release_notes_flag_leaves_file(self, tmp_path, monkeypatch):
        notes, f = self._setup_with_notes(tmp_path, monkeypatch)
        ur.main([str(f), "--no-release-notes"])
        assert notes.read_text(encoding="utf-8") == _SAMPLE_NOTES

    def test_dry_run_writes_nothing(self, tmp_path, monkeypatch):
        notes, f = self._setup_with_notes(tmp_path, monkeypatch)
        before_r = pr.RIDERSHIP_PATH.read_text(encoding="utf-8")
        ur.main([str(f), "--dry-run"])
        assert pr.RIDERSHIP_PATH.read_text(encoding="utf-8") == before_r
        assert notes.read_text(encoding="utf-8") == _SAMPLE_NOTES


# ---------------------------------------------------------------------------
# main — the stop grain
# ---------------------------------------------------------------------------

class TestStopGrain:
    def _setup(self, tmp_path, monkeypatch):
        _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        return _write_bus_xlsx(tmp_path, 2, 2026, [_bus_row(90, "IB", 222)])

    def test_payloads_written_alongside_ridership(self, tmp_path, monkeypatch, stop_paths):
        f = self._setup(tmp_path, monkeypatch)
        assert ur.main([str(f), "--no-release-notes"]) == 0

        payload = json.loads(stop_paths["Bus"].read_text(encoding="utf-8"))
        assert payload["schema"] == sr.WIRE_SCHEMA
        assert [stop["key"] for stop in payload["stops"]] == ["bus:stop-90"]

    def test_no_stops_skips_them(self, tmp_path, monkeypatch, stop_paths):
        f = self._setup(tmp_path, monkeypatch)
        ur.main([str(f), "--no-release-notes", "--no-stops"])
        assert not stop_paths["Bus"].exists()

    def test_written_even_when_ridership_is_already_current(self, tmp_path, monkeypatch,
                                                            stop_paths):
        """The payloads can be behind — or absent, as on a fresh clone — while
        ridership.json is up to date. The no-new-data return must not skip them."""
        _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0, sa=100.0, su=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        f = _write_bus_xlsx(tmp_path, 1, 2026, [_bus_row(90, "IB", 100)])

        assert ur.main([str(f), "--no-release-notes"]) == 0
        assert stop_paths["Bus"].exists()

    def test_dry_run_writes_no_payload(self, tmp_path, monkeypatch, stop_paths):
        f = self._setup(tmp_path, monkeypatch)
        ur.main([str(f), "--dry-run", "--no-release-notes"])
        assert not stop_paths["Bus"].exists()

    def test_rename_guard_fails_the_run(self, tmp_path, monkeypatch, stop_paths, capsys):
        _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        january = _write_bus_xlsx(tmp_path, 1, 2026, [dict(_bus_row(90, "IB", 100),
                                                           STOP_NAME="Old Name")])
        february = _write_bus_xlsx(tmp_path, 2, 2026, [dict(_bus_row(90, "IB", 100),
                                                            STOP_NAME="New Name")])

        assert ur.main([str(january), str(february), "--no-release-notes"]) == 1
        assert "rename, not a new stop" in capsys.readouterr().out
        assert not stop_paths["Bus"].exists()

    def test_release_entry_gains_a_stop_bullet(self, tmp_path, monkeypatch, stop_paths):
        _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=[_rec(month=1, line=90, wk=100.0)],
            meta_rows=[dict(line=90, mode="Bus", provider="DO")],
        )
        notes = tmp_path / "DATA_RELEASE_NOTES.md"
        notes.write_text(_SAMPLE_NOTES, encoding="utf-8")
        monkeypatch.setattr(ur, "RELEASE_NOTES_PATH", notes)
        f = _write_bus_xlsx(tmp_path, 2, 2026, [_bus_row(90, "IB", 222)])

        ur.main([str(f)])
        assert "- **Stop-level:** Bus +1 stop-months" in notes.read_text(encoding="utf-8")

    def test_stop_bullet_omitted_with_no_stops(self):
        assert ur.stop_bullet(None) == ""
        assert ur.stop_bullet({"Bus": {"added": 0}, "Rail": {"added": 0}}) == ""


# ---------------------------------------------------------------------------
# main — the anomaly guard
# ---------------------------------------------------------------------------

_GUARD_LINES = 30  # clears min_lines_uniform so both failing tests are reachable


def _many_bus_rows(factor: float = 1.0, base: float = 1000.0) -> list[dict]:
    return [_bus_row(100 + i, "IB", base * factor) for i in range(_GUARD_LINES)]


def _many_recs(month: int = 1, base: float = 1000.0) -> list[dict]:
    return [
        _rec(month=month, line=100 + i, wk=base, sa=base, su=base)
        for i in range(_GUARD_LINES)
    ]


def _guard_meta() -> list[dict]:
    return [dict(line=100 + i, mode="Bus", provider="DO") for i in range(_GUARD_LINES)]


class TestAnomalyGuard:
    def _setup(self, tmp_path, monkeypatch, factor):
        rpath, _ = _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=_many_recs(), meta_rows=_guard_meta(),
        )
        f = _write_bus_xlsx(tmp_path, 2, 2026, _many_bus_rows(factor))
        return rpath, f

    def test_anomalous_month_refuses_to_write(self, tmp_path, monkeypatch, capsys):
        """Every line up 2.4x — the June 2026 bus defect."""
        rpath, f = self._setup(tmp_path, monkeypatch, factor=2.4)

        before = rpath.read_text(encoding="utf-8")
        rc = ur.main([str(f), "--no-release-notes", "--no-stops"])

        assert rc == 2
        assert rpath.read_text(encoding="utf-8") == before  # nothing written
        out = capsys.readouterr().out
        assert "FAIL" in out and "2.400" in out
        assert "--allow-anomalies" in out

    def test_normal_month_passes(self, tmp_path, monkeypatch):
        rpath, f = self._setup(tmp_path, monkeypatch, factor=1.03)

        assert ur.main([str(f), "--no-release-notes", "--no-stops"]) == 0
        out = pd.read_json(rpath)
        assert len(out[out["month"] == 2]) == _GUARD_LINES

    def test_allow_anomalies_writes_and_records_override(self, tmp_path, monkeypatch):
        rpath, _ = _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=_many_recs(), meta_rows=_guard_meta(),
        )
        notes = tmp_path / "DATA_RELEASE_NOTES.md"
        notes.write_text(_SAMPLE_NOTES, encoding="utf-8")
        monkeypatch.setattr(ur, "RELEASE_NOTES_PATH", notes)
        f = _write_bus_xlsx(tmp_path, 2, 2026, _many_bus_rows(2.4))

        assert ur.main([str(f), "--allow-anomalies", "--no-stops"]) == 0
        assert len(pd.read_json(rpath).query("month == 2")) == _GUARD_LINES
        assert "OVERRIDDEN" in notes.read_text(encoding="utf-8")

    def test_single_line_drop_reported_not_blocking(self, tmp_path, monkeypatch, capsys):
        """The D Line case end to end: one line collapses, the month still merges."""
        rpath, _ = _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=_many_recs(base=2000.0), meta_rows=_guard_meta(),
        )
        rows = _many_bus_rows(1.0, base=2000.0)
        rows[0] = _bus_row(100, "IB", 800)
        f = _write_bus_xlsx(tmp_path, 2, 2026, rows)

        assert ur.main([str(f), "--no-release-notes", "--no-stops"]) == 0
        out = capsys.readouterr().out
        assert "outliers" in out and "100" in out
        assert pd.read_json(rpath).query("month == 2 and line_name == 100").iloc[0][
            "est_wkday_ridership"
        ] == 800.0

    def test_dry_run_still_refuses_and_writes_nothing(self, tmp_path, monkeypatch):
        rpath, f = self._setup(tmp_path, monkeypatch, factor=2.4)
        notes = tmp_path / "DATA_RELEASE_NOTES.md"
        notes.write_text(_SAMPLE_NOTES, encoding="utf-8")
        monkeypatch.setattr(ur, "RELEASE_NOTES_PATH", notes)

        before = rpath.read_text(encoding="utf-8")
        assert ur.main([str(f), "--dry-run", "--no-stops"]) == 2
        assert rpath.read_text(encoding="utf-8") == before
        assert notes.read_text(encoding="utf-8") == _SAMPLE_NOTES

    def test_no_baseline_month_skips_guard(self, tmp_path, monkeypatch):
        """Nothing to compare against is not an anomaly."""
        rpath, _ = _setup_data(
            tmp_path, monkeypatch, ridership_rows=[], meta_rows=_guard_meta(),
        )
        f = _write_bus_xlsx(tmp_path, 2, 2026, _many_bus_rows(1.0))

        assert ur.main([str(f), "--no-release-notes", "--no-stops"]) == 0
        assert len(pd.read_json(rpath)) == _GUARD_LINES

    def test_non_adjacent_month_skips_guard(self, tmp_path, monkeypatch, capsys):
        """Jan committed, March delivered: February is missing, so there is no
        baseline and the month merges rather than failing."""
        _setup_data(
            tmp_path, monkeypatch,
            ridership_rows=_many_recs(month=1), meta_rows=_guard_meta(),
        )
        f = _write_bus_xlsx(tmp_path, 3, 2026, _many_bus_rows(2.4))

        assert ur.main([str(f), "--no-release-notes", "--no-stops"]) == 0
        assert "skipped" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# month label formatting
# ---------------------------------------------------------------------------

class TestMonthLabels:
    def test_single_month(self):
        assert ur.month_label([(2026, 4)]) == "Apr 2026"

    def test_same_year_range(self):
        assert ur.month_label([(2026, 4), (2026, 5)]) == "Apr–May 2026"

    def test_cross_year_range(self):
        assert ur.month_label([(2025, 7), (2026, 3)]) == "Jul 2025 – Mar 2026"
