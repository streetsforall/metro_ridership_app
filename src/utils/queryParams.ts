import type { StopMeasure } from '../@types/stops.types';

export function parseMonthParam(value: string): Date | null {
  const [yearStr, monthStr] = value.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1);
}

export function formatMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const dayOfWeekToParam: Record<string, string> = {
  est_wkday_ridership: 'wkday',
  est_sat_ridership: 'sat',
  est_sun_ridership: 'sun',
};

export const paramToDayOfWeek: Record<string, string> = {
  wkday: 'est_wkday_ridership',
  sat: 'est_sat_ridership',
  sun: 'est_sun_ridership',
};

export function parseModesFromParams(params: URLSearchParams): string[] {
  const modes: string[] = [];
  if (params.get('buses') !== '0') modes.push('bus');
  if (params.get('trains') !== '0') modes.push('train');
  return modes;
}

/** The three values the `measure` param accepts, in the order the toggle lists them. */
const STOP_MEASURES: readonly StopMeasure[] = ['ons', 'offs', 'both'];

/** `measure=offs` → `'offs'`, and anything else — absent or nonsense — → `null`. */
export function parseStopMeasureParam(
  value: string | null,
): StopMeasure | null {
  return STOP_MEASURES.includes(value as StopMeasure)
    ? (value as StopMeasure)
    : null;
}

/**
 * The slug shape the pipeline mints stop keys in, checked so a hand-edited param can't
 * smuggle in junk.
 */
const STOP_KEY_PATTERN = /^(bus|rail):[a-z0-9-]+$/;

/** `stop=rail:union-station` → the key, or `null` if it's malformed or absent. */
export function parseStopKeyParam(value: string | null): string | null {
  return value !== null && STOP_KEY_PATTERN.test(value) ? value : null;
}

/** `stop=a,b` → both keys in the order written, minus malformed parts and duplicates. */
export function parseStopKeysParam(value: string | null): string[] {
  if (value === null) return [];

  const keys = value
    .split(',')
    .map((part) => parseStopKeyParam(part))
    .filter((key): key is string => key !== null);

  return [...new Set(keys)];
}
