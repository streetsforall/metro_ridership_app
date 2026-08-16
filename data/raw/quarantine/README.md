# Quarantined source files

Raw deliveries that are known to be wrong. They are kept as evidence — for the follow-up with
Metro, and so nobody re-diagnoses the same defect from scratch — but they are deliberately out of
the ingest path.

`update_ridership.py` globs `data/raw/` non-recursively (`discover_inputs`, via `Path.glob`), so
files in this directory are never picked up. Do not move them back up a level.

## `2026-06-bus-defective.zip` — `06-2026-Bus.xlsx`

Quarantined 2026-08-16. Inflated across **all 108 bus lines**: weekday x2.41, Saturday x2.37,
Sunday x1.49 against May 2026. Row counts and the `Avg Ons + Avg Offs == Avg Stop Activity`
identity are intact, so the structure is fine and only the values are wrong.

Full evidence and the ask sent to Metro:
[`docs/data-quality/2026-06-bus-export-defect.md`](../../../docs/data-quality/2026-06-bus-export-defect.md).

The rail half of the same delivery is unaffected and remains in
[`data/raw/2026-06_2026-06.zip`](../2026-06_2026-06.zip), which now holds `06-2026-Rail.xlsx`
only.

**When Metro sends a corrected export**, drop it in `data/raw/` under the usual naming and run
`update_ridership.py`. The June bus records were removed rather than zeroed, so they are new keys
and the default append-only mode will take them — `--overwrite` is not needed.
