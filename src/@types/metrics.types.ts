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
  line_name: string;
  est_wkday_ridership: number | null;
  est_sat_ridership: number | null;
  est_sun_ridership: number | null;
}
