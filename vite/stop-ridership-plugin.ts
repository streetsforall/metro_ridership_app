import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Build-time serving for the stop-level ridership dataset.
 *
 * ## Why this is a second plugin and not a branch inside the first
 *
 * `vite/ridership-data-plugin.ts`'s whole job is **re-encoding**: it reads
 * ~42K pretty-printed records and rewrites them columnar in one cached `encode()`
 * pass, and `virtual:ridership-bounds` falls out of that same pass. The stop files
 * arrive from Python **already columnar** — `ridership.json`'s pretty-record
 * convention at stop grain would be ~25 MB rewritten in full every monthly update,
 * which is a repo-growth problem rather than a style preference (`docs/ROADMAP.md`,
 * "Decisions that are settled") — so they need serving and a manifest, nothing more.
 *
 * Folding them together would put a multi-megabyte read behind the cache that
 * `virtual:ridership-bounds` sits behind — and that virtual module is reached by every
 * test in the suite, through `src/utils/dataDateRange.ts`. Two plugins keep the
 * expensive read on the path that actually needs it.
 *
 * ## Absent data files are a supported state
 *
 * `src/data/stop_ridership.{bus,rail}.json` are pipeline output, not sources. A fresh
 * clone before the first ingest does not have them, and neither does a branch that
 * lands the client ahead of the data. The plugin therefore **serves nothing and
 * reports zero coverage** when a file is missing, rather than failing the build. A
 * *malformed* file still throws: absent is a state, corrupt is a bug.
 *
 * ## Hooks
 *
 * - `configureServer` — dev middleware serving `/stop-ridership.{bus,rail}.json`
 * - `generateBundle` — `emitFile` for the same two paths, so `vite preview` and any
 *   static host serve them
 * - `virtual:stop-ridership-manifest` — `{ minMonth, maxMonth, monthCount, busBytes,
 *   railBytes }`, so the panel can state the covered window **before** fetching
 *   several megabytes to find it out
 *
 * Registered in both `vite.config.ts` (dev/build) and `vitest.config.ts` (so the
 * virtual module resolves under the test runner), same as the ridership plugin.
 * Declared in `src/@types/virtual-modules.d.ts`.
 */

const VIRTUAL_MANIFEST_ID = 'virtual:stop-ridership-manifest';
const RESOLVED_MANIFEST_ID = '\0' + VIRTUAL_MANIFEST_ID;

/**
 * Where the payloads live, as a plain path.
 *
 * Resolved through `fileURLToPath` rather than `new URL(..., import.meta.url)`
 * deliberately: this module is imported by its own Vitest spec, so it goes through
 * Vite's transform pipeline, and that pipeline rewrites the `new URL(…,
 * import.meta.url)` form into asset handling. A path string is inert.
 */
const DEFAULT_DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);

/** Source file name → the path it is served at. Keys are also the manifest's byte-count keys. */
const PAYLOADS = {
  bus: {
    source: 'stop_ridership.bus.json',
    fileName: 'stop-ridership.bus.json',
  },
  rail: {
    source: 'stop_ridership.rail.json',
    fileName: 'stop-ridership.rail.json',
  },
} as const;

type PayloadMode = keyof typeof PAYLOADS;

const MODES = Object.keys(PAYLOADS) as PayloadMode[];

/** Only the two columns the manifest needs; the rest of the payload is passed through untouched. */
interface PayloadShape {
  cols?: unknown;
  rows?: unknown;
}

interface Payload {
  /** The file's bytes, verbatim. Never re-encoded — the pipeline already minified it. */
  json: string;
  /** Every `YYYY-MM` the payload reports. */
  months: Set<string>;
}

export interface StopManifest {
  /** Earliest month across both payloads, `YYYY-MM`. `null` when there is no data. */
  minMonth: string | null;
  /** Latest month across both payloads, `YYYY-MM`. `null` when there is no data. */
  maxMonth: string | null;
  /** Distinct months across both payloads. `0` when there is no data. */
  monthCount: number;
  /** Byte length of the served bus payload. `0` when absent. */
  busBytes: number;
  /** Byte length of the served rail payload. `0` when absent. */
  railBytes: number;
}

