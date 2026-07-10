"""
Tests for update_ridership.py — the auto-scan / add-only-new-data entry point.

Synthetic xlsx/zip inputs are built in-memory (reusing helpers from
test_convert_excel_ridership); ridership.json / metadata / release-notes paths
are monkeypatched to tmp files so no real data is touched.
"""

import json
from pathlib import Path

import pandas as pd

import convert_excel_ridership as ce
import process_ridership as pr
import update_ridership as ur
from test_convert_excel_ridership import _make_test_zip, _make_xlsx_bytes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
# month label formatting
# ---------------------------------------------------------------------------

class TestMonthLabels:
    def test_single_month(self):
        assert ur.month_label([(2026, 4)]) == "Apr 2026"

    def test_same_year_range(self):
        assert ur.month_label([(2026, 4), (2026, 5)]) == "Apr–May 2026"

    def test_cross_year_range(self):
        assert ur.month_label([(2025, 7), (2026, 3)]) == "Jul 2025 – Mar 2026"
