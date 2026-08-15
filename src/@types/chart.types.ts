import type { ChartType } from 'chart.js';
import type { TransitEvent } from './events.types';

export interface CustomChartData {
  time: string;
  /** `null` where the line has no record for this month — Chart.js draws a gap. */
  stat: number | null;
}

declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    eventGutter?: {
      /**
       * Named `transitEvents`, not `events`, and it must stay that way.
       *
       * Chart.js filters which plugins hear an event with
       * `(plugin.options.events || chart.options.events).includes(type)`, so a
       * plugin whose options carry an `events` key is asking to be notified only
       * for the event *types* in that array. Holding Transit Events there tested
       * `transitEvents.includes('click')`, which is always false: the plugin
       * still drew, because draw hooks are unfiltered, and silently received no
       * pointer events at all.
       */
      transitEvents?: TransitEvent[];
      /** Month index the tooltip is describing, from hover, keyboard, or a pin. */
      focusedIndex?: number | null;
      /** Month index of the context-log row under the cursor. */
      highlightedIndex?: number | null;
      /**
       * A click below the Month Axis rule, resolved to a month. The gutter sits
       * outside `chartArea`, where Chart.js dispatches no click of its own —
       * see ADR-0010.
       */
      onGutterClick?: (monthIndex: number) => void;
      /** The month under the pointer in the gutter, or null on leaving it. */
      onGutterHover?: (monthIndex: number | null) => void;
    };
    hoverCrosshair?: {
      focusedIndex?: number | null;
      isPinned?: boolean;
    };
    rangeSelect?: {
      onSelect?: (startIndex: number, endIndex: number) => void;
    };
  }
}
