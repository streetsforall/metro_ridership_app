/**
 * How a rider figure is spelled, everywhere one is shown.
 *
 * The table and the map popup show the same stop's figures, and a reader flips between
 * them, so they must round the same way. They agreed only by coincidence before this
 * was one function.
 */

/** `1234.5` → `"1,235"`; nothing → `"—"`. */
export const formatRiders = (value: number | undefined): string =>
  value === undefined ? '—' : Math.round(value).toLocaleString();

/** `0.1234` → `"12.3%"`; nothing → `"—"`. */
export const formatShare = (value: number | undefined): string =>
  value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
