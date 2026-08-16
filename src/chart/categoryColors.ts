import colors from 'tailwindcss/colors';
import type { EventCategory } from '../@types/events.types';

/**
 * Tailwind hue each context-log category is drawn in, so the taxonomy is legible
 * on the chart instead of one undifferentiated amber.
 *
 * One hue per category, not one per group: the data exercises all nine, so a
 * grouped palette would still render an opening and an extension — or all four
 * of the `*_change` variants — as the same mark. The hues are still *chosen* in
 * families, so the coarse reading survives a glance:
 *
 *   emerald / teal    more service (opening, extension)
 *   red / rose        less service (closure, disruption)
 *   amber / orange    runs differently (headway, hours)
 *   violet            a different shape, not a different amount (route)
 *   sky               costs something different (fare)
 *   slate             generic, uncategorised (service_change)
 *
 * Only the hue is stored; callers pick the weight, which keeps the gutter's
 * shapes (500) and the Category Chip's fill and text in the same family without
 * a second nine-entry table to keep in sync. The 500s run 2.15–4.76:1 on the
 * panel's white, which is why the panel tints a rule rather than text, and why
 * the chip picks its own weights per surface — see `categoryChip`.
 */
type CategoryHue =
  | 'emerald'
  | 'teal'
  | 'red'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'violet'
  | 'sky'
  | 'slate';

const CATEGORY_COLOR: Record<EventCategory, CategoryHue> = {
  opening: 'emerald',
  extension: 'teal',
  closure: 'red',
  disruption: 'rose',
  headway_change: 'amber',
  hours_change: 'orange',
  route_change: 'violet',
  fare_change: 'sky',
  service_change: 'slate',
};

/**
 * Category of last resort. Also what an unrecognised category falls back to —
 * deliberately the same hue as `service_change`, since that category *is* the
 * schema's generic fallback. An unknown string and an explicit `service_change`
 * mean the same thing to a reader: something changed, nobody said what.
 */
const DEFAULT_CATEGORY_HUE: CategoryHue = 'slate';

/**
 * Total lookup over `CATEGORY_COLOR`. The events are fetched data, so a category
 * the union doesn't cover can reach here at runtime regardless of the types —
 * those still render, in slate, rather than throwing or drawing nothing.
 */
function categoryHue(category: EventCategory | undefined): CategoryHue {
  return CATEGORY_COLOR[category as EventCategory] ?? DEFAULT_CATEGORY_HUE;
}

/** Gutter/border color for an event's category. */
export function categoryColor(category: EventCategory | undefined): string {
  return colors[categoryHue(category)]['500'];
}

/**
 * The surface a chip is drawn on. The panel is light and the tooltip is dark,
 * and one pair of values cannot serve both: a `100` fill that reads as a soft
 * tint on white is a glare on stone-800.
 */
export type ChipSurface = 'light' | 'dark';

/**
 * The two weights each surface takes, mirrored across the ramp so there is one
 * rule rather than two tables: fill from the end nearest the surface, write in
 * the weight opposite it.
 */
const CHIP_WEIGHTS: Record<
  ChipSurface,
  { backgroundColor: '100' | '900'; color: '200' | '800' }
> = {
  light: { backgroundColor: '100', color: '800' },
  dark: { backgroundColor: '900', color: '200' },
};

/**
 * Chip fill and text for a category on a given surface.
 *
 * One lookup rather than four exports, because the four values are one
 * decision. Tailwind class names can't be built at runtime — the JIT scanner
 * only sees literals — so these resolve to hex and go on as inline styles, the
 * same way the row's rule colour does.
 *
 * Not the gutter's `500`: the chip is the one place the palette carries *text*,
 * so it is the one place contrast is load-bearing rather than decorative, and
 * the `500` the chart fills with would be unreadable behind text at 2.15–4.76:1
 * on the panel's white. Both chip pairs clear AA on every hue:
 *
 *   light — `800` on `100`   6.37:1 (amber, tightest) … 13.35:1 (slate)
 *   dark  — `200` on `900`   6.78:1 (rose, tightest)  … 14.48:1 (slate)
 *
 * The dark fill is a chip, not a highlight: `900` sits only 1.38–1.67:1 against
 * the tooltip's stone-800, and slate — the fallback hue — is flattest at 1.18:1,
 * so an uncategorised chip reads as its label with barely a fill behind it. That
 * is the intended reading. Nothing here is the sole signal for a category: the
 * name is written in the chip, which is what carries the taxonomy for a reader
 * who cannot separate red from rose or amber from orange.
 */
export function categoryChip(
  category: EventCategory | undefined,
  surface: ChipSurface,
): {
  backgroundColor: string;
  color: string;
} {
  const hue = categoryHue(category);
  const weights = CHIP_WEIGHTS[surface];
  return {
    backgroundColor: colors[hue][weights.backgroundColor],
    color: colors[hue][weights.color],
  };
}

/** "headway_change" → "Headway change", the name written in a Category Chip. */
export function formatCategory(category: EventCategory | undefined): string {
  if (!category) return 'Service change';
  const words = category.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
