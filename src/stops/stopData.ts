import type {
  ColumnarStopRidership,
  StopLocationsFile,
  StopPlace,
  StopRecord,
} from '../@types/stops.types';

/**
 * Decoding the stop payloads: the columnar ridership blob and the GTFS location join.
 *
 * This is the counterpart of `src/utils/ridershipData.ts` for stop grain, and it
 * follows the same rule — **columns are resolved by name from the `cols` header,
 * never by position.** The pipeline is free to reorder or extend `cols`; a positional
 * decoder would silently read alightings as boardings the first time it did.
 */

/** The wire-format version this decoder understands. */
export const STOP_WIRE_SCHEMA = 1;

/**
 * Wire column names, and the `StopRecord` field each becomes.
 *
 * The wire uses the export's own abbreviations (`wd`/`sa`/`su`, frozen upstream by
 * `aggregate_to_stop_ridership`); the app uses its existing day-of-week vocabulary
 * (`wkday`/`sat`/`sun`, as in `daysOfWeek`). Naming the mapping once here is what
 * keeps that difference from becoming a per-call-site guess.
 */
const VALUE_COLUMNS = {
  wd_ons: 'wkday_ons',
  wd_offs: 'wkday_offs',
  sa_ons: 'sat_ons',
  sa_offs: 'sat_offs',
  su_ons: 'sun_ons',
  su_offs: 'sun_offs',
} as const satisfies Record<string, keyof StopRecord>;

/**
 * Index of `name` in `cols`, or a thrown error naming what was missing.
 *
 * Loud rather than lenient. A missing column decoded as `undefined` would put a
 * column of `NaN`s on the map; a build that stops and says which column the pipeline
 * failed to write is the cheaper failure by a wide margin.
 */
function columnIndex(cols: readonly string[], name: string): number {
  const index = cols.indexOf(name);
  if (index === -1)
    throw new Error(
      `stop ridership payload is missing the "${name}" column (has: ${cols.join(', ')})`,
    );
  return index;
}

/**
 * A stop key's mode, read off its prefix.
 *
 * Total by design: an unrecognised prefix falls back to `'Bus'` rather than throwing,
 * because mode here only chooses which magnitude domain the marker radius normalises
 * against — getting it wrong makes a circle the wrong size, and throwing would take
 * the whole panel down over one malformed key.
 */
export function modeFromStopKey(key: string): 'Bus' | 'Rail' {
  return key.startsWith('rail:') ? 'Rail' : 'Bus';
}

export interface DecodedStopRidership {
  records: StopRecord[];
  /**
   * Every Stop Place the payload names, in dictionary order.
   *
   * Geometry-free: `lat` and `lon` are `null` until {@link attachStopLocations} runs.
   * The payload is the authority on which stops **exist**; `stop_locations.json` is
   * the authority on where they are, and it does not have an entry for every one.
   */
  places: StopPlace[];
}

/**
 * Decode one `stop_ridership.{bus,rail}.json` payload.
 *
 * Rejects an unknown `schema` outright. The alternative — decode what we recognise
 * and hope — is how a payload whose meaning changed ends up rendered as if it hadn't.
 */
export function decodeStopRidership(
  data: ColumnarStopRidership,
): DecodedStopRidership {
  if (data.schema !== STOP_WIRE_SCHEMA)
    throw new Error(
      `stop ridership payload has schema ${String(data.schema)}, expected ${STOP_WIRE_SCHEMA}`,
    );

  const { cols, rows, stops } = data;

  const yearIndex = columnIndex(cols, 'year');
  const monthIndex = columnIndex(cols, 'month');
  const lineIndex = columnIndex(cols, 'line');
  const stopIndex = columnIndex(cols, 'stop');
  const valueIndices = Object.entries(VALUE_COLUMNS).map(
    ([wire, field]) => [columnIndex(cols, wire), field] as const,
  );

  const places: StopPlace[] = stops.map((entry) => ({
    key: entry.key,
    name: entry.name,
    lat: null,
    lon: null,
    mode: modeFromStopKey(entry.key),
    stationOrder: entry.station_order ?? null,
  }));

  const records: StopRecord[] = new Array<StopRecord>(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // A short row would read `undefined` into a `number | null` slot, which
    // `stopMetrics` then absorbs as `?? 0` — a column of silent zeroes on the map. Same
    // reasoning as `columnIndex`: loud rather than lenient.
    if (row.length !== cols.length)
      throw new Error(
        `stop ridership row ${i} has ${row.length} values, expected ${cols.length}`,
      );

    const stop = stops[row[stopIndex] as number];
    if (!stop)
      throw new Error(
        `stop ridership row ${i} references stop index ${String(row[stopIndex])}, which is not in the dictionary`,
      );

    const record: StopRecord = {
      year: row[yearIndex] as number,
      month: row[monthIndex] as number,
      stop_key: stop.key,
      line_name: row[lineIndex] as number,
      wkday_ons: null,
      wkday_offs: null,
      sat_ons: null,
      sat_offs: null,
      sun_ons: null,
      sun_offs: null,
    };
    for (const [index, field] of valueIndices) record[field] = row[index];
    records[i] = record;
  }

  return { records, places };
}

/**
 * Join the geometry-free Stop Places from the payload onto their coordinates.
 *
 * **This is the join, and it happens here once.** Four consumers — the map layer, the
 * ranked table, the per-stop series and the popup — must agree about which stops
 * exist and where they are; if each did its own lookup the map and the table would
 * eventually disagree, which is the reason `src/stops/` is a sealed module at all.
 *
 * A place with no entry in `stop_locations.json` keeps `lat`/`lon` of `null` rather
 * than being dropped: it still has ridership and still belongs in the table. Only the
 * map layer filters on geometry.
 *
 * An entry in `stop_locations.json` with no ridership is ignored — the payload is the
 * authority on which stops exist.
 */
export function attachStopLocations(
  places: readonly StopPlace[],
  locations: StopLocationsFile | null | undefined,
): StopPlace[] {
  const byKey = locations?.stops;
  if (!byKey) return places.map((place) => ({ ...place }));

  return places.map((place) => {
    const located = byKey[place.key];
    if (!located) return { ...place };
    // Coordinates only. `StopLocationEntry.mode` is deliberately **not** read: `mode`
    // means "which export the row arrived in", the key prefix is that answer by
    // construction, and the location file derives its own from GTFS. Letting it win
    // would flip G Line and J Line BRT stops — which arrive in the *Bus* workbook — to
    // `Rail`, and `buildStopView` would then normalise their radius against the rail
    // domain, two orders of magnitude away from their actual magnitudes. That is the
    // one thing this field exists to prevent.
    return { ...place, lat: located.lat, lon: located.lon };
  });
}
