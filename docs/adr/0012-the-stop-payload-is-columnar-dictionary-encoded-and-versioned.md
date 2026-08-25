# The stop payload is columnar, dictionary-encoded and versioned, with one file per mode

Status: accepted

Stop-grain ridership is two orders of magnitude larger than line grain: 105,984 rows and 6,785 stops
in `stop_ridership.bus.json` against ~42,000 line-grain records, 5.3 MB as committed. It is generated
data that lives in the repository, is fetched at runtime rather than bundled, and is reviewed as a
diff every month when a new export lands. Those three facts together fixed its shape.

The format is a four-key envelope. The committed fixtures at `vite/__fixtures__/stops/*.json` are the
spec, and this is one row of it:

```json
{"schema": 1,
 "cols": ["year", "month", "line", "stop", "wd_ons", "wd_offs", "sa_ons", "sa_offs", "su_ons", "su_offs"],
 "stops": [{"key": "rail:union-station", "name": "Union Station", "station_order": 1026}],
 "rows": [[2025, 8, 802, 0, 9000, 8800, 6000, 5900, 4000, 3900]]}
```

## The four decisions inside that shape

**Columnar, because a key repeated 106,000 times is most of the payload.** `cols` names each field
once and every row is a positional tuple. Line grain makes the same trade, but arrives differently:
`ridership.json` is committed as pretty records and re-encoded columnar at build time, while the stop
files are written columnar by Python and served as-is. Pretty records at stop grain would be roughly
25 MB rewritten in full on every monthly ingest — repository growth rather than taste.

**A stops dictionary, because the identity is the expensive part of a row.** `stop_key`, `stop_name`
and `station_order` live once each in `stops`, and a row carries an integer index into it. A stop key
averages around twenty characters and would otherwise appear in all 106,000 rows.

**Resolved by name, never by position.** `src/stops/stopData.ts` reads every column through
`columnIndex`, which throws and names the missing column rather than yielding `undefined`. That lets
the pipeline reorder or extend `cols` without a client change, and it is the difference between a
build that stops and a map drawn from a column of `NaN`s — or alightings rendered as boardings, which
is plausible enough to survive review.

**Versioned, and an unknown version is rejected outright.** `decodeStopRidership` throws when
`data.schema !== STOP_WIRE_SCHEMA`, because decoding what we recognise and hoping is how a payload
whose meaning has changed gets rendered as though it hadn't. `WIRE_SCHEMA` cannot move without the
decoder moving with it.

## One file per mode, and mode is not a column

There are two payloads, `bus` and `rail`, and neither carries a `mode` column; the client derives mode
from the stop key's prefix through `modeFromStopKey`. Splitting the files keeps a rail-only reader off
the 5.3 MB bus payload, and an e2e case asserts that selecting a rail line never requests it.

**The split is by source export, not by app mode**, and that is load-bearing. G Line (901) and J Line
(910) BRT arrive in Metro's *Bus* workbook, so `stop_ridership.bus.json` carries lines the app shows
under its train filter. The client's mode filter keys off `metro_line_metadata_current.json` and never
off which file a row came from.

`modeFromStopKey` is total rather than strict: an unrecognised prefix falls back to `Bus`. Mode there
chooses only which magnitude domain a radius normalises against, so a wrong answer makes one circle
the wrong size while throwing would take the whole panel down over one malformed key.

## What the format costs, and what it buys back

**A schema bump moves both halves** — the Python writer and the TypeScript decoder together. That is
the intended cost of rejecting unknown versions.

**`station_order` rides along in the dictionary and is not an identity.** It is a per-route sequence,
so one station carries a different number on every route calling there, and the dictionary keeps the
smallest. Ordering attribute only — see [ADR-0013](0013-a-stops-identity-is-its-normalised-name.md).

**The file stays readable.** One JSON array per line: not pretty-printed, where indentation would be
most of the file, and not one long line either. A newline per row costs about 2% and buys a diff that
shows which months and which stops moved, which is the only review a multi-megabyte data file gets.
Rows are sorted by `["year", "month", "line", "stop_key"]` and the dictionary by key, so a re-ingest
over unchanged archives produces byte-identical output.

**An absent payload is a supported state.** `vite/stop-ridership-plugin.ts` serves nothing and reports
zero coverage when a file is missing, because a fresh clone before the first ingest has none, and
neither does a branch landing the client ahead of the data. A *malformed* file still throws: absent is
a state, corrupt is a bug.

**The manifest exists so the panel need not fetch to find out what it has.**
`virtual:stop-ridership-manifest` carries `minMonth`, `maxMonth`, `monthCount` and the two byte
counts, which is how the Stop Coverage Window can be stated before megabytes are on the wire.

## Alternatives

**An array of `{year, month, line, stop_key, …}` objects**, as line grain is committed. Rejected on
size: the 25 MB rewrite above, every month, in a repository that keeps its generated data.

**A binary format — Arrow, protobuf, CBOR.** Smaller and faster to parse, and rejected because it
would make the committed dataset unreviewable. The monthly diff is the only review these numbers get,
and a binary blob turns "which stops moved" into an unanswerable question. This app has no backend, so
there is nowhere to put an opaque artefact a human never has to read.

**One combined payload with a `mode` column.** Simpler to write, and it would put 5.3 MB of bus data
in front of every reader who opened the panel on a rail line.

**Positional columns with no `cols` header.** Marginally smaller, and it makes a pipeline column
reorder a silent data corruption instead of a loud build failure.

**No `schema` key, with compatibility inferred from the columns present.** Column presence answers
whether a field exists, never whether its *meaning* changed — a rounding rule or a null convention can
move without any column moving.
