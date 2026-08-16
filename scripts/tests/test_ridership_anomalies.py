"""
Tests for ridership_anomalies.py — the ingest plausibility guard.

The two cases that matter most are negative ones: a single line moving a long
way (the D Line's June 2026 surge fading) and a handful of lines being
restructured at once (the Regional Connector opening in July 2023) must both
pass, because both were real.  They are modelled here as
test_single_line_collapse_passes and test_extension_month_passes.
"""

import json

import pandas as pd
import pytest

import ridership_anomalies as ra

VALUE_COLS = list(ra.DAY_TYPES)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rows(month: int, values: dict[int, float]) -> list[dict]:
    return [
        dict(year=2026, month=month, line_name=line,
             **{col: val for col in VALUE_COLS})
        for line, val in values.items()
    ]


def _timeline(month1: dict[int, float], month2: dict[int, float]) -> pd.DataFrame:
    """Two consecutive months (2026-01, 2026-02) as a guard-ready timeline."""
    df = pd.DataFrame(_rows(1, month1) + _rows(2, month2))
    df["period"] = df["year"] * 12 + df["month"]
    return df


def _flat(n: int, value: float = 1000.0, first: int = 100) -> dict[int, float]:
    return {first + i: value for i in range(n)}


def _scaled(base: dict[int, float], factor: float, spread: float = 0.0) -> dict[int, float]:
    """Scale every line by `factor`, fanned out deterministically by `spread`."""
    return {
        line: val * (factor + spread * ((i % 5) - 2) / 2)
        for i, (line, val) in enumerate(base.items())
    }


def _modes(lines, mode="Bus") -> dict[int, str]:
    return {line: mode for line in lines}


def _group(groups, mode="Bus", day_type="wkday"):
    return next(g for g in groups if g.mode == mode and g.day_type == day_type)


# ---------------------------------------------------------------------------
# build_mode_map
# ---------------------------------------------------------------------------

class TestBuildModeMap:
    def _meta(self, tmp_path, rows):
        p = tmp_path / "metadata.json"
        p.write_text(json.dumps(rows), encoding="utf-8")
        return p

    def test_metadata_used_when_no_raw_frame(self, tmp_path):
        p = self._meta(tmp_path, [dict(line=2, mode="Bus"), dict(line=801, mode="Rail")])
        assert ra.build_mode_map(None, p) == {2: "Bus", 801: "Rail"}

    def test_raw_frame_wins_over_metadata(self, tmp_path):
        p = self._meta(tmp_path, [dict(line=90, mode="Bus")])
        raw = pd.DataFrame([dict(line=90, mode="Rail")])
        assert ra.build_mode_map(raw, p)[90] == "Rail"

    def test_dual_mode_line_resolved_by_row_count(self, tmp_path):
        """801 is a rail route that also carries bus-bridge rows; the majority
        of its rows decide, so the tie-break is deterministic."""
        p = self._meta(tmp_path, [])
        raw = pd.DataFrame(
            [dict(line=801, mode="Rail")] * 5 + [dict(line=801, mode="Bus")]
        )
        assert ra.build_mode_map(raw, p)[801] == "Rail"

    def test_unmapped_line_is_unknown(self, tmp_path):
        p = self._meta(tmp_path, [dict(line=2, mode="Bus")])
        assert ra.build_mode_map(None, p).get(999, ra.UNKNOWN_MODE) == ra.UNKNOWN_MODE


# ---------------------------------------------------------------------------
# build_timeline
# ---------------------------------------------------------------------------

class TestBuildTimeline:
    def test_new_records_win_over_current(self):
        current = pd.DataFrame(_rows(1, {90: 100.0}))
        new = pd.DataFrame(_rows(1, {90: 999.0}))
        out = ra.build_timeline(current, new)
        assert len(out) == 1
        assert out.iloc[0]["est_wkday_ridership"] == 999.0

    def test_multi_month_batch_baselines_against_its_own_earlier_month(self):
        """May must compare against the April in the same delivery, not the
        April already committed."""
        current = pd.DataFrame(_rows(1, {90: 100.0}))
        new = pd.DataFrame(_rows(1, {90: 500.0}) + _rows(2, {90: 550.0}))
        out = ra.build_timeline(current, new)
        jan = out[out["month"] == 1].iloc[0]
        assert jan["est_wkday_ridership"] == 500.0

    def test_empty_inputs_yield_empty_frame(self):
        empty = pd.DataFrame(columns=[*ra.KEYS, *VALUE_COLS])
        assert ra.build_timeline(empty, empty).empty


