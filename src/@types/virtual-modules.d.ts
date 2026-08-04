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
