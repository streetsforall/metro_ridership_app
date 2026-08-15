"""
Merge stop-level ridership into `src/data/stop_ridership.{bus,rail}.json`.

This is the stop-grain counterpart of `process_ridership.merge_ridership`: it takes
the frames `convert_excel_ridership.aggregate_to_stop_ridership` produces, folds them
into the two committed payloads append-only, and writes them back in the columnar wire
format the client decodes.

Usage:
    # writing is driven by update_ridership.py, which owns the scan of data/raw/
    python scripts/update_ridership.py
    python scripts/update_ridership.py --no-stops

    # reconcile the committed payloads against the committed line totals
    python scripts/stop_ridership.py --check
    python scripts/stop_ridership.py --check --tolerance 0.03

## The wire format is a contract, not a preference

`src/stops/stopData.ts` resolves columns **by name** and **rejects an unknown
`schema` outright**, so `WIRE_SCHEMA` may not move without the decoder moving with it.
The committed fixtures at `vite/__fixtures__/stops/*.json` are the format spec.

    {"schema": 1,
     "cols": ["year", "month", "line", "stop", "wd_ons", ...],
     "stops": [{"key": "rail:union-station", "name": "Union Station", "station_order": 1}],
     "rows": [[2025, 8, 802, 0, 9000, 8800, 6000, 5900, 4000, 3900]]}

Three ways it differs from `convert_excel_ridership.STOP_OUTPUT_COLS`, all deliberate:

1. **`mode` is not a column.** There is one file per mode, and the client derives mode
   from the key prefix (`modeFromStopKey`) rather than from the row.
2. **`stop_key`, `stop_name` and `station_order` live in the `stops` dictionary**; each
   row carries an integer index into it. At 106K rows the key would otherwise be most
   of the payload.
3. **`station_order` is an ordering attribute and never an identity** — it is scoped to
   the route, so a station carries a different number on every route calling there. The
   dictionary keeps the smallest. See `stop_identity`.

## Two things that make the diff reviewable

**Deterministic writes.** Rows are sorted by `STOP_KEYS` and the stops dictionary by
key. Without both, every run reorders several megabytes and the data stops being
reviewable at all.

**One JSON array per line.** Not pretty-printed — at 106K rows indentation would be
most of the file — and not one long line either, which is what
`fetch_metro_lines.py` does to `metro_lines.geojson`. A newline per row costs ~2% and
buys a diff that shows which months and which stops moved, which is the only review
this file gets. The Vite plugin passes the bytes through verbatim either way.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import process_ridership as pr
from convert_excel_ridership import LEAF_VALUE_COLS, aggregate_to_stop_ridership

# `iter_raw_frames` walks data/raw/ and yields one raw frame per monthly export. It
# lives in the geometry script because PR 2 needed it first; it belongs in
# `convert_excel_ridership` next to `convert_zip`, and moving it is out of this PR's
# scope. Imported rather than copied — a second copy of the archive-layout rule is
# exactly what `extract_leaf_rows` exists to prevent.
from fetch_stop_locations import iter_raw_frames

STOP_PATHS = {
    "Bus": Path("src/data/stop_ridership.bus.json"),
    "Rail": Path("src/data/stop_ridership.rail.json"),
}

# The grain. One row per line per stop per month — the same keys the line side uses,
# plus the stop.
STOP_KEYS = ["year", "month", "line", "stop_key"]

# The wire-format version `src/stops/stopData.ts` understands (`STOP_WIRE_SCHEMA`).
WIRE_SCHEMA = 1

# Measure columns, lower-cased from the export's own names. Frozen by
# `aggregate_to_stop_ridership` upstream and by `VALUE_COLUMNS` in the decoder.
VALUE_COLS = [col.lower() for col in LEAF_VALUE_COLS]

# `cols` as written. `stop` is the index into the stops dictionary.
WIRE_COLS = ["year", "month", "line", "stop", *VALUE_COLS]

# The in-memory long form these functions pass around: `STOP_OUTPUT_COLS` without
# `mode`, which the file name already carries.
LONG_COLS = ["year", "month", "line", "stop_key", "stop_name", "station_order", *VALUE_COLS]

# Wire measure column -> the ridership.json column its per-line sum is compared against.
RECONCILE_PAIRS = {
    "wd_ons": "est_wkday_ridership",
    "sa_ons": "est_sat_ridership",
    "su_ons": "est_sun_ridership",
}

# Default for `--check`. The plan's figure; the shipped data exceeds it on a handful of
# small bus line-months and `scripts/README.md` says by how much. It is a reporting
# threshold, not something to loosen until nothing trips it.
DEFAULT_TOLERANCE = 0.02


class RenameGuardError(Exception):
    """A stop key appeared in the same month another disappeared. See `detect_renames`."""


# ---------------------------------------------------------------------------
# The wire format
# ---------------------------------------------------------------------------

def empty_stop_ridership() -> pd.DataFrame:
    """A long frame with no rows and the right dtypes.

    What `load_stop_ridership` returns for a payload that does not exist yet — the
    state a fresh clone is in before the first ingest, and the state this PR's own
    backfill started from.
    """
    frame = pd.DataFrame(columns=LONG_COLS)
    return frame.astype(
        {
            "year": "int64", "month": "int64", "line": "int64",
            "stop_key": "object", "stop_name": "object", "station_order": "Int64",
            **{col: "int64" for col in VALUE_COLS},
        }
    )


def load_stop_ridership(path: Path) -> pd.DataFrame:
    """Read one columnar payload back into the long form.

    Columns are resolved **by name** from `cols`, and an unrecognised `schema` raises —
    the same two rules the client decoder follows, for the same reason: a positional
    read would silently return alightings as boardings the first time the pipeline
    reordered a column.

    A missing file is not an error; it is the pre-ingest state.
    """
    if not Path(path).exists():
        return empty_stop_ridership()

    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("schema") != WIRE_SCHEMA:
        raise ValueError(
            f"{path}: wire schema {payload.get('schema')!r}, expected {WIRE_SCHEMA}"
        )

    cols = payload["cols"]
    stops = payload["stops"]
    rows = payload["rows"]
    if not rows:
        return empty_stop_ridership()

    def column(name: str) -> list:
        try:
            index = cols.index(name)
        except ValueError:
            raise ValueError(
                f"{path}: payload has no {name!r} column (has: {', '.join(cols)})"
            ) from None
        return [row[index] for row in rows]

    stop_index = column("stop")
    frame = pd.DataFrame(
        {
            "year": column("year"),
            "month": column("month"),
            "line": column("line"),
            "stop_key": [stops[i]["key"] for i in stop_index],
            "stop_name": [stops[i]["name"] for i in stop_index],
            "station_order": pd.array(
                [stops[i].get("station_order") for i in stop_index], dtype="Int64"
            ),
            **{col: column(col) for col in VALUE_COLS},
        }
    )
    return frame.astype({col: "int64" for col in VALUE_COLS})[LONG_COLS]


def write_stop_ridership(path: Path, df: pd.DataFrame) -> None:
    """Write one long frame out as the columnar wire format.

    Values are rounded here and nowhere earlier, using `process_ridership`'s `+0.5`
    Metro convention — the raw decimals have to survive as far as the merge so that a
    per-line sum still reconciles with `aggregate_to_line_ridership` before rounding.
    Rounding is idempotent, which is what lets a re-run of the whole ingest produce
    byte-identical output from already-rounded committed rows.
    """
    frame = df[LONG_COLS].sort_values(STOP_KEYS).reset_index(drop=True)

    # One dictionary entry per key, chosen deterministically rather than arbitrarily:
    # a name may be spelled two ways across months, and `station_order` genuinely
    # differs per route. Smallest wins in both cases; neither is an identity.
    dictionary = (
        frame.groupby("stop_key", as_index=False)
        .agg(name=("stop_name", "min"), station_order=("station_order", "min"))
        .sort_values("stop_key")
        .reset_index(drop=True)
    )
    position = {key: i for i, key in enumerate(dictionary["stop_key"])}

    stops = [
        {
            "key": key,
            "name": name,
            "station_order": None if pd.isna(order) else int(order),
        }
        for key, name, order in zip(
            dictionary["stop_key"], dictionary["name"], dictionary["station_order"]
        )
    ]

    columns = [
        frame["year"].astype("int64").to_numpy(),
        frame["month"].astype("int64").to_numpy(),
        frame["line"].astype("int64").to_numpy(),
        np.fromiter((position[key] for key in frame["stop_key"]), dtype=np.int64,
                    count=len(frame)),
        *(_round_metro(frame[col]) for col in VALUE_COLS),
    ]
    rows = [[int(value) for value in row] for row in zip(*columns)]

    Path(path).write_text(_dump(stops, rows), encoding="utf-8")


def _round_metro(series: pd.Series) -> np.ndarray:
    """Metro's rounding: `+0.5` then truncate, as `process_ridership.compute_ridership`
    does for line totals. Idempotent on values that are already whole."""
    return np.floor(series.astype(float).to_numpy() + 0.5).astype(np.int64)


def _dump(stops: list[dict], rows: list[list[int]]) -> str:
    """Serialise the payload with one JSON array per line. See the module docstring."""
    def line(value: object) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(", ", ": "))

    return (
        f'{{"schema": {WIRE_SCHEMA},\n'
        f'"cols": {line(WIRE_COLS)},\n'
        '"stops": [\n'
        + ",\n".join(line(stop) for stop in stops)
        + '\n],\n"rows": [\n'
        + ",\n".join(line(row) for row in rows)
        + "\n]}\n"
    )


# ---------------------------------------------------------------------------
# Merging
# ---------------------------------------------------------------------------

def merge_stop_ridership(
    new: pd.DataFrame, current: pd.DataFrame, prefer_new: bool = False
) -> pd.DataFrame:
    """Fold new stop rows into the committed ones, keyed on `STOP_KEYS`.

    Append-only by default: on a key both sides carry, the committed row wins and
    survives byte-identically. `prefer_new=True` is the `--overwrite` path, where a
    Metro restatement replaces what is stored.

    Also the one place the loose-xlsx/zip overlap collapses. `data/raw/` can hold a
    month both as a loose `MM-YYYY-*.xlsx` and inside the zip that contains it; without
    a dedupe on `STOP_KEYS` those months double-count. The line side does the same
    thing in `update_ridership.load_and_compute`.
    """
    first, second = (new, current) if prefer_new else (current, new)
    return (
        pd.concat([first[LONG_COLS], second[LONG_COLS]], ignore_index=True)
        .drop_duplicates(subset=STOP_KEYS, keep="first")
        .sort_values(STOP_KEYS)
        .reset_index(drop=True)
    )


def detect_renames(
    new: pd.DataFrame, current: pd.DataFrame, window: int = 0
) -> list[dict]:
    """Months where a stop key first appears **and** another disappears.

    That pattern is a rename, not a new stop. Metro renames stops between exports, and
    a rename the alias table has not caught up with silently splits one station's
    series into two — the map draws two dots, the ranked table lists both at half their
    real boardings, and nothing anywhere says so. This is the only thing that surfaces
    it.

    Precise about both halves, so an ordinary service change does not trip it:

    - **appears** — first seen in this month, absent from every earlier one. A stop new
      in the dataset's *first* month is just a stop; only later months can carry a
      rename.
    - **disappears** — present in the previous month, absent from this one *and* from
      every later one. A stop that skips a month and returns has not disappeared.

    Returns one entry per month where both are non-empty.

    ## Why there are two windows

    `window=0` is the rule the plan specifies and the one that **fails an ingest**: an
    add and a drop in the *same* month is the sharp signal, and it is silent on the
    twelve committed months. The months that gain keys (2025-09, 2025-12, 2026-05,
    2026-06) lose none, and the month that loses keys (2026-01, line 106 discontinued)
    gains none.

    `docs/ROADMAP.md` risk 5 records why that is not the whole story: a renamed stop can
    be reported under both names for a month, which puts the add and the drop in
    adjacent months where a same-month rule sees neither. Line 28's
    `bus:san-vicente-fairfax` (2025-07 → 2025-12) and `bus:san-vicente-orange-grove`
    (2025-12 → 2026-05) are exactly that shape.

    So `window=1` also pairs a month's additions with drops one month either side. It is
    **advisory and never fails the ingest**, because on this data it necessarily fires:
    2025-12's 40 genuine additions land next to 2026-01's 8 genuine discontinuations, and
    a gate that is red on correct data teaches people to pass `--allow-new-stops`
    reflexively. Printing it puts the churn in front of whoever is ingesting without
    asking them to adjudicate 48 names before the run will proceed.

    Resolving a real finding means adding an alias to `scripts/stop_aliases.json`, which
    folds the two keys into one and makes the signal disappear along with the split.
    """
    combined = pd.concat([current[LONG_COLS], new[LONG_COLS]], ignore_index=True)
    if combined.empty:
        return []

    by_month: dict[tuple[int, int], set[str]] = {}
    for (year, month), group in combined.groupby(["year", "month"]):
        by_month[(int(year), int(month))] = set(group["stop_key"])

    months = sorted(by_month)
    appeared: dict[int, set[str]] = {}
    disappeared: dict[int, set[str]] = {}
    seen = set(by_month[months[0]])
    for i in range(1, len(months)):
        keys = by_month[months[i]]
        appeared[i] = keys - seen
        seen |= keys
        later: set[str] = set().union(*(by_month[m] for m in months[i + 1:]), set())
        disappeared[i] = by_month[months[i - 1]] - keys - later

    findings = []
    for i, added in appeared.items():
        dropped: set[str] = set().union(
            *(disappeared.get(j, set()) for j in range(i - window, i + window + 1)), set()
        )
        if added and dropped:
            year, month = months[i]
            findings.append(
                {
                    "year": year, "month": month,
                    "added": sorted(added), "dropped": sorted(dropped),
                }
            )
    return findings


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------

def reconcile(
    stops: pd.DataFrame, ridership: pd.DataFrame
) -> pd.DataFrame:
    """Per (line, month, day type), how far the sum of stop boardings sits from the
    committed line total.

    **They are not expected to agree exactly, and agreement must not be engineered.**
    Two independent causes, only the first of which is live in the stop-level window:

    1. **Per-stop rounding.** Every stop is rounded on write; the line total is rounded
       once. A line with 150 stops accumulates tens of riders of drift either way, and
       on a small line that is a couple of percent.
    2. **The days-weighted average.** Line ridership goes through
       `compute_ridership`, which weighted-averages across shakeup periods within a
       month. Stop ridership does not. The Excel importer hardcodes `Days = 1` and
       `Shakeup = "S1"`, so within the station-level window this is a no-op; it only
       bites if a future ingest carries real shakeup splits, as the legacy CSVs did.

    A third, smaller one is structural: a leaf row with no usable stop name is dropped
    at stop grain and kept in the line total. `06-2026-Bus.xlsx` has one.

    Returns one row per compared (year, month, line, measure), worst deviation first.
    Line-months whose committed total is zero are skipped — there is no denominator.
    """
    summed = (
        stops.groupby(["year", "month", "line"], as_index=False)[list(RECONCILE_PAIRS)]
        .sum()
        .rename(columns={"line": "line_name"})
    )
    merged = summed.merge(ridership, on=["year", "month", "line_name"], how="inner")

    frames = []
    for measure, line_col in RECONCILE_PAIRS.items():
        part = merged[["year", "month", "line_name"]].copy()
        part["measure"] = measure
        part["stop_sum"] = merged[measure].astype(float)
        part["line_riders"] = merged[line_col].astype(float)
        frames.append(part[part["line_riders"] != 0])

    result = pd.concat(frames, ignore_index=True)
    result["deviation"] = (
        (result["stop_sum"] - result["line_riders"]).abs() / result["line_riders"]
    )
    return result.sort_values("deviation", ascending=False).reset_index(drop=True)


def check_reconciliation(tolerance: float = DEFAULT_TOLERANCE) -> int:
    """`--check`: reconcile the committed payloads against the committed line totals.

    Reads what ships rather than recomputing it, so it validates the files a reviewer
    is looking at. Returns a process exit code.
    """
    with open(pr.RIDERSHIP_PATH, encoding="utf-8") as f:
        ridership = pd.DataFrame(json.load(f))

    stops = pd.concat(
        [load_stop_ridership(path) for path in STOP_PATHS.values()], ignore_index=True
    )
    if stops.empty:
        print("no stop payloads to check — run update_ridership.py first")
        return 1

    result = reconcile(stops, ridership)
    over = result[result["deviation"] >= tolerance]

    print(
        f"reconciled {len(result):,} (line, month, day type) comparisons across "
        f"{len(stops):,} stop rows"
    )
    print(
        f"  median {result['deviation'].median():.2%}   "
        f"p95 {result['deviation'].quantile(0.95):.2%}   "
        f"max {result['deviation'].max():.2%}"
    )

    if over.empty:
        print(f"all within {tolerance:.0%}")
        return 0

    print(f"\n{len(over)} comparison(s) at or above {tolerance:.0%}:")
    for row in over.itertuples(index=False):
        print(
            f"  line {row.line_name} {row.year}-{row.month:02d} {row.measure}: "
            f"stops {row.stop_sum:,.0f} vs line {row.line_riders:,.0f} "
            f"({row.deviation:.2%})"
        )
    print(
        "\nSee scripts/README.md — per-stop rounding is a couple of percent on a small "
        "line. Name the exceptions; do not round stops to match a total they did not "
        "produce."
    )
    return 1


# ---------------------------------------------------------------------------
# The update step, called from update_ridership.main()
# ---------------------------------------------------------------------------

def load_new_stop_ridership(files: list[Path]) -> dict[str, pd.DataFrame]:
    """Aggregate every monthly export under `files` to stop grain, split by mode.

    **Split by source export, not by app mode.** G Line (901) and J Line (910) BRT are
    delivered in the *Bus* workbook, so `stop_ridership.bus.json` carries lines the app
    shows under its train filter. That is correct and load-bearing: the client's mode
    filter keys off `metro_line_metadata_current.json`, never off which file a row
    arrived in, and `src/stops/stopData.ts` derives a stop's mode from its key prefix.
    """
    frames: dict[str, list[pd.DataFrame]] = {mode: [] for mode in STOP_PATHS}
    for df, year, month, mode in iter_raw_frames(files):
        frames[mode].append(aggregate_to_stop_ridership(df, year, month, mode))

    out = {}
    for mode, parts in frames.items():
        if not parts:
            out[mode] = empty_stop_ridership()
            continue
        out[mode] = (
            pd.concat(parts, ignore_index=True)[LONG_COLS]
            .drop_duplicates(subset=STOP_KEYS, keep="first")
            .sort_values(STOP_KEYS)
            .reset_index(drop=True)
        )
    return out


def update_stop_ridership(
    files: list[Path],
    prefer_new: bool = False,
    dry_run: bool = False,
    allow_new_stops: bool = False,
) -> dict[str, dict]:
    """Merge the stop grain of `files` into the two committed payloads.

    Raises `RenameGuardError` before writing anything if `detect_renames` finds a month
    that both gained and lost a key, unless `allow_new_stops` says the additions were
    reviewed.

    Returns `{mode: {"added", "updated", "rows", "stops", "months"}}` for the caller's
    reporting and for the release-note bullet.
    """
    new_by_mode = load_new_stop_ridership(files)
    summary: dict[str, dict] = {}
    to_write: list[tuple[Path, pd.DataFrame]] = []

    for mode, path in STOP_PATHS.items():
        new = new_by_mode[mode]
        current = load_stop_ridership(path)

        findings = detect_renames(new, current)
        if findings and not allow_new_stops:
            raise RenameGuardError(_rename_report(mode, findings))
        if findings:
            print(_rename_report(mode, findings))
            print("  --allow-new-stops given; treating them as genuinely new stops")
        elif adjacent := detect_renames(new, current, window=1):
            print(_churn_report(mode, adjacent))

        merged = merge_stop_ridership(new, current, prefer_new=prefer_new)
        summary[mode] = _summarise(new, current, merged, prefer_new)
        to_write.append((path, merged))

    if not dry_run:
        for path, merged in to_write:
            write_stop_ridership(path, merged)

    return summary


def _summarise(
    new: pd.DataFrame, current: pd.DataFrame, merged: pd.DataFrame, prefer_new: bool
) -> dict:
    keys_current = set(map(tuple, current[STOP_KEYS].to_numpy()))
    keys_new = set(map(tuple, new[STOP_KEYS].to_numpy()))
    overlap = keys_new & keys_current

    updated = 0
    if prefer_new and overlap:
        joined = new.merge(current, on=STOP_KEYS, suffixes=("_new", "_old"))
        differs = pd.Series(False, index=joined.index)
        for col in VALUE_COLS:
            differs |= (
                _round_metro(joined[f"{col}_new"]) != _round_metro(joined[f"{col}_old"])
            )
        updated = int(differs.sum())

    return {
        "added": len(keys_new - keys_current),
        "updated": updated,
        "rows": len(merged),
        "stops": merged["stop_key"].nunique(),
        "months": sorted({(int(y), int(m)) for y, m in merged[["year", "month"]].to_numpy()}),
    }


def _rename_report(mode: str, findings: list[dict]) -> str:
    lines = [
        f"{mode}: a stop key appeared in the same month another disappeared. "
        "That is a rename, not a new stop."
    ]
    for finding in findings:
        lines.append(f"  {finding['year']}-{finding['month']:02d}")
        lines.append(f"    appeared:    {', '.join(finding['added'])}")
        lines.append(f"    disappeared: {', '.join(finding['dropped'])}")
    lines.append(
        "  Fold them onto one key in scripts/stop_aliases.json, or pass "
        "--allow-new-stops if they really are new."
    )
    return "\n".join(lines)


def _churn_report(mode: str, findings: list[dict]) -> str:
    """The advisory half of the guard: stop churn one month either side. Never fails —
    see `detect_renames`."""
    lines = [
        f"  {mode}: no same-month rename, but keys appeared and disappeared within a "
        "month of each other. Worth a look; not a failure."
    ]
    for finding in findings:
        lines.append(
            f"    {finding['year']}-{finding['month']:02d}: "
            f"{len(finding['added'])} appeared, {len(finding['dropped'])} disappeared "
            "nearby"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    # Same reason as update_ridership.main: the report uses en-dashes, and a legacy
    # Windows console mangles or crashes on them.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true",
        help="reconcile the committed stop payloads against ridership.json",
    )
    parser.add_argument(
        "--tolerance", type=float, default=DEFAULT_TOLERANCE,
        help=f"relative deviation to report (default: {DEFAULT_TOLERANCE})",
    )
    args = parser.parse_args(argv)

    if not args.check:
        parser.error(
            "nothing to do. --check reconciles the committed payloads; writing them is "
            "update_ridership.py's job."
        )
    return check_reconciliation(args.tolerance)


if __name__ == "__main__":
    raise SystemExit(main())