# ---------------------------------------------------------------------------
# month_ratios — eligibility accounting
# ---------------------------------------------------------------------------

class TestMonthRatios:
    def test_lines_below_floor_excluded_and_counted(self):
        tl = _timeline({90: 1000.0, 91: 10.0}, {90: 1050.0, 91: 12.0})
        g = _group(ra.month_ratios(tl, 2026, 2, _modes([90, 91])))
        assert g.n_lines == 1 and g.n_below_floor == 1

    def test_appeared_and_vanished_counted_not_ratioed(self):
        tl = _timeline({90: 1000.0, 91: 800.0}, {90: 1050.0, 92: 900.0})
        g = _group(ra.month_ratios(tl, 2026, 2, _modes([90, 91, 92])))
        assert g.n_lines == 1
        assert g.n_appeared == 1 and g.n_vanished == 1

    def test_missing_baseline_month_is_skipped(self):
        df = pd.DataFrame(_rows(6, _flat(30)))
        df["period"] = df["year"] * 12 + df["month"]
        g = _group(ra.month_ratios(df, 2026, 6, _modes(range(100, 130))))
        assert g.verdict == "skipped" and not g.failed

    def test_too_few_comparable_lines_is_skipped(self):
        tl = _timeline({90: 1000.0}, {90: 5000.0})
        g = _group(ra.month_ratios(tl, 2026, 2, _modes([90])))
        assert g.verdict == "skipped" and not g.failed


# ---------------------------------------------------------------------------
# Test A — median band
# ---------------------------------------------------------------------------

class TestMedianBand:
    def test_uniform_inflation_fails(self):
        """The June 2026 bus defect: every line up ~2.41x."""
        base = _flat(100)
        tl = _timeline(base, _scaled(base, 2.41, spread=0.2))
        g = _group(ra.month_ratios(tl, 2026, 2, _modes(base)))
        assert g.verdict == "median-out-of-band"
        assert g.median_ratio == pytest.approx(2.41, abs=0.01)

    def test_normal_month_passes(self):
        base = _flat(100)
        tl = _timeline(base, _scaled(base, 1.03, spread=0.06))
        g = _group(ra.month_ratios(tl, 2026, 2, _modes(base)))
        assert g.verdict == "ok"

    def test_single_line_collapse_passes(self):
        """The D Line case: one line down 40%, the rest flat.  One line cannot
        move the median, so the month merges and the drop is reported instead."""
        base = _flat(30, 2000.0)
        after = dict(base)
        after[100] = 800.0
        tl = _timeline(base, after)
        groups = ra.month_ratios(tl, 2026, 2, _modes(base))
        assert _group(groups).verdict == "ok"

    def test_extension_month_passes(self):
        """The Regional Connector case: of six rail lines one doubles, one is up
        55%, one stops reporting.  The mode total jumps but the median does not."""
        base = {801: 35000.0, 802: 47000.0, 803: 19000.0,
                804: 20000.0, 806: 9000.0, 807: 8000.0}
        after = {801: 54500.0, 802: 47500.0, 803: 19200.0,
                 804: 41000.0, 806: 0.0, 807: 8100.0}
        tl = _timeline(base, after)
        g = _group(ra.month_ratios(tl, 2026, 2, _modes(base, "Rail")), "Rail")
        assert g.verdict == "ok"
        assert g.total_ratio > 1.2       # the sum really does jump...
        assert abs(g.median_ratio - 1) < 0.05   # ...while the median does not

    def test_rail_band_is_wider_than_bus(self):
        base = _flat(6, 20000.0)
        tl = _timeline(base, _scaled(base, 1.27))
        assert _group(ra.month_ratios(tl, 2026, 2, _modes(base, "Rail")), "Rail").verdict == "ok"
        assert _group(ra.month_ratios(tl, 2026, 2, _modes(base, "Bus"))).failed

    def test_unknown_mode_never_fails(self):
        base = _flat(100)
        tl = _timeline(base, _scaled(base, 2.41))
        g = _group(ra.month_ratios(tl, 2026, 2, _modes(base, ra.UNKNOWN_MODE)), ra.UNKNOWN_MODE)
        assert g.verdict == "ok"


