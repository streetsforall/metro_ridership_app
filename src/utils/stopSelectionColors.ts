import colors from 'tailwindcss/colors';

/**
 * The hue each selected stop's series is drawn in, in selection order.
 *
 * Colour here means **which stop**, not which line as it does everywhere else. The chart
 * had no channel left — hue was spoken for by the line, dash by the Stop Measure — so two
 * stops on line 204 drew as two identical teal lines. ADR-0014 carries the trade-off, and
 * what it deliberately does not reach: the map's ring stays neutral.
 *
 * Ordered widest-apart-first, because most selections are small. None of the eight is a
 * Metro line colour, so a series never reads as a claim about which line it belongs to.
 * Weight `600` rather than the gutter's `500`: a thin `500` stroke goes faint against the
 * panel's near-white.
 */
const SELECTION_HUES = [
  colors.blue,
  colors.orange,
  colors.emerald,
  colors.rose,
  colors.violet,
  colors.amber,
  colors.cyan,
  colors.fuchsia,
] as const;

/**
 * Colour for the `index`-th selected stop.
 *
 * **The palette cycles.** Selection is uncapped — `Select All` is scoped by the search
 * rather than capped, as the line selector's is — so a ninth stop repeats the first hue.
 * The legend is what tells two same-coloured series apart; colour is never the sole
 * signal.
 *
 * A negative index would reach past the front of the array, so it is folded back in, and
 * `NaN` and the infinities survive neither `%` nor `Math.trunc`, so they are answered
 * first. This function promises a colour, and a promise that holds only for the inputs
 * the types allow is one the next caller gets to break.
 */
export function colorForSelectionIndex(index: number): string {
  if (!Number.isFinite(index)) return SELECTION_HUES[0]['600'];

  const wrapped =
    ((Math.trunc(index) % SELECTION_HUES.length) + SELECTION_HUES.length) %
    SELECTION_HUES.length;
  return SELECTION_HUES[wrapped]['600'];
}
