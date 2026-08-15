"""
Stop and station identity for the stop-level ridership pipeline.

The Excel exports Metro returns for a records request carry **no stop id**. A bus
row identifies its stop by `STOP_NAME` alone; a rail row identifies its station by
`STATION_ORDER`, which looks like `"1001-Downtown Long Beach Station"`.

The numeric prefix on `STATION_ORDER` is a **per-route sequence, not an identity**.
It is scoped to the route, so one station carries a different number on every route
that calls there: in 2025-12 Union Station is `1026` on the A Line, `4001` on the B
Line and `5001` on the D Line — same station, same month, three numbers. Nothing
downstream could join on that.

The sequence space also moves as the network does. Rail leaf rows went 112 -> 124 at
2025-09, when the A Line's Foothill extension added four stations and ROUTE 805
(D/Purple) was first reported as its own route rather than folded into 802; then
124 -> 127 at 2026-05 as the D Line extension opened. Those particular additions
were appended rather than inserted, so no existing number happened to shift across
2025-07 .. 2026-05 — but that is an observation about eleven months, not a guarantee,
and it is not what the identity rests on.

So a stop's identity is its **normalised name**, plus a hand-maintained alias table
for the cases where Metro renames a stop between months
(`stop_aliases.json`, documented in `scripts/README.md`).

Deliberately free of pandas and of any repo path other than the alias table, so it
can be imported by the ingest, by the geometry join, and by tests without dragging
the pipeline in behind it.
"""

import json
import re
import unicodedata
from pathlib import Path

# The hand-editable rename table. Pipeline input, never shipped to the client.
ALIASES_PATH = Path(__file__).parent / "stop_aliases.json"

# Mode -> the prefix that namespaces a key. Bus and rail names collide freely
# ("Union Station" is both), and the two never share a coordinate source.
_MODE_PREFIXES = {"Bus": "bus", "Rail": "rail"}

# A rail station name may carry the platform it was measured at:
#   "Union Station - A Line", "7th Street / Metro Center Station - A / E Line",
#   "Union Station - Metro Red & Purple Lines"
# All of them are the same *place*, so the suffix is stripped before keying.
# Bus names are never passed through this: "El Monte Station - Upper Level" and
# "Del Amo Station - Discharge Only" are genuinely distinct bus stops.
_LINE_TOKEN = r"(?:[A-Z]|Red|Purple|Blue|Green|Gold|Expo|Orange|Silver)"
_RAIL_PLATFORM_SUFFIX_RE = re.compile(
    rf"\s+-\s+(?:Metro\s+)?{_LINE_TOKEN}(?:\s*(?:/|&|and)\s*{_LINE_TOKEN})*\s+Lines?\s*$",
    re.IGNORECASE,
)

# Alias chains are followed, so "old name -> newer name -> current name" resolves in
# one hop from the caller's point of view. Bounded, because a cycle in a hand-edited
# file must fail loudly rather than hang.
_MAX_ALIAS_HOPS = 10

_aliases_cache: dict[str, dict[str, str]] | None = None


