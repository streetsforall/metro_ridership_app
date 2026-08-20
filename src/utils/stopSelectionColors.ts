import colors from 'tailwindcss/colors';

/**
 * The hue each selected stop's series is drawn in, where colour means which stop rather
 * than which line (ADR-0014).
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
 * Colour for the `index`-th selected stop, cycling because selection is uncapped — any
 * number gets a colour, junk included.
 */
export function colorForSelectionIndex(index: number): string {
  if (!Number.isFinite(index)) return SELECTION_HUES[0]['600'];

  const wrapped =
    ((Math.trunc(index) % SELECTION_HUES.length) + SELECTION_HUES.length) %
    SELECTION_HUES.length;
  return SELECTION_HUES[wrapped]['600'];
}
