import { useEffect, useMemo, useRef, useState } from 'react';
import {
  attachStopLocations,
  buildStopView,
  decodeStopRidership,
  type DecodedStopRidership,
  type StopView,
} from '../stops';
import type { DayOfWeek } from '../@types/metrics.types';
import type {
  ColumnarStopRidership,
  StopLocationsFile,
  StopMeasure,
  StopPlace,
  StopRecord,
} from '../@types/stops.types';

/**
 * Fetching the stop payloads on intent, and handing the one derivation what it needs.
 *
 * The fetches live here rather than in `App` because `App`'s `/ridership.json` effect is
 * the first-paint path, and a 5.3 MB payload there would undo the lazy `OutputArea`. Only
 * `OutputArea` imports this hook, so every byte sits in that chunk or behind an `import()`.
 *
 * The gate: rail (89 KB) loads when the panel is on, small enough to answer "is there stop
 * data in this window" alone. Bus (5.3 MB) loads only when the panel is on, the window
 * overlaps coverage, and a selected line is not one rail serves. Stop locations (1.6 MB)
 * are `import()`ed into their own chunk. Each is fetched at most once and kept, and the
 * `AbortController`s live for the hook's lifetime.
 *
 * Which lines bus serves is read off the data, never hardcoded. The G (901) and J (910)
 * BRT lines arrive in the Bus workbook while the app lists them under the train filter, so
 * gating on "is this a bus line" would leave a G-Line-only reader with an empty panel. A
 * line in neither payload falls to the bus side — the safe direction of that error.
 */

const RAIL_URL = '/stop-ridership.rail.json';
const BUS_URL = '/stop-ridership.bus.json';

/** Nothing requested yet · in flight · here · gave up. */
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseStopViewInput {
  /** The stop panel is on. Nothing is fetched until it is. */
  enabled: boolean;
  /** Selected line ids, in the order readouts and markers should follow. */
  lineIds: readonly number[];
  startDate: Date;
  endDate: Date;
  dayOfWeek: DayOfWeek;
  measure: StopMeasure;
}

export interface UseStopViewResult {
  /** The derivation's output. The empty view until the first payload lands. */
  view: StopView;
  /**
   * Every loaded record, unfiltered; `null` until the first payload lands. Returned
   * because the per-stop series needs one stop's months and `StopView` carries readouts
   * rather than records. The series is still aligned to `view.months`, so no consumer of
   * this has to know what the month window is.
   */
  records: StopRecord[] | null;
  /**
   * A payload this view still needs is in flight. Distinct from "the view is empty": a
   * window outside coverage settles with no readouts and nothing loading, which is the
   * empty state rather than a spinner that never stops.
   */
  isLoading: boolean;
  /**
   * A payload the panel asked for did not arrive. Surfaced rather than swallowed, because
   * a failed fetch and an out-of-window selection both leave the table empty and only one
   * of them is worth retrying.
   */
  hasFailed: boolean;
}

/** Fetch, decode, and hand back — or `null` if the request was aborted or failed. */
async function loadPayload(
  url: string,
  signal: AbortSignal,
): Promise<DecodedStopRidership | null> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`${url} responded ${String(response.status)}`);
  return decodeStopRidership((await response.json()) as ColumnarStopRidership);
}

/** Still outstanding — neither loaded nor given up on. */
const isPending = (status: LoadStatus): boolean =>
  status !== 'ready' && status !== 'error';

export default function useStopView({
  enabled,
  lineIds,
  startDate,
  endDate,
  dayOfWeek,
  measure,
}: UseStopViewInput): UseStopViewResult {
  const [rail, setRail] = useState<DecodedStopRidership | null>(null);
  const [bus, setBus] = useState<DecodedStopRidership | null>(null);
  const [locations, setLocations] = useState<StopLocationsFile | null>(null);
  const [railStatus, setRailStatus] = useState<LoadStatus>('idle');
  const [busStatus, setBusStatus] = useState<LoadStatus>('idle');

  /**
   * One controller per payload, aborted on unmount. A ref rather than an effect-scoped
   * local because the effects below are gated on intent rather than on a dependency
   * changing, so a re-run must not cancel the download the previous run started.
   */
  const controllers = useRef<AbortController[]>([]);
  useEffect(
    () => () => {
      for (const controller of controllers.current) controller.abort();
    },
    [],
  );

  // Rail, plus the geometry both payloads join against. Panel on is the whole gate.
  useEffect(() => {
    if (!enabled || railStatus !== 'idle') return;
    setRailStatus('loading');

    const controller = new AbortController();
    controllers.current.push(controller);

    void (async () => {
      try {
        const [decoded, locationsModule] = await Promise.all([
          loadPayload(RAIL_URL, controller.signal),
          import('../data/stop_locations.json'),
        ]);
        setLocations(locationsModule.default as StopLocationsFile);
        setRail(decoded);
        setRailStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Failed to load rail stop ridership', error);
        setRailStatus('error');
      }
    })();
  }, [enabled, railStatus]);

  const railLineIds = useMemo(
    () => new Set((rail?.records ?? []).map((record) => record.line_name)),
    [rail],
  );

  const places: StopPlace[] = useMemo(
    () =>
      attachStopLocations(
        [...(rail?.places ?? []), ...(bus?.places ?? [])],
        locations,
      ),
    [rail, bus, locations],
  );

  /**
   * `null` until something has landed, which is the loading state `buildStopView` already
   * understands: it yields the empty view rather than one asserting nobody reported.
   */
  const records: StopRecord[] | null = useMemo(() => {
    if (!rail && !bus) return null;
    return [...(rail?.records ?? []), ...(bus?.records ?? [])];
  }, [rail, bus]);

  /**
   * The empty view whenever the panel is off, however much is cached. `records` survives
   * the panel closing — that is the cache's point — but the map draws circles from
   * `view.markers` whether the panel is open or not, so ungated, switching the panel off
   * left circles on the map with no control governing them.
   *
   * Gated by handing `buildStopView` a `null` records list rather than building an empty
   * view here, because the module already defines what an absent payload yields.
   */
  const view = useMemo(
    () =>
      buildStopView({
        records: enabled ? records : null,
        places,
        lineIds,
        startDate,
        endDate,
        dayOfWeek,
        measure,
      }),
    [enabled, records, places, lineIds, startDate, endDate, dayOfWeek, measure],
  );

  /**
   * Is the 5.3 MB file worth fetching? `overlapsWindow` is read off the rail-only view
   * rather than compared against the window here, because the window rule has exactly one
   * statement (ADR-0009). Both payloads come from one pipeline run over the same archives,
   * so rail's answer holds for bus: a window in 2015 costs one 89 KB request.
   */
  const wantsBus =
    enabled &&
    railStatus === 'ready' &&
    view.coverage.overlapsWindow &&
    lineIds.some((id) => !railLineIds.has(id));

  useEffect(() => {
    if (!wantsBus || busStatus !== 'idle') return;
    setBusStatus('loading');

    const controller = new AbortController();
    controllers.current.push(controller);

    void (async () => {
      try {
        setBus(await loadPayload(BUS_URL, controller.signal));
        setBusStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Failed to load bus stop ridership', error);
        setBusStatus('error');
      }
    })();
  }, [wantsBus, busStatus]);

  const isLoading =
    enabled && (isPending(railStatus) || (wantsBus && isPending(busStatus)));

  return {
    view,
    records,
    isLoading,
    hasFailed: railStatus === 'error' || busStatus === 'error',
  };
}