def normalise_stop_name(raw: object) -> str:
    """Fold a raw stop name to its comparison form: case-folded, whitespace
    collapsed, and ` / ` spaced consistently.

    This is *not* a display string — it is lower-case. Use `display_stop_name` for
    anything a reader will see, and `stop_key` for anything used as an identity.

    Raises on a missing name (`None` or NaN) rather than inventing one.

    >>> normalise_stop_name("  103rd  /Central ")
    '103rd / central'
    """
    text = unicodedata.normalize("NFKC", _require_text(raw))
    text = re.sub(r"\s*/\s*", " / ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.casefold()


def strip_rail_platform_suffix(name: str) -> str:
    """Remove a trailing platform qualifier from a rail station name.

    `"Union Station - A Line"` and `"Union Station - Metro Red & Purple Lines"` are
    the same station measured from two platforms; both become `"Union Station"`.
    A name without such a suffix is returned unchanged.
    """
    return _RAIL_PLATFORM_SUFFIX_RE.sub("", str(name)).strip()


def parse_station_order(value: object) -> tuple[int | None, str]:
    """Split a rail `STATION_ORDER` cell into its sequence number and its name.

    The split is on the **first** hyphen, and only when everything before it is
    digits — station names contain hyphens of their own, and the aggregate rows
    Metro interleaves into the export (`"Total"`, blank) carry no number at all.

    Returns `(None, "")` for a missing cell, and `(None, <text>)` when there is no
    numeric prefix to take.

    >>> parse_station_order("1001-Downtown Long Beach Station")
    (1001, 'Downtown Long Beach Station')
    >>> parse_station_order("Total")
    (None, 'Total')
    """
    # `value != value` is the NaN test; it keeps this module free of pandas.
    if value is None or value != value:
        return None, ""

    text = str(value).strip()
    head, separator, tail = text.partition("-")
    if separator and head.strip().isdigit():
        return int(head.strip()), tail.strip()
    return None, text


def display_stop_name(mode: str, raw: object) -> str:
    """The reader-facing name for a stop: whitespace tidied, case preserved, and —
    for rail — the platform suffix removed so that every row sharing a `stop_key`
    also shares one name.

    Companion to `normalise_stop_name`, which case-folds and therefore cannot be
    shown to anyone.
    """
    text = unicodedata.normalize("NFKC", _require_text(raw))
    text = re.sub(r"\s*/\s*", " / ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if mode == "Rail":
        text = strip_rail_platform_suffix(text)
    return text


def stop_key(mode: str, name: str, aliases: dict[str, dict[str, str]] | None = None) -> str:
    """The identity of a stop: `"bus:vermont-wilshire"`, `"rail:union-station"`.

    Slugs are URL-safe by construction (`^(bus|rail):[a-z0-9-]+$`), which is what
    lets a key go into a query string unencoded.

    `aliases` is the parsed `stop_aliases.json`; pass `None` for no aliasing.
    Aliases are keyed on the **unprefixed** slug, per mode, and are followed
    transitively so a stop renamed twice still lands on one key.
    """
    if mode not in _MODE_PREFIXES:
        raise ValueError(f"Unknown mode {mode!r}; expected 'Bus' or 'Rail'.")

    text = normalise_stop_name(name)
    if mode == "Rail":
        text = strip_rail_platform_suffix(text)

    slug = _slugify(text)
    if not slug:
        raise ValueError(f"Stop name {name!r} has no usable characters for a key.")

    if aliases:
        slug = _resolve_alias(_MODE_PREFIXES[mode], slug, aliases)

    return f"{_MODE_PREFIXES[mode]}:{slug}"


def load_aliases(path: Path | None = None) -> dict[str, dict[str, str]]:
    """Read `stop_aliases.json`. Cached, because the ingest calls `stop_key` once
    per stop per month and the table is small and static within a run.

    Top-level keys starting with `_` are commentary and are ignored.
    """
    global _aliases_cache
    if path is None:
        if _aliases_cache is None:
            _aliases_cache = _read_aliases(ALIASES_PATH)
        return _aliases_cache
    return _read_aliases(path)


def _read_aliases(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def _require_text(raw: object) -> str:
    """Coerce a cell to text, refusing the two ways a name can be absent.

    A missing name must fail loudly. Left to `str()`, `None` becomes `"none"` and a
    NaN becomes `"nan"` — a plausible-looking stop whose figures are the sum of every
    blank-named row on its line. Nothing surfaces that until someone reads the map.
    """
    # `raw != raw` is the NaN test; it keeps this module free of pandas.
    if raw is None or raw != raw:
        raise ValueError(f"Stop name is missing ({raw!r}).")
    return str(raw)


def _slugify(text: str) -> str:
    ascii_text = (
        unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def _resolve_alias(prefix: str, slug: str, aliases: dict[str, dict[str, str]]) -> str:
    table = aliases.get(prefix) or {}
    chain = [slug]
    for _ in range(_MAX_ALIAS_HOPS):
        target = table.get(slug)
        if target is None:
            return slug
        if target in chain:
            raise ValueError(
                f"Alias cycle in stop_aliases.json for {prefix!r}: "
                f"{' -> '.join([*chain, target])}"
            )
        chain.append(target)
        slug = target
    raise ValueError(
        f"Alias chain for {prefix}:{chain[0]!r} exceeds {_MAX_ALIAS_HOPS} hops "
        f"({' -> '.join(chain)}); collapse it in stop_aliases.json."
    )
