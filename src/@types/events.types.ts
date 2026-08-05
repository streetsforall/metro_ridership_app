export type EventCategory =
  | 'opening' // new line begins revenue service
  | 'extension' // existing line gains stations/segment
  | 'closure' // line or segment taken out of service
  | 'route_change' // realignment, through-routing, renumbering, discontinuation
  | 'headway_change' // frequency change
  | 'hours_change' // span-of-service change (first/last train, late-night)
  | 'fare_change' // fare policy affecting ridership
  | 'disruption' // unplanned (pandemic, strike, incident)
  | 'service_change'; // generic fallback — kept for back-compat

export interface TransitEvent {
  id: string;
  date: string; // "YYYY-MM"
  line_ids: number[]; // [] = system-wide
  title: string;
  description: string;
  category: EventCategory;
  /**
   * Public URL backing the claim.
   *
   * Optional in the type but **required by src/data/transit-events.test.ts**.
   * The asymmetry is deliberate: the shape stays tolerant so consumers (and
   * fixtures) don't have to invent a URL, while the data guardrail still
   * refuses to let an unsourced event ship.
   */
  source?: string;
  /** Metro pick-period id ("202004") when the change landed on a shakeup. */
  shakeup?: string;
  details?: {
    headway_before_min?: number;
    headway_after_min?: number;
    /** 24h local, "HH:MM" — e.g. span_after_end "01:00" for a late-night extension. */
    span_before_end?: string;
    span_after_end?: string;
    stations_added?: number;
  };
}