# ---------------------------------------------------------------------------
# Test B — uniform shift
# ---------------------------------------------------------------------------

class TestUniformShift:
    def test_uniform_18_percent_fails(self):
        """Inside the median band, but every line moving together is not how
        real ridership behaves."""
        base = _flat(100)
        tl = _timeline(base, _scaled(base, 1.18, spread=0.02))
        g = _group(ra.month_ratios(tl, 2026, 2, _modes(base)))
        assert g.verdict == "uniform-shift"

    def test_narrow_mode_is_exempt(self):
        """Rail reaches 100% unanimity in 31 clean historical observations
        purely because it has 4-6 lines; the width gate is what keeps those from
        becoming false positives."""
        base = _flat(5, 20000.0)
        tl = _timeline(base, _scaled(base, 1.18))
        g = _group(ra.month_ratios(tl, 2026, 2, _modes(base, "Rail")), "Rail")
        assert g.verdict == "ok"
        assert g.unanimity == 1.0

    def test_unanimous_but_small_median_passes(self):
        base = _flat(100)
        tl = _timeline(base, _scaled(base, 1.06))
        g = _group(ra.month_ratios(tl, 2026, 2, _modes(base)))
        assert g.unanimity == 1.0 and g.verdict == "ok"


# ---------------------------------------------------------------------------
# Test C — informational outliers
# ---------------------------------------------------------------------------

class TestOutliers:
    def _ratio(self, line, ratio, baseline=1000.0):
        return ra.LineRatio(line, "Bus", "wkday", baseline, baseline * ratio, ratio)

    def test_sorted_by_log_magnitude(self):
        picked = ra.find_outliers([
            self._ratio(1, 1.6), self._ratio(2, 0.3), self._ratio(3, 2.0),
        ])
        assert [r.line_name for r in picked] == [2, 3, 1]

    def test_small_lines_ignored(self):
        assert ra.find_outliers([self._ratio(1, 3.0, baseline=100.0)]) == []

    def test_capped_at_max_shown(self):
        many = [self._ratio(i, 2.0 + i / 100) for i in range(40)]
        assert len(ra.find_outliers(many)) == ra.DEFAULTS.max_outliers_shown

    def test_outliers_do_not_fail_the_report(self):
        base = _flat(30, 2000.0)
        after = dict(base)
        after[100] = 800.0
        report = ra.AnomalyReport(
            tuple(ra.month_ratios(_timeline(base, after), 2026, 2, _modes(base))),
            (self._ratio(100, 0.4),),
            ra.DEFAULTS,
        )
        assert report.ok


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

class TestFormatReport:
    def test_failure_names_the_numbers(self):
        base = _flat(100)
        tl = _timeline(base, _scaled(base, 2.41, spread=0.2))
        report = ra.AnomalyReport(
            tuple(ra.month_ratios(tl, 2026, 2, _modes(base))), (), ra.DEFAULTS
        )
        text = ra.format_report(report)
        assert "2026-02 vs 2026-01" in text
        assert "2.410" in text and "FAIL" in text
        assert "Bus" in text and "wkday" in text

    def test_passing_report_still_lists_what_was_checked(self):
        base = _flat(100)
        tl = _timeline(base, _scaled(base, 1.03, spread=0.06))
        report = ra.AnomalyReport(
            tuple(ra.month_ratios(tl, 2026, 2, _modes(base))), (), ra.DEFAULTS
        )
        text = ra.format_report(report)
        assert "passed" in text and "wkday" in text

    def test_release_note_line_only_on_failure(self):
        base = _flat(100)
        ok = ra.AnomalyReport(
            tuple(ra.month_ratios(_timeline(base, _scaled(base, 1.02)), 2026, 2, _modes(base))),
            (), ra.DEFAULTS,
        )
        bad = ra.AnomalyReport(
            tuple(ra.month_ratios(_timeline(base, _scaled(base, 2.41)), 2026, 2, _modes(base))),
            (), ra.DEFAULTS,
        )
        assert ra.release_note_line(ok) is None
        assert "OVERRIDDEN" in ra.release_note_line(bad)
