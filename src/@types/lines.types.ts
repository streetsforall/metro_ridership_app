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
  startingRidership?: number;
  endingRidership?: number;
  distanceMiles?: number;
  ridersPerMile?: number;
  /**
   * The span this line's own records cover inside the selected window, as `YYYY-MM`.
   * The summary metrics are estimated from these endpoints rather than from the
   * window's, so the table shows the range each row's figures actually describe.
   */
  coveredFrom?: string;
  coveredTo?: string;
  /** True when this line covers less of the window than the window's full span. */
  isPartialCoverage?: boolean;
}
