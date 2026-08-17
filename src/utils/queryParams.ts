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

/**
 * `measure=offs` → `'offs'`. Anything else, including absent, → `null`.
 *
 * The literals are the URL's values and the app's values at once (see `StopMeasure`),
 * so there is no translation table here the way `paramToDayOfWeek` needs one — only a
 * membership check, which is what stops a hand-edited `?measure=nonsense` from reaching
 * the derivation as a fourth measure.
 */
export function parseStopMeasureParam(
  value: string | null,
): StopMeasure | null {
  return STOP_MEASURES.includes(value as StopMeasure)
    ? (value as StopMeasure)
    : null;
}

/**
 * The shape the pipeline mints stop keys in — `^(bus|rail):[a-z0-9-]+$`.
 *
 * Slugs by construction, which is what lets `stop=<key>` go into the query string
 * unencoded. Validating the shape rather than trusting it keeps a hand-edited param
 * from selecting a "stop" that is really a fragment of markup.
 */
const STOP_KEY_PATTERN = /^(bus|rail):[a-z0-9-]+$/;

/** `stop=rail:union-station` → the key. A malformed or absent value → `null`. */
export function parseStopKeyParam(value: string | null): string | null {
  return value !== null && STOP_KEY_PATTERN.test(value) ? value : null;
}

/**
 * `stop=rail:union-station,bus:vermont-wilshire` → both keys, in the order written.
 *
 * The same param holds one key or many, so a link shared before the panel could select
 * more than one stop still selects the stop it named. Splitting on a comma is
 * unambiguous because a comma cannot occur inside a key — `STOP_KEY_PATTERN`'s charset
 * has no room for one — which is the same property that lets `lines=801,802` work.
 *
 * A malformed part is dropped rather than failing the whole param: a hand-edited URL
 * that names three stops and one fragment of markup should still show the three stops.
 * Duplicates collapse, so a key repeated in the URL draws one series, not two.
 */
export function parseStopKeysParam(value: string | null): string[] {
  if (value === null) return [];

  const keys = value
    .split(',')
    .map((part) => parseStopKeyParam(part))
    .filter((key): key is string => key !== null);

  return [...new Set(keys)];
}
