// Associative array with line name as key
export interface AggregatedRidership {
  [key: string]: AggregatedRecord;
}

export interface AggregatedRecord {
  selected: boolean;
  ridershipRecords: RidershipRecord[];
}

export interface RidershipRecord {
  year: number;
  month: number;
  line_name: string;
  est_wkday_ridership: number | null;
  est_sat_ridership: number | null;
  est_sun_ridership: number | null;
}
