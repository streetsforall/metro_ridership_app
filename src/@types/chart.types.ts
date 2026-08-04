export interface CustomChartData {
  time: string;
  /** `null` where the line has no record for this month — Chart.js draws a gap. */
  stat: number | null;
}
