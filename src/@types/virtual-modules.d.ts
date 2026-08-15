/**
 * Type declarations for the virtual modules provided by the `ridership-data`
 * Vite plugin (see vite/ridership-data-plugin.ts).
 */
declare module 'virtual:ridership-bounds' {
  /** Smallest year present in ridership.json. */
  export const minYear: number;
  /** Largest year present in ridership.json. */
  export const maxYear: number;
  /** 1-based month of the latest record (within maxYear). */
  export const maxMonth: number;
}

/**
 * The Stop Coverage Window, from the `stop-ridership` Vite plugin (see
 * vite/stop-ridership-plugin.ts).
 *
 * Exists so the panel can state which months stop data covers **before** fetching
 * several megabytes to find out. Stop coverage is a short window inside the chart's
 * 2009→ span, so the answer is needed on the empty-state path too, where no payload
 * is ever fetched.
 *
 * Every field reports the empty dataset when `src/data/stop_ridership.*.json` are
 * absent — a fresh clone before the first ingest. `minMonth === null` means there is
 * no stop data at all, which is a state the UI must render, not an error.
 */
declare module 'virtual:stop-ridership-manifest' {
  /** Earliest month covered, `YYYY-MM`. `null` when there is no stop data. */
  export const minMonth: string | null;
  /** Latest month covered, `YYYY-MM`. `null` when there is no stop data. */
  export const maxMonth: string | null;
  /** Distinct months covered across both payloads. `0` when there is no stop data. */
  export const monthCount: number;
  /** Byte length of `/stop-ridership.bus.json`. `0` when absent. */
  export const busBytes: number;
  /** Byte length of `/stop-ridership.rail.json`. `0` when absent. */
  export const railBytes: number;
}
