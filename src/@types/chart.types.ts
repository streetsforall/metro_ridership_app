import type { ChartType } from 'chart.js';
import type { TransitEvent } from './events.types';

export interface CustomChartData {
  time: string;
  stat: number;
}

declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    eventMarkers?: {
      events?: TransitEvent[];
    };
  }
}
