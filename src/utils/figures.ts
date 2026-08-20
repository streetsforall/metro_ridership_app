/** How a rider figure is spelled, so the table and the map popup round the same way. */

/** `1234.5` → `"1,235"`; nothing → `"—"`. */
export const formatRiders = (value: number | undefined): string =>
  value === undefined ? '—' : Math.round(value).toLocaleString();

/** `0.1234` → `"12.3%"`; nothing → `"—"`. */
export const formatShare = (value: number | undefined): string =>
  value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
