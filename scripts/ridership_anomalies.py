"""
Plausibility guard for a newly ingested month of ridership.

Metro's June 2026 bus export was inflated across every one of 108 lines
(weekday x2.41, Saturday x2.37, Sunday x1.49).  Nothing in the pipeline looked
at magnitudes, so it merged unchallenged.  This module is that missing check:
update_ridership.py runs it before writing and refuses the merge when a month
looks systemically wrong.

The hard part is not catching June 2026 — it is *not* catching the real events
that also move numbers a long way.  Two things happen in this dataset that must
never fail the guard:

  - One line changes enormously on its own.  The D Line fell 40% in June 2026
    when its opening-month surge faded; the E Line doubled in July 2023 when the
    Regional Connector opened.
  - A whole mode's *total* jumps.  July 2023 rail summed to 1.22x May's because
    three of six routes were restructured at once.

So the two failing tests below both key on the **median** per-line ratio, which
one line cannot move and which a genuine restructure of a few lines does not
move either (July 2023 rail: median 1.019 against a sum ratio of 1.224).  A
sum-based or spread-based test cannot separate that from a real defect.  Per-line
outliers are reported, but only as information — see find_outliers.

Thresholds are calibrated against the full committed history: 1,214 mode x month
x day-type observations from 2009 to 2026, excluding COVID (2020-03..07) and the
defective June 2026 bus month.  See Thresholds for the numbers behind each one.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from math import log
from pathlib import Path

import pandas as pd

import process_ridership as pr

KEYS = ["year", "month", "line_name"]

# ridership.json column -> the label used in the report
DAY_TYPES = {
    "est_wkday_ridership": "wkday",
    "est_sat_ridership": "sat",
    "est_sun_ridership": "sun",
}

UNKNOWN_MODE = "Unknown"


@dataclass(frozen=True)
class Thresholds:
    """Guard parameters, with the calibration behind each default.

    ``mode_bands`` — the largest clean |median-1| in 17 years is 0.187 for Bus
    (Feb 2011 Sunday) and 0.214 for Rail (Apr 2011 Sunday, only 4 lines).  The
    bands sit 34% and 40% above those.  June 2026 bus deviates 1.410 / 1.338 /
    0.480, so even its mildest day type trips the band by 1.9x.  Rail's band is
    the wider one because rail has 4-6 lines and a noisier median.

    ``min_lines_uniform`` — the unanimity test is gated on mode width because
    rail reaches 100% unanimity in 31 clean observations, 6 of them with
    deviation above ``uniform_median_dev``.  Without the gate those are six pure
    false positives.  Bus never drops below 91 lines and never exceeds 0.964
    unanimity in clean history, so the gate costs nothing where it matters.
    """

    min_base: float = 50.0
    mode_bands: Mapping[str, float] = field(
        default_factory=lambda: {"Bus": 0.25, "Rail": 0.30}
    )
    default_band: float = 0.25
    min_lines_median: int = 3
    min_lines_uniform: int = 20
    uniform_frac: float = 0.98
    uniform_median_dev: float = 0.15
    direction_margin: float = 0.05
    outlier_hi: float = 1.5
    outlier_lo: float = 0.667
    outlier_min_base: float = 500.0
    max_outliers_shown: int = 15

    def band_for(self, mode: str) -> float:
        return self.mode_bands.get(mode, self.default_band)


DEFAULTS = Thresholds()


@dataclass(frozen=True)
class LineRatio:
    line_name: int
    mode: str
    day_type: str
    baseline: float
    value: float
    ratio: float


@dataclass(frozen=True)
class GroupCheck:
    """One (mode, day_type) comparison of a month against its predecessor."""

    year: int
    month: int
    base_year: int
    base_month: int
    mode: str
    day_type: str
    n_lines: int
    n_appeared: int
    n_vanished: int
    n_below_floor: int
    median_ratio: float | None
    total_ratio: float | None
    p10: float | None
    p90: float | None
    frac_up: float
    frac_down: float
    unanimity: float
    verdict: str
    detail: str

    @property
    def failed(self) -> bool:
        return self.verdict not in ("ok", "skipped")


@dataclass(frozen=True)
class AnomalyReport:
    groups: tuple[GroupCheck, ...]
    outliers: tuple[LineRatio, ...]
    thresholds: Thresholds

    @property
    def failures(self) -> tuple[GroupCheck, ...]:
        return tuple(g for g in self.groups if g.failed)

    @property
    def ok(self) -> bool:
        return not self.failures


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

def build_mode_map(
    raw_df: pd.DataFrame | None = None, metadata_path: Path | None = None
) -> dict[int, str]:
    """Map line -> "Bus" / "Rail", falling back to UNKNOWN_MODE.

    ridership.json carries no mode column (RIDERSHIP_COLS drops it in
    compute_ridership), so the mode has to be recovered from elsewhere.  The
    long raw frame is preferred because it describes the very months being
    judged; metro_line_metadata_current.json fills in every older line.

    A line can hold both modes — 801 does, as a rail route with bus-bridge rows.
    The raw frame breaks that tie by row count, which reflects what the line
    mostly is; the metadata file, having one row per (line, mode), breaks it
    alphabetically.  Either way the choice is deterministic, and a line that
    resolves to neither lands in UNKNOWN_MODE, which is reported but can never
    fail the guard.
    """
    mapping: dict[int, str] = {}

    path = metadata_path if metadata_path is not None else pr.METADATA_PATH
    try:
        meta = pd.DataFrame(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, ValueError):
        meta = pd.DataFrame()
    if not meta.empty and {"line", "mode"} <= set(meta.columns):
        for line, mode in (
            meta.dropna(subset=["line", "mode"])
            .sort_values(["line", "mode"])
            .drop_duplicates("line", keep="first")[["line", "mode"]]
            .to_numpy()
        ):
            mapping[int(line)] = str(mode)

    if raw_df is not None and not raw_df.empty and {"line", "mode"} <= set(raw_df.columns):
        counts = (
            raw_df.dropna(subset=["line", "mode"])
            .groupby(["line", "mode"])
            .size()
            .reset_index(name="n")
            .sort_values(["line", "n", "mode"], ascending=[True, False, True])
            .drop_duplicates("line", keep="first")
        )
        for line, mode, _ in counts[["line", "mode", "n"]].to_numpy():
            mapping[int(line)] = str(mode)

    return mapping


def build_timeline(current: pd.DataFrame, new_df: pd.DataFrame) -> pd.DataFrame:
    """Stack committed history under the incoming batch, new records winning.

    A multi-month delivery such as 2026-04_2026-05.zip must judge May against
    the *new* April, not against whatever April the JSON happens to hold, so the
    incoming frame goes first and the de-dupe keeps it.
    """
    frames = [f for f in (new_df, current) if f is not None and not f.empty]
    if not frames:
        return pd.DataFrame(columns=[*KEYS, *DAY_TYPES])

    cols = [*KEYS, *DAY_TYPES]
    stacked = pd.concat(
        [f.reindex(columns=cols) for f in frames], ignore_index=True
    ).drop_duplicates(subset=KEYS, keep="first")
    stacked["period"] = stacked["year"] * 12 + stacked["month"]
    return stacked


def _period_to_ym(period: int) -> tuple[int, int]:
    return (period - 1) // 12, (period - 1) % 12 + 1


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

def month_ratios(
    timeline: pd.DataFrame,
    year: int,
    month: int,
    mode_map: Mapping[int, str],
    t: Thresholds = DEFAULTS,
) -> list[GroupCheck]:
    """Check every (mode, day_type) group for one month against the month before."""
    period = year * 12 + month
    base_period = period - 1
    base_year, base_month = _period_to_ym(base_period)

    lines_now = timeline.loc[timeline["period"] == period, "line_name"]
    modes = sorted({mode_map.get(int(ln), UNKNOWN_MODE) for ln in lines_now})

    groups: list[GroupCheck] = []
    for col, day_type in DAY_TYPES.items():
        wide = timeline.pivot_table(index="line_name", columns="period", values=col)
        have_base = base_period in wide.columns and period in wide.columns

        for mode in modes:
            members = [ln for ln in wide.index if mode_map.get(int(ln), UNKNOWN_MODE) == mode]
            common = dict(
                year=year, month=month, base_year=base_year, base_month=base_month,
                mode=mode, day_type=day_type,
            )
            if not have_base:
                groups.append(_skipped(
                    common, f"no {base_year}-{base_month:02d} baseline to compare against"
                ))
                continue

            base = wide.loc[members, base_period]
            now = wide.loc[members, period]
            eligible = (base >= t.min_base) & (now >= t.min_base)
            appeared = int(((base.isna() | (base < t.min_base)) & (now >= t.min_base)).sum())
            vanished = int(((base >= t.min_base) & (now.isna() | (now < t.min_base))).sum())
            below = int((~eligible & ~base.isna() & ~now.isna()).sum())

            ratios = [
                LineRatio(int(ln), mode, day_type, float(base[ln]), float(now[ln]),
                          float(now[ln] / base[ln]))
                for ln in base.index[eligible]
            ]
            counts = dict(n_appeared=appeared, n_vanished=vanished, n_below_floor=below)
            groups.append(check_group(ratios, common, counts, t))

    return groups


def _skipped(
    common: dict, detail: str, n_lines: int = 0, counts: dict | None = None
) -> GroupCheck:
    """A group too thin to judge.  The eligibility counts survive anyway — a
    month where everything vanished is worth showing even when no median can be
    computed from what is left."""
    return GroupCheck(
        **common, n_lines=n_lines,
        **(counts or dict(n_appeared=0, n_vanished=0, n_below_floor=0)),
        median_ratio=None, total_ratio=None, p10=None, p90=None,
        frac_up=0.0, frac_down=0.0, unanimity=0.0, verdict="skipped", detail=detail,
    )


def check_group(
    ratios: list[LineRatio], common: dict, counts: dict, t: Thresholds = DEFAULTS
) -> GroupCheck:
    """Apply the median-band and uniform-shift tests to one group."""
    if len(ratios) < t.min_lines_median:
        return _skipped(
            common,
            f"only {len(ratios)} comparable line(s); need {t.min_lines_median}",
            n_lines=len(ratios), counts=counts,
        )

    series = pd.Series([r.ratio for r in ratios])
    median = float(series.median())
    dev = abs(median - 1.0)
    base_sum = sum(r.baseline for r in ratios)
    total = float(sum(r.value for r in ratios) / base_sum) if base_sum else None

    frac_up = float((series > 1 + t.direction_margin).mean())
    frac_down = float((series < 1 - t.direction_margin).mean())
    unanimity = max(frac_up, frac_down)

    mode = common["mode"]
    band = t.band_for(mode)
    verdict, detail = "ok", ""

    if mode != UNKNOWN_MODE and dev > band:
        verdict = "median-out-of-band"
        detail = (
            f"median ratio {median:.3f} is {dev:.3f} from 1.0, outside the "
            f"+/-{band:.2f} band for {mode}"
        )
    elif (
        mode != UNKNOWN_MODE
        and len(ratios) >= t.min_lines_uniform
        and unanimity >= t.uniform_frac
        and dev > t.uniform_median_dev
    ):
        verdict = "uniform-shift"
        detail = (
            f"{unanimity:.0%} of {len(ratios)} lines moved the same way by more "
            f"than {t.direction_margin:.0%}, with median ratio {median:.3f}"
        )

    return GroupCheck(
        **common, n_lines=len(ratios), **counts,
        median_ratio=median, total_ratio=total,
        p10=float(series.quantile(0.10)), p90=float(series.quantile(0.90)),
        frac_up=frac_up, frac_down=frac_down, unanimity=unanimity,
        verdict=verdict, detail=detail,
    )


def find_outliers(
    ratios: Iterable[LineRatio], t: Thresholds = DEFAULTS
) -> list[LineRatio]:
    """Per-line movements worth a human's attention.  Never fails the guard.

    A single line moving a long way is usually real — a line extension, a
    service change, a surge fading — so these are printed and nothing more.
    """
    picked = [
        r for r in ratios
        if r.baseline >= t.outlier_min_base
        and (r.ratio >= t.outlier_hi or r.ratio <= t.outlier_lo)
    ]
    picked.sort(key=lambda r: abs(log(r.ratio)) if r.ratio > 0 else float("inf"), reverse=True)
    return picked[: t.max_outliers_shown]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def check_anomalies(
    new_df: pd.DataFrame,
    current: pd.DataFrame,
    raw_df: pd.DataFrame | None,
    months: Iterable[tuple[int, int]],
    t: Thresholds = DEFAULTS,
) -> AnomalyReport:
    """Judge every month that is about to be written."""
    mode_map = build_mode_map(raw_df)
    timeline = build_timeline(current, new_df)

    groups: list[GroupCheck] = []
    outliers: list[LineRatio] = []
    for year, month in sorted(months):
        if timeline.empty:
            continue
        groups.extend(month_ratios(timeline, year, month, mode_map, t))
        outliers.extend(_outliers_for_month(timeline, year, month, mode_map, t))

    return AnomalyReport(tuple(groups), tuple(find_outliers(outliers, t)), t)


def _outliers_for_month(timeline, year, month, mode_map, t) -> list[LineRatio]:
    period = year * 12 + month
    base_period = period - 1
    found: list[LineRatio] = []
    for col, day_type in DAY_TYPES.items():
        wide = timeline.pivot_table(index="line_name", columns="period", values=col)
        if base_period not in wide.columns or period not in wide.columns:
            continue
        base, now = wide[base_period], wide[period]
        ok = base.notna() & now.notna() & (base >= t.outlier_min_base) & (now > 0)
        for ln in base.index[ok]:
            found.append(LineRatio(
                int(ln), mode_map.get(int(ln), UNKNOWN_MODE), day_type,
                float(base[ln]), float(now[ln]), float(now[ln] / base[ln]),
            ))
    return found


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def format_report(report: AnomalyReport) -> str:
    """Render the guard's findings, whether or not anything tripped."""
    if not report.groups:
        return "anomaly guard: nothing to check"

    lines: list[str] = []
    by_month: dict[tuple[int, int], list[GroupCheck]] = {}
    for g in report.groups:
        by_month.setdefault((g.year, g.month), []).append(g)

    for (year, month), groups in sorted(by_month.items()):
        base = groups[0]
        lines.append(
            f"anomaly guard: {year}-{month:02d} vs "
            f"{base.base_year}-{base.base_month:02d}"
        )
        lines.append(
            f"  {'mode':<8}{'day':<7}{'lines':>6}{'median':>9}"
            f"{'total':>8}{'p10':>8}{'p90':>8}{'same-dir':>10}  verdict"
        )
        for g in sorted(groups, key=lambda g: (g.mode, g.day_type)):
            if g.verdict == "skipped":
                lines.append(f"  {g.mode:<8}{g.day_type:<7}{'-':>6}  skipped — {g.detail}")
                continue
            verdict = "ok" if not g.failed else f"FAIL {g.verdict}"
            lines.append(
                f"  {g.mode:<8}{g.day_type:<7}{g.n_lines:>6}"
                f"{g.median_ratio:>9.3f}"
                f"{(g.total_ratio if g.total_ratio is not None else float('nan')):>8.3f}"
                f"{g.p10:>8.3f}{g.p90:>8.3f}{g.unanimity:>9.0%}  {verdict}"
            )
        for g in sorted(groups, key=lambda g: (g.mode, g.day_type)):
            if g.failed:
                lines.append(f"    {g.mode} {g.day_type}: {g.detail}")
        excluded = [
            (sum(g.n_below_floor for g in groups), "below the rider floor"),
            (sum(g.n_appeared for g in groups), "appeared"),
            (sum(g.n_vanished for g in groups), "vanished"),
        ]
        noted = ", ".join(f"{n} {label}" for n, label in excluded if n)
        if noted:
            lines.append(f"  excluded from the median: {noted}")
        lines.append("")

    if report.outliers:
        lines.append("per-line outliers (informational, does not block):")
        for r in report.outliers:
            lines.append(
                f"  {r.mode:<5}{r.line_name:>5} {r.day_type:<6}"
                f"{r.baseline:>10,.0f} -> {r.value:>9,.0f}  ({r.ratio:.2f}x)"
            )
        lines.append("")

    if report.ok:
        lines.append(f"anomaly guard: passed {len(report.groups)} check(s)")
    else:
        lines.append(
            f"anomaly guard: FAILED {len(report.failures)} of "
            f"{len(report.groups)} check(s)"
        )
    return "\n".join(lines)


def release_note_line(report: AnomalyReport) -> str | None:
    """One bullet recording an override, for DATA_RELEASE_NOTES.md."""
    if report.ok:
        return None
    parts = [
        f"{g.mode} {g.day_type} median {g.median_ratio:.2f}x"
        for g in report.failures
        if g.median_ratio is not None
    ]
    return (
        "- **Anomaly guard:** OVERRIDDEN via `--allow-anomalies` — "
        + "; ".join(parts)
        + ".\n"
    )
