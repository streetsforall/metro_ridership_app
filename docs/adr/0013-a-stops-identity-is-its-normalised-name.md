# A stop's identity is its normalised name, not a number

Status: accepted

Metro's station-level exports name a place twice and identify it never. Each leaf row carries a stop or
station name, and rail rows carry a `STATION_ORDER` value with a numeric prefix —
`"1001-Downtown Long Beach Station"`. There is no stable id anywhere in the export. Something had to
become the identity a series is keyed by, a URL carries and the map joins geometry on, so we mint one:

```
stop_key(mode, name) → "bus:vermont-wilshire", "rail:union-station"
```

The key is the mode prefix, a colon, and the normalised display name slugified — case-folded,
whitespace collapsed, ` / ` unified, and for rail the platform suffix removed, so
`"Union Station - A Line"` and `"Union Station"` are one place. `scripts/stop_identity.py` owns every
part of that, and a hand-maintained alias table completes it.

## Why not the number that looks like an id

`STATION_ORDER`'s prefix is **a per-route sequence**, which means one station carries a different
number on every route calling there. In 2025-12 Union Station is `1026` on the A Line, `4001` on the B
Line and `5001` on the D Line — same station, same month, three numbers. There is no join to be made on
that value, so a payload keyed by it would report one station as three.

The sequence space also moves as the network does. Rail leaf rows went 112 → 124 at 2025-09, when the A
Line's Foothill extension opened and ROUTE 805 was first reported separately from 802, then 124 → 127 at
2026-05 with the D Line extension. Those additions happened to be appended rather than inserted, so no
existing number shifted across 2025-07 → 2026-05 — which is an observation about eleven months, not a
property of the data.

So `station_order` survives in the payload as an **ordering attribute and never an identity**; the
dictionary keeps the smallest number a station carries, purely so a rail table can be listed in route
order.

## What the name-as-identity costs

**A rename splits one series in two, silently, unless something catches it.** This is the real price,
and it is paid twice over.

The first payment is the guard. `stop_ridership.detect_renames` fails an ingest when a key first appears
in a month that is not the dataset's first *and* an existing key disappears in that same month, printing
both lists. Without it, a Metro rename would draw two dots on the map and list both halves in the ranked
table at half their real boardings, with nothing anywhere saying so. Both halves of the test are precise
so ordinary service changes do not trip it: *appears* means absent from every earlier month,
*disappears* means absent from this month and every later one, so a stop that skips a month and returns
is not a disappearance.

The second is `scripts/stop_aliases.json`, which folds one spelling onto the canonical slug and makes
the signal go away along with the split it reported. It is hand-edited pipeline input, never shipped to
the client, and chains are followed so a stop renamed twice still lands on one key. The rail table holds
ten entries, all of them GTFS-side mismatches added by the geometry join; the bus table is empty,
checked across every archive in `data/raw/`.

**One case is ambiguous and deliberately left unaliased.** On line 28,
`bus:san-vicente-fairfax` runs 2025-07 → 2025-12 and `bus:san-vicente-orange-grove` runs
2025-12 → 2026-05: same corridor, comparable boardings, one month of overlap. That is either a rename or
a stop that moved two blocks, and the data cannot say which. Aliasing would merge two series on a guess,
so we leave them split honestly.

**Two genuinely different places sharing a normalised name on one mode collapse into one key.** Nothing
in the pipeline can tell that apart from one place spelled two ways, which is the same limitation from
the other side. Modes are namespaced precisely because names collide across them freely — "Union
Station" is both a bus stop and a rail station.

## What it buys

**Keys are URL-safe by construction**, matching `^(bus|rail):[a-z0-9-]+$`. That is what lets a Stop
Selection go into a query string unencoded and read back as itself, and what lets a key sit in a
`data-qa` attribute without escaping. A surrogate integer would have been shorter and unreadable; a
shared link would then carry `stop=4172` and tell its recipient nothing.

**The name is the one field every source has.** The ridership export, the GTFS feed and the reader all
speak names, so the join between ridership and geometry is a name join whatever the key looks like. The
alias table exists because that join is imperfect — but it would exist for any key derived from a name,
and no other key was available to derive.

## Alternatives

**GTFS `stop_id`.** Stable, opaque, and absent from the ridership export — reaching it would still mean
matching on the name first, which puts the same imperfect join underneath a key that merely looks
authoritative. It would also make a stop with no GTFS match unidentifiable, and those stops are kept
rather than dropped: they have ridership, so they belong in the ranked table and the series even when
the map cannot place them.

**`STATION_ORDER`'s numeric prefix.** Discussed above. It is not an identity, and it is the trap this
ADR exists to mark: a future reader will see a number in the payload and reasonably assume it is one.

**A surrogate id minted at first sighting and stored in a committed registry.** Insulates the key from
renames, and moves the whole problem into the registry — whose entries can only be created by matching a
name, and which would silently mint a second id for a renamed stop exactly as a name key does. It buys
stability against re-slugging, which nothing needs, and costs readability in the URL, which the shared
link needs.

**A rounded `(lat, lon)`.** Available only for stops GTFS knows, which is not all of them, and it makes
identity depend on a coordinate revision.
