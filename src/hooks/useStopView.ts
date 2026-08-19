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
 * the first-paint path and `OutputArea` is lazy precisely to keep MapLibre out of the
 * entry chunk; a 5.3 MB payload on that path would undo it. Only `OutputArea` imports
 * this hook, so every byte it pulls sits in that lazy chunk or behind a dynamic import.
 *
 * ## The intent gate
 *
 * - **Rail** (89 KB) loads when the panel is on — small enough to answer "is there stop
 *   data in this window" by itself.
 * - **Bus** (5.3 MB) loads only when the panel is on, the window overlaps the Stop
 *   Coverage Window, **and** a selected line is not one rail serves.
 * - **Stop locations** (1.6 MB) are `import()`ed, so they land in their own chunk.
 *
 * Each is fetched at most once and kept, so toggling the panel costs nothing the second
 * time. `AbortController`s live for the hook's lifetime and fire on unmount.
 *
 * **Which lines bus serves is read off the data, never hardcoded.** G Line (901) and J
 * Line (910) BRT arrive in the *Bus* workbook while the app lists them under the train
 * filter, so gating on "is this a bus line" would leave a reader who selected only the G
 * Line looking at an empty panel. The question asked instead is whether the rail payload
 * already serves the line, answered from the rail records. A line in neither falls to the
 * bus side and fetches a file that does not help — the safe direction of that error.
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
  /** The one derivation's output. The empty view until the first payload lands. */
  view: StopView;
  /**
   * Every loaded record, unfiltered — `null` until the first payload lands.
   *
   * Returned because the panel's per-stop series needs one stop's months and
   * `StopView` carries readouts rather than the records behind them. The series is
   * still aligned to `view.months`, so no consumer of this has to know what the Month
   * Window is.
   */
  records: StopRecord[] | null;
  /**
   * A payload this view still needs is in flight.
   *
   * Distinct from "the view is empty": a window outside the Stop Coverage Window
   * settles with no readouts and nothing loading, and that is the empty state rather
   * than a spinner that never stops.
   */
  isLoading: boolean;
  /**
   * A payload the panel asked for did not arrive.
   *
   * Surfaced rather than swallowed because a failed fetch and an out-of-window
   * selection both leave the table empty, and only one of them is worth retrying.
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
   * One controller per payload, aborted on unmount.
   *
   * A ref rather than an effect-scoped local because the two effects below are gated
   * on *intent*, not on a dependency changing: re-running an effect must not cancel a
   * download the previous run started, which is what a per-run controller would do
   * every time the selection changed mid-fetch.
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
   * `null` until something has landed, which is the loading state `buildStopView`
   * already understands — it yields the empty view rather than a view asserting that
   * no stop reported anything.
   */
  const records: StopRecord[] | null = useMemo(() => {
    if (!rail && !bus) return null;
    return [...(rail?.records ?? []), ...(bus?.records ?? [])];
  }, [rail, bus]);

  /**
   * The empty view whenever the panel is off, however much is cached.
   *
   * `records` survives the panel being switched off — that is the point of the cache, and
   * switching back on must not re-download 5.3 MB. But a *view* is what gets drawn, and
   * the map draws its circles from `view.markers` whether or not the panel is open. Left
   * ungated, ticking the checkbox on and off again left the circles on the map with no
   * panel beneath them and no control still claiming to govern them.
   *
   * Gated by handing `buildStopView` a `null` records list rather than by constructing a
   * second empty view here, because the module already defines what an absent payload
   * yields and a hand-rolled empty view is a second answer to that question.
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
   * Is the 5.3 MB file worth fetching?
   *
   * `overlapsWindow` is read off the rail-only view rather than compared against the
   * window here — the window rule has exactly one statement and this is not a second
   * one (ADR-0009). Both payloads come out of one pipeline run over the same archives,
   * so rail's answer is the answer for bus too; a window in 2015 therefore costs one
   * 89 KB request and no more.
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
