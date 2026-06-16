export const daysOfWeek = {
  Weekday: 'est_wkday_ridership',
  Saturday: 'est_sat_ridership',
  Sunday: 'est_sun_ridership',
} as const;

export type DayOfWeek = (typeof daysOfWeek)[keyof typeof daysOfWeek];

// Associative array with line name as key
export interface ConsolidatedRidership {
  [key: string]: ConsolidatedRecord;
}

export interface ConsolidatedRecord {
  selected: boolean;
  ridershipRecords: RidershipRecord[];
}

export interface RidershipRecord {
  year: number;
  month: number;
  line_name: number;
  est_wkday_ridership: number | null;
  est_sat_ridership: number | null;
  est_sun_ridership: number | null;
}
