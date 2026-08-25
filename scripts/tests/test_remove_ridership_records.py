"""
Tests for remove_ridership_records.py — the withdrawal path.

The behaviour worth pinning is that removal *deletes*.  A zeroed row would keep
the key alive, and both the chart and averageRidership treat a present zero very
differently from an absent month.
"""

import pandas as pd

import process_ridership as pr
import remove_ridership_records as rm
import stop_ridership as sr
import update_ridership as ur
from test_update_ridership import _rec, _setup_data, _SAMPLE_NOTES


def _seed(tmp_path, monkeypatch):
    rows = (
        [_rec(year=2026, month=6, line=line, wk=100.0) for line in (2, 4, 720)]
        + [_rec(year=2026, month=6, line=line, wk=50000.0) for line in (801, 805)]
        + [_rec(year=2026, month=5, line=4, wk=90.0)]
    )
    meta = [dict(line=line, mode="Bus", provider="DO") for line in (2, 4, 720)] + [
        dict(line=line, mode="Rail", provider="DO") for line in (801, 805)
    ]
    return _setup_data(tmp_path, monkeypatch, ridership_rows=rows, meta_rows=meta)


def _seed_stops(tmp_path, monkeypatch):
    """Point STOP_PATHS at tmp payloads holding June and May rows for both modes."""
    paths = {
        "Bus": tmp_path / "stop_ridership.bus.json",
        "Rail": tmp_path / "stop_ridership.rail.json",
    }
    monkeypatch.setattr(sr, "STOP_PATHS", paths)
    rows = {
        "Bus": [_stop_row(2026, 6, 4), _stop_row(2026, 6, 720), _stop_row(2026, 5, 4)],
        "Rail": [_stop_row(2026, 6, 801, "rail:union-station")],
    }
    for mode, path in paths.items():
        sr.write_stop_ridership(path, _stop_frame(rows[mode]))
    return paths


def _stop_row(year, month, line, key="bus:stop-a"):
    return dict(
        year=year, month=month, line=line, stop_key=key, stop_name="Stop A",
        station_order=None, wd_ons=100.0, wd_offs=90.0,
        sa_ons=60.0, sa_offs=55.0, su_ons=40.0, su_offs=35.0,
    )


def _stop_frame(rows):
    return pd.DataFrame(rows, columns=sr.LONG_COLS).astype({"station_order": "Int64"})


class TestStopGrainRemoval:
    def test_stop_rows_go_with_the_line_records(self, tmp_path, monkeypatch):
        """Withdrawing one grain and leaving the other publishes two different
        answers for the same month — the June 2026 bus bug exactly."""
        _seed(tmp_path, monkeypatch)
        paths = _seed_stops(tmp_path, monkeypatch)

        rm.main(["--year", "2026", "--month", "6", "--mode", "Bus",
                 "--no-release-notes"])

        bus = sr.load_stop_ridership(paths["Bus"])
        assert bus[(bus["year"] == 2026) & (bus["month"] == 6)].empty
        assert len(bus[(bus["year"] == 2026) & (bus["month"] == 5)]) == 1

    def test_other_mode_payload_untouched(self, tmp_path, monkeypatch):
        _seed(tmp_path, monkeypatch)
        paths = _seed_stops(tmp_path, monkeypatch)

        rm.main(["--year", "2026", "--month", "6", "--mode", "Bus",
                 "--no-release-notes"])

        rail = sr.load_stop_ridership(paths["Rail"])
        assert len(rail[(rail["year"] == 2026) & (rail["month"] == 6)]) == 1

    def test_no_stops_flag_leaves_payloads(self, tmp_path, monkeypatch):
        _seed(tmp_path, monkeypatch)
        paths = _seed_stops(tmp_path, monkeypatch)
        before = paths["Bus"].read_text(encoding="utf-8")

        rm.main(["--year", "2026", "--month", "6", "--mode", "Bus",
                 "--no-release-notes", "--no-stops"])

        assert paths["Bus"].read_text(encoding="utf-8") == before

    def test_dry_run_leaves_payloads(self, tmp_path, monkeypatch):
        _seed(tmp_path, monkeypatch)
        paths = _seed_stops(tmp_path, monkeypatch)
        before = paths["Bus"].read_text(encoding="utf-8")

        rm.main(["--year", "2026", "--month", "6", "--mode", "Bus", "--dry-run"])

        assert paths["Bus"].read_text(encoding="utf-8") == before

    def test_stop_only_month_still_removable(self, tmp_path, monkeypatch):
        """The real June 2026 case: the line records were already gone via a
        revert, leaving only stop rows to withdraw."""
        _setup_data(tmp_path, monkeypatch, ridership_rows=[_rec(year=2026, month=5, line=4)],
                    meta_rows=[dict(line=4, mode="Bus", provider="DO")])
        paths = _seed_stops(tmp_path, monkeypatch)

        rc = rm.main(["--year", "2026", "--month", "6", "--mode", "Bus",
                      "--no-release-notes"])

        assert rc == 0
        bus = sr.load_stop_ridership(paths["Bus"])
        assert bus[(bus["year"] == 2026) & (bus["month"] == 6)].empty


