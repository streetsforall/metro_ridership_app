import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Build-time transform for the ridership dataset.
 *
 * The canonical data lives in `src/data/ridership.json` as a pretty-printed array
 * of ~42K records with the field name repeated on every row. Importing that file
 * inlines ~6.6 MB of JS object literal into the entry chunk, which is slow to parse
 * and blocks first render.
 *
 * This plugin keeps the canonical file untouched (the Python pipeline and its tests
 * still read/write plain records) and instead ships an optimised wire format:
 *
 *   - `/ridership.json` — a minified columnar blob `{ cols, rows }` that drops the
 *     repeated keys. Served by dev middleware and emitted as a static asset at build
 *     time, so the app fetches it at runtime instead of parsing it as inlined JS.
 *   - `virtual:ridership-bounds` — a tiny module exposing the min/max year and the
 *     latest month, so `dataDateRange` can derive the selectable window without
 *     pulling the whole dataset into the bundle.
 *
 * Registered in both `vite.config.ts` (dev/build) and `vitest.config.ts` (so the
 * virtual module resolves under the test runner).
 */

const SOURCE_URL = new URL('../src/data/ridership.json', import.meta.url);

// Column order for the encoded rows. Must match RidershipRecord in
// src/@types/metrics.types.ts; the decoder (src/utils/ridershipData.ts) looks up
// columns by name, so this order is not load-bearing on the client.
const COLS = [
  'year',
  'month',
  'line_name',
  'est_wkday_ridership',
  'est_sat_ridership',
  'est_sun_ridership',
] as const;

interface RawRecord {
  year: number;
  month: number;
  line_name: number;
  est_wkday_ridership: number | null;
  est_sat_ridership: number | null;
  est_sun_ridership: number | null;
}

interface Bounds {
  minYear: number;
  maxYear: number;
  maxMonth: number;
}

interface Encoded {
  json: string;
  bounds: Bounds;
}

const VIRTUAL_BOUNDS_ID = 'virtual:ridership-bounds';
const RESOLVED_BOUNDS_ID = '\0' + VIRTUAL_BOUNDS_ID;
const DATA_URL = '/ridership.json';

/** Read the canonical records, encode them columnar, and derive the date bounds in one pass. */
function encode(): Encoded {
  const records = JSON.parse(readFileSync(SOURCE_URL, 'utf8')) as RawRecord[];

  const rows: (number | null)[][] = new Array<(number | null)[]>(records.length);
  let minYear = Infinity;
  let maxYear = -Infinity;
  let maxMonth = 1; // 1-based month of the latest record

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    rows[i] = [
      r.year,
      r.month,
      r.line_name,
      r.est_wkday_ridership,
      r.est_sat_ridership,
      r.est_sun_ridership,
    ];
    if (r.year < minYear) minYear = r.year;
    if (r.year > maxYear || (r.year === maxYear && r.month > maxMonth)) {
      maxYear = r.year;
      maxMonth = r.month;
    }
  }

  // JSON.stringify with no spacing minifies; parsing the source already dropped the
  // `.0` float suffixes, so integers serialize compactly.
  const json = JSON.stringify({ cols: COLS, rows });
  return { json, bounds: { minYear, maxYear, maxMonth } };
}

export function ridershipDataPlugin(): Plugin {
  let cache: Encoded | null = null;
  const get = (): Encoded => (cache ??= encode());

  return {
    name: 'ridership-data',

    resolveId(id) {
      if (id === VIRTUAL_BOUNDS_ID) return RESOLVED_BOUNDS_ID;
    },

    load(id) {
      if (id === RESOLVED_BOUNDS_ID) {
        const { minYear, maxYear, maxMonth } = get().bounds;
        return (
          `export const minYear = ${minYear};\n` +
          `export const maxYear = ${maxYear};\n` +
          `export const maxMonth = ${maxMonth};\n`
        );
      }
    },

    // Dev: serve the encoded blob directly. Registered before Vite's internal
    // middlewares so it wins over the SPA history fallback for this exact path.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === DATA_URL) {
          res.setHeader('Content-Type', 'application/json');
          res.end(get().json);
          return;
        }
        next();
      });
    },

    // Build: emit the blob at the output root so it ships as /ridership.json and is
    // served by `vite preview` and any static host.
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'ridership.json', source: get().json });
    },
  };
}