/**
 * Read one payload, or `null` if the file is not there.
 *
 * Rethrows anything that is not "no such file": an unreadable or malformed data file
 * is a real problem and should stop the build, where a missing one is the documented
 * pre-ingest state.
 */
function readPayload(dataDir: string, source: string): Payload | null {
  let json: string;
  try {
    json = readFileSync(join(dataDir, source), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const parsed = JSON.parse(json) as PayloadShape;
  if (!Array.isArray(parsed.cols) || !Array.isArray(parsed.rows))
    throw new Error(
      `${source} is not a columnar stop payload: expected \`cols\` and \`rows\` arrays`,
    );

  const cols = parsed.cols as string[];
  const rows = parsed.rows as unknown[][];
  const yearIndex = cols.indexOf('year');
  const monthIndex = cols.indexOf('month');
  if (yearIndex === -1 || monthIndex === -1)
    throw new Error(
      `${source} is missing a \`year\` or \`month\` column (has: ${cols.join(', ')})`,
    );

  // Columns by name, never by position — the same rule the client decoder follows.
  const months = new Set<string>();
  for (const row of rows)
    months.add(
      `${String(row[yearIndex])}-${String(row[monthIndex]).padStart(2, '0')}`,
    );

  return { json, months };
}

export interface StopRidershipPluginOptions {
  /**
   * Directory holding the two payloads. Defaults to `src/data/`.
   *
   * Overridden by the plugin's own spec so it runs against a small committed fixture
   * — a test must never depend on the real multi-megabyte payload, and this is also
   * how the absent-file behaviour is exercised without deleting anything.
   */
  dataDir?: string;
}

export function stopRidershipPlugin(
  options: StopRidershipPluginOptions = {},
): Plugin {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;

  const cache = new Map<PayloadMode, Payload | null>();
  const get = (mode: PayloadMode): Payload | null => {
    if (!cache.has(mode))
      cache.set(mode, readPayload(dataDir, PAYLOADS[mode].source));
    return cache.get(mode) ?? null;
  };

  const manifest = (): StopManifest => {
    const months = new Set<string>();
    for (const mode of MODES)
      for (const month of get(mode)?.months ?? []) months.add(month);

    const sorted = [...months].sort();
    return {
      minMonth: sorted[0] ?? null,
      maxMonth: sorted[sorted.length - 1] ?? null,
      monthCount: sorted.length,
      busBytes: Buffer.byteLength(get('bus')?.json ?? '', 'utf8'),
      railBytes: Buffer.byteLength(get('rail')?.json ?? '', 'utf8'),
    };
  };

  return {
    name: 'stop-ridership',

    resolveId(id) {
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_MANIFEST_ID;
    },

    load(id) {
      if (id === RESOLVED_MANIFEST_ID) {
        const { minMonth, maxMonth, monthCount, busBytes, railBytes } =
          manifest();
        return (
          `export const minMonth = ${JSON.stringify(minMonth)};\n` +
          `export const maxMonth = ${JSON.stringify(maxMonth)};\n` +
          `export const monthCount = ${monthCount};\n` +
          `export const busBytes = ${busBytes};\n` +
          `export const railBytes = ${railBytes};\n`
        );
      }
    },

    // Dev: serve the payloads as-is. Registered before Vite's internal middlewares so
    // these two paths win over the SPA history fallback. A payload that is not there
    // falls through to `next()` and 404s, which is what the panel's loading code has
    // to survive anyway.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        for (const mode of MODES) {
          if (path !== `/${PAYLOADS[mode].fileName}`) continue;
          const payload = get(mode);
          if (!payload) break;
          res.setHeader('Content-Type', 'application/json');
          res.end(payload.json);
          return;
        }
        next();
      });
    },

    // Build: emit at the output root so the payloads ship as static assets rather than
    // being inlined into a JS chunk. `ANALYZE=1 npm run build` gates on exactly this —
    // a stop payload inside `dist/assets/*.js` would undo `OutputArea`'s lazy-load.
    generateBundle() {
      for (const mode of MODES) {
        const payload = get(mode);
        if (!payload) continue;
        this.emitFile({
          type: 'asset',
          fileName: PAYLOADS[mode].fileName,
          source: payload.json,
        });
      }
    },
  };
}
