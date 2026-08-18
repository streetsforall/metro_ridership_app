/**
 * How a signed change is drawn: the number with its sign, and the class that colours it.
 *
 * Three places in this dashboard show a change and all three drew it their own way — the
 * line table's Change cell, the summary's Ending Ridership figure, and now the stop
 * table's Change column. The rule they share is small enough to have been retyped twice
 * already: a gain leads with `+` and is green, a loss carries its own `-` and is red.
 * Stated once here, the three cannot drift.
 *
 * **What is deliberately not here is what "absent" means**, because the three do not
 * agree on it and should not. The line table treats a zero change as nothing to report
 * and draws an em dash; the stop table's Change is Boardings less Alightings within a
 * Month, so a zero there is a stop where exactly as many riders got on as off — a
 * balanced stop, which is information rather than a missing figure. Folding both into
 * one function would mean picking a winner, and the loser would be a lie about the data.
 * So callers answer "is there a figure?" and this answers "how is it drawn?".
 *
 * Rounding is the caller's too. `changeInRidership` is a difference between two reported
 * figures and is shown as it stands; a stop's `netAverage` is an average and is rounded
 * like every other figure in that table.
 */
export interface SignedChange {
  /** The figure with its sign — `+1,000`, `-200`, `0`. */
  text: string;
  /**
   * A Tailwind text colour, or the empty string for zero. Zero is neither a gain nor a
   * loss, and painting it either colour would claim a direction the number does not have.
   */
  className: string;
}

export function signedChange(value: number): SignedChange {
  if (value < 0)
    return { text: value.toLocaleString(), className: 'text-red-600' };
  if (value > 0)
    return { text: `+${value.toLocaleString()}`, className: 'text-green-600' };
  /*
   * Zero, and anything that is neither greater nor less than it — `NaN`, which keeps its
   * own name rather than being drawn as a figure. `-0` is the case that matters: rounding
   * a stop's small negative average yields it, and `(-0).toLocaleString()` is `'-0'`,
   * which reads as a loss the number does not have.
   */
  return { text: value === 0 ? '0' : value.toLocaleString(), className: '' };
}
