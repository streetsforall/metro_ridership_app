export interface Line {
  id: number;
  mode: 'Bus' | 'Rail';
  provider: 'DO' | 'PT';
  selected?: boolean;
}
