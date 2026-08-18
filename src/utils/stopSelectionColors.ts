import colors from 'tailwindcss/colors';

/**
 * The hue each selected stop's series is drawn in, in the order stops were selected.
 *
 * Colour in the stop series chart means **which stop** — not which line, which is what
 * it means everywhere else in the app. The chart had no channel left: hue was spoken
 * for by the line and dash by the Stop Measure, so two stops on line 204 drew as two
 * identical teal lines. See ADR-0014 for the trade-off and for what this deliberately
 * does *not* reach: the map's selection ring stays neutral, so a reader matches a series
 * to its circle by name rather than by colour.
 *
 * Ordered widest-apart-first, because most selections are small and the first three
 * entries are the ones a reader compares most often. The eight are separable at a
 * glance and none of them is a Metro line colour, so a series never reads as a claim
 * about which line it belongs to.
 *
 * Weight `600`, not the gutter's `500`: these are 2px strokes on the panel's near-white
 * rather than filled shapes, and a thin `500` line goes faint against it.
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
 * The Stop Aggregate Series' colour — deliberately **not** a hue from the palette above.
 *
 * Colour in this figure means which stop (ADR-0014), and the aggregate is not a stop. A
 * ninth hue would say it was one; a Metro line colour would say it was a line. Neutral
 * grey is the one thing left that claims neither, and it is the same move the map makes
 * with its selection ring for the same reason.
 *
 * `700`, a step darker than the palette's `600`: the aggregate is the largest figure on
 * the chart and sits above the series it totals, so it has to hold its own against eight
 * saturated hues without becoming a ninth of them.
 */
export const AGGREGATE_COLOR = colors.stone['700'];

/**
 * Colour for the `index`-th selected stop.
 *
 * **The palette cycles.** Selection is deliberately unbounded — `Select All` is scoped
 * by the search rather than capped, exactly as the line selector's is — so a ninth
 * selected stop repeats the first hue. Two stops sharing a colour is the honest cost of
 * that choice, and the legend is what tells them apart; nothing here is the sole signal
 * for which series is which.
 *
 * A negative index would reach past the front of the array, so it is folded back in
 * rather than yielding `undefined` at runtime for a caller the types already forbid.
 * `NaN` and the infinities survive neither `%` nor `Math.trunc`, so they are answered
 * before the arithmetic — this function promises a colour, and a promise that holds only
 * for the inputs the types allow is a promise the next caller gets to break.
 */
export function colorForSelectionIndex(index: number): string {
  if (!Number.isFinite(index)) return SELECTION_HUES[0]['600'];

  const wrapped =
    ((Math.trunc(index) % SELECTION_HUES.length) + SELECTION_HUES.length) %
    SELECTION_HUES.length;
  return SELECTION_HUES[wrapped]['600'];
}
