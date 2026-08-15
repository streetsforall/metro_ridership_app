/**
 * The stop-grain shapes: the wire format the Python pipeline writes, and the two
 * records the app derives Stop Views from.
 *
 * These sit in `src/@types/` beside `metrics.types.ts` rather than inside
 * `src/stops/` because they are the *inputs* to that module — the caller has to name
 * them to hand data in, so they cannot live behind its seam. Everything `src/stops/`
 * **derives** (Stop Metrics, Stop Readouts, the Stop View itself) is declared inside
 * the module and re-exported from its `index.ts`. See
 * `docs/adr/0007-a-folder-with-an-index-is-a-sealed-module.md`.
 */

/**
 * A stop or station as a place: its identity, its display name and, where GTFS knew
 * one, its coordinate.
 *
 * **Identity is `key`** — the normalised-name slug the pipeline mints, shaped
 * `^(bus|rail):[a-z0-9-]+$`. It is URL-safe by construction, which is what lets
 * `stop=<key>` go into the query string unencoded.
 *
 * A Stop Place with `lat`/`lon` of `null` is a stop GTFS had no geometry for. It is
 * kept, not dropped: it still has ridership, so it belongs in the table and the
 * series, and it is simply absent from the map layer. Dropping it would silently
 * change a line's stop count between months.
 */
export interface StopPlace {
  key: string;
  name: string;
  lat: number | null;
  lon: number | null;
  /**
   * Which export the stop came from, i.e. its key prefix — **not** the app's mode
   * filter. G Line (901) and J Line (910) BRT arrive in the *Bus* workbook, so their
   * stops are `Bus` here while the app lists those lines under the train filter. The
   * mode filter keys off `metro_line_metadata_current.json`; this field only says
   * which magnitude domain the marker radius is normalised against.
   */
  mode: 'Bus' | 'Rail';
  /**
   * Rail only: Metro's per-route sequence number for the station, or `null`.
   *
   * An **ordering attribute, never an identity.** It is scoped to the route, so Union
   * Station carries a different number on each line through it, and it renumbers when
   * a line is extended — the rail rows went 112 → 124 when the D Line extension
   * landed. Anything keying on it instead of on `key` will split or merge stations.
   */
  stationOrder: number | null;
}

/**
 * One stop's reported boardings and alightings for one line for one month.
 *
 * Field names mirror the app's existing day-of-week vocabulary (`wkday` / `sat` /
 * `sun`, as in `daysOfWeek`) rather than the wire's `wd` / `sa` / `su`. The decoder
 * bridges the two by name — see `decodeStopRidership`.
 *
 * `null` is a month the stop did not report, never a zero. A stop that reports no
 * riders reports `0`.
 */
export interface StopRecord {
  year: number;
  /** 1-based, matching the data, the URL and `transit-events.json`. */
  month: number;
  /** The Stop Place key this record belongs to. */
  stop_key: string;
  /** Numeric line id. Named to match `RidershipRecord.line_name`. */
  line_name: number;
  wkday_ons: number | null;
  wkday_offs: number | null;
  sat_ons: number | null;
  sat_offs: number | null;
  sun_ons: number | null;
  sun_offs: number | null;
}

/**
 * Which figures a Stop View reads: boardings, alightings, or their sum.
 *
 * The literals are the `measure` URL param's values, so the state round-trips through
 * a shared link without a translation table. **UI copy says Boardings and
 * Alightings** — never "ons"/"offs" (`CONTEXT.md`).
 */
export type StopMeasure = 'ons' | 'offs' | 'both';

/**
 * The wire format of `src/data/stop_ridership.{bus,rail}.json`, served by the
 * `stop-ridership` Vite plugin (see `vite/stop-ridership-plugin.ts`).
 *
 * Unlike `ridership.json` — pretty records that the build re-encodes — these files
 * ship **already columnar** from Python and the plugin passes them through
 * unmodified. Two dedupes carry the size: a `cols` header names each field once
 * instead of once per row, and `stops` is a dictionary so a stop key and its display
 * name are stored once rather than on each of its ~11 monthly rows.
 */
export interface ColumnarStopRidership {
  /**
   * Wire-format version. `1` today. The decoder rejects anything else rather than
   * guessing, because a silently-misread payload would put wrong numbers on a map.
   */
  schema: number;
  /**
   * Names each position in a `rows` tuple. The decoder resolves columns **by name**,
   * so this order is not load-bearing and the pipeline may reorder or extend it.
   */
  cols: string[];
  /** The stop dictionary. A row's `stop` column is an index into this array. */
  stops: StopDictionaryEntry[];
  /** One tuple per (line, stop, month), positionally aligned to `cols`. */
  rows: (number | null)[][];
}

/** One entry of {@link ColumnarStopRidership.stops}. */
export interface StopDictionaryEntry {
  /** `"bus:vermont-wilshire"` / `"rail:union-station"`. */
  key: string;
  name: string;
  /** Rail only, and an ordering attribute — never identity. Absent or `null` for bus. */
  station_order?: number | null;
}

/**
 * The wire format of `src/data/stop_locations.json` — the GTFS join, written by
 * `scripts/fetch_stop_locations.py`.
 *
 * Bundled rather than fetched: it is small (one entry per stop, no monthly rows) and
 * the map needs it in the same tick it needs the markers.
 */
export interface StopLocationsFile {
  /**
   * Provenance: the GTFS feeds, the ridership archives, the match rates and the
   * thresholds the run used.
   *
   * Typed `unknown` on purpose. Nothing in the app reads it — it exists so a human can
   * tell which feed a coordinate came from — and pinning its shape here would mean
   * this file has to be edited every time `fetch_stop_locations.py` records one more
   * diagnostic. `unknown` is the honest width, and it keeps the whole file assignable
   * from a direct `import … from '../data/stop_locations.json'`.
   */
  generated_from?: unknown;
  stops: Record<string, StopLocationEntry>;
  /**
   * Stops with ridership that GTFS had no usable geometry for. **Reported, not
   * dropped** — they keep their readout and their series, and are absent from the map
   * layer only. 29 of 6,895 at the time of writing.
   */
  unmatched?: UnmatchedStop[];
}

/** One entry of {@link StopLocationsFile.unmatched}. */
export interface UnmatchedStop {
  stop_key: string;
  name: string;
  /** `string`, not `'Bus' | 'Rail'` — see {@link StopLocationEntry.mode}. */
  mode: string;
  /** The lines that serve it, so the report says what the gap costs. */
  lines: number[];
  /** `'no-gtfs-match'` — the name is in no feed. `'ambiguous-name'` — it is in too many places. */
  reason: string;
  gtfs_stop_ids?: string[];
  spread_m?: number;
}

/** One entry of {@link StopLocationsFile.stops}. */
export interface StopLocationEntry {
  name?: string;
  lat: number;
  lon: number;
  /**
   * `string`, not `'Bus' | 'Rail'`, so a direct `import … from
   * '../data/stop_locations.json'` is assignable — TypeScript widens a JSON file's
   * string literals, and a union here makes the whole file unassignable. That is not a
   * loss: `attachStopLocations` deliberately does not read this field, and `StopPlace`
   * — the app-side shape, where the decoder controls the value — keeps the union.
   */
  mode?: string;
  gtfs_stop_ids?: string[];
  /**
   * How far apart the GTFS stops sharing this name are, in metres. Large values mean
   * the centroid is not a real place — the pipeline warns above ~200 m.
   */
  spread_m?: number;
}
