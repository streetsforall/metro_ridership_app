import colors from 'tailwindcss/colors';

/**
 * The hue each selected stop's series is drawn in, in selection order. Colour means which
 * stop here, not which line: the chart had no channel left — hue was the line's, dash the
 * measure's — so two stops on line 204 drew as identical teal lines (ADR-0014).
 *
 * Ordered widest-apart-first, since most selections are small. None of the eight is a
 * Metro line colour, so a series never reads as a claim about its line. Weight `600`
 * rather than `500`, which goes faint against the panel's near-white.
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
 * Colour for the `index`-th selected stop. The palette cycles, because selection is
 * uncapped, so a ninth stop repeats the first hue and the legend is what tells two
 * same-coloured series apart.
 *
 * A negative index is folded back in, and `NaN` and the infinities are answered first
 * since they survive neither `%` nor `Math.trunc` — this function promises a colour for
 * any number, not only the ones a caller ought to pass.
 */
export function colorForSelectionIndex(index: number): string {
  if (!Number.isFinite(index)) return SELECTION_HUES[0]['600'];

  const wrapped =
    ((Math.trunc(index) % SELECTION_HUES.length) + SELECTION_HUES.length) %
    SELECTION_HUES.length;
  return SELECTION_HUES[wrapped]['600'];
}
