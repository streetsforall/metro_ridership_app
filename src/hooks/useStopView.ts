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
 * Fetches the stop payloads only once something actually needs them, so the 5.3 MB bus
 * file never loads for a reader who didn't ask for it.
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
  /** Every loaded record, unfiltered, for the per-stop series to slice. */
  records: StopRecord[] | null;
  /** A payload this view still needs is in flight, which is not the same as empty. */
  isLoading: boolean;
  /** A payload didn't arrive, which is worth retrying where an empty table isn't. */
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
   * One controller per payload, aborted on unmount and kept in a ref so a re-run can't
   * cancel the download the previous one started.
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

  /** `null` until something has landed, which `buildStopView` reads as the empty view. */
  const records: StopRecord[] | null = useMemo(() => {
    if (!rail && !bus) return null;
    return [...(rail?.records ?? []), ...(bus?.records ?? [])];
  }, [rail, bus]);

  /**
   * The empty view whenever the panel is off, or the map would keep drawing circles no
   * control governs.
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
   * Is the 5.3 MB file worth fetching? Rail's cheap answer stands in for bus's, and the
   * window rule stays stated once (ADR-0009).
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
