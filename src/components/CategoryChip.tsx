import type { EventCategory } from '../@types/events.types';
import { categoryChip, formatCategory, type ChipSurface } from '../chart';

export interface CategoryChipProps {
  category: EventCategory | undefined;
  /** The surface the chip is drawn on. The panel is light, the tooltip dark. */
  surface: ChipSurface;
}

/**
 * An event's category, as a tinted chip.
 *
 * One component for every surface that shows a category, so the same event
 * reads as the same event wherever it is met. The chip owns its own shape and
 * colour and takes nothing else; spacing belongs to whatever places it.
 *
 * The category's name is written in the chip rather than left to hue, because
 * nine categories are more than colour alone can carry — red/rose and
 * amber/orange are deliberately close in the shared table — and because the
 * hues run as low as 2.15:1 at the weight the chart fills with. The colours
 * come from that same table, so a chip cannot drift away from the marker for
 * the event it describes.
 */
export default function CategoryChip({ category, surface }: CategoryChipProps) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={categoryChip(category, surface)}
    >
      {formatCategory(category)}
    </span>
  );
}