class TestSelectRecords:
    def test_mode_filter_uses_metadata(self, tmp_path, monkeypatch):
        _seed(tmp_path, monkeypatch)
        current = pr.load_current_ridership()
        mask = rm.select_records(current, 2026, 6, mode="Bus")
        assert sorted(current[mask]["line_name"]) == [2, 4, 720]

    def test_explicit_lines_filter(self, tmp_path, monkeypatch):
        _seed(tmp_path, monkeypatch)
        current = pr.load_current_ridership()
        mask = rm.select_records(current, 2026, 6, lines=[4, 805])
        assert sorted(current[mask]["line_name"]) == [4, 805]

    def test_other_months_untouched(self, tmp_path, monkeypatch):
        _seed(tmp_path, monkeypatch)
        current = pr.load_current_ridership()
        mask = rm.select_records(current, 2026, 6, mode="Bus")
        assert not mask[current["month"] == 5].any()


class TestMain:
    def test_removes_bus_keeps_rail(self, tmp_path, monkeypatch):
        rpath, _ = _seed(tmp_path, monkeypatch)

        rc = rm.main(["--year", "2026", "--month", "6", "--mode", "Bus",
                      "--no-release-notes"])
        assert rc == 0

        out = pd.read_json(rpath)
        june = out[(out["year"] == 2026) & (out["month"] == 6)]
        assert sorted(june["line_name"]) == [801, 805]
        assert len(out[(out["year"] == 2026) & (out["month"] == 5)]) == 1

    def test_records_are_deleted_not_zeroed(self, tmp_path, monkeypatch):
        rpath, _ = _seed(tmp_path, monkeypatch)
        rm.main(["--year", "2026", "--month", "6", "--mode", "Bus",
                 "--no-release-notes"])

        out = pd.read_json(rpath)
        assert out[(out["month"] == 6) & (out["line_name"] == 4)].empty

    def test_dry_run_writes_nothing(self, tmp_path, monkeypatch):
        rpath, _ = _seed(tmp_path, monkeypatch)
        before = rpath.read_text(encoding="utf-8")

        assert rm.main(["--year", "2026", "--month", "6", "--mode", "Bus",
                        "--dry-run"]) == 0
        assert rpath.read_text(encoding="utf-8") == before

    def test_refuses_to_remove_a_whole_month(self, tmp_path, monkeypatch, capsys):
        rpath, _ = _seed(tmp_path, monkeypatch)
        before = rpath.read_text(encoding="utf-8")

        assert rm.main(["--year", "2026", "--month", "6"]) == 1
        assert "refusing" in capsys.readouterr().out
        assert rpath.read_text(encoding="utf-8") == before

    def test_no_match_reports_and_exits_nonzero(self, tmp_path, monkeypatch):
        _seed(tmp_path, monkeypatch)
        assert rm.main(["--year", "2099", "--month", "1", "--mode", "Bus"]) == 1

    def test_release_note_records_the_reason(self, tmp_path, monkeypatch):
        _seed(tmp_path, monkeypatch)
        notes = tmp_path / "DATA_RELEASE_NOTES.md"
        notes.write_text(_SAMPLE_NOTES, encoding="utf-8")
        monkeypatch.setattr(ur, "RELEASE_NOTES_PATH", notes)

        rm.main(["--year", "2026", "--month", "6", "--mode", "Bus",
                 "--reason", "inflated source export"])

        text = notes.read_text(encoding="utf-8")
        assert "## Jun 2026 — bus records withdrawn" in text
        assert "inflated source export" in text
        assert "3 bus records across 3 lines" in text
        assert text.index("Jun 2026") < text.index("## Jan 2026")  # newest first
