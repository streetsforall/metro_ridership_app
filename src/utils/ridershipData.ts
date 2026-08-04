import type { RidershipRecord } from '../@types/metrics.types';

/**
 * Wire format for the ridership dataset produced by the build-time
 * `ridership-data` Vite plugin (see vite/ridership-data-plugin.ts).
 *
 * Instead of an array of `{ year, month, line_name, ... }` objects (which repeats
 * every key ~42K times), the data ships columnar: a `cols` header naming each
 * field once, and `rows` of positional tuples. The app fetches this from
 * `/ridership.json` at runtime and decodes it back into records here.
 */
export interface ColumnarRidership {
  cols: string[];
  rows: (number | null)[][];
}

/**
 * Decode the columnar wire format into RidershipRecord[] in a single pass.
 *
 * Columns are resolved by name from the `cols` header, so the decoder is
 * insensitive to column ordering.
 */
export function decodeRidership(data: ColumnarRidership): RidershipRecord[] {
  const { cols, rows } = data;

  const yi = cols.indexOf('year');
  const mi = cols.indexOf('month');
  const li = cols.indexOf('line_name');
  const wi = cols.indexOf('est_wkday_ridership');
  const si = cols.indexOf('est_sat_ridership');
  const ui = cols.indexOf('est_sun_ridership');

  const records: RidershipRecord[] = new Array<RidershipRecord>(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    records[i] = {
      year: row[yi] as number,
      month: row[mi] as number,
      line_name: row[li] as number,
      est_wkday_ridership: row[wi],
      est_sat_ridership: row[si],
      est_sun_ridership: row[ui],
    };
  }
  return records;
}
