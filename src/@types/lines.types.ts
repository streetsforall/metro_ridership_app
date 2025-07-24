export interface LineJson {
  line: number;
  mode: string;
  provider: string;
}

export interface Line {
  id: number;
  name: string;
  former?: string;
  mode: 'Bus' | 'Rail';
  provider: 'DO' | 'PT';
  selected: boolean;
  visible: boolean;
  averageRidership?: number;
  changeInRidership?: number;
  ridershipOverTime?: number;
  startingRidership?: number;
  endingRidership?: number;
  division?: number;
  viewMap?: string;
  isAggregate?: boolean;
  aggregatedLines?: number[];
}
