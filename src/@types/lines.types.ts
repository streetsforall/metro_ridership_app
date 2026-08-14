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
  distanceMiles?: number;
}
