import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { hoverCrosshairPlugin } from './hoverCrosshair';
import { eventGutterPlugin } from './eventGutter';
import { rangeSelectPlugin } from './rangeSelect';

/**
 * One registration site for everything the ridership chart draws with.
 *
 * Registration is a global mutation of the Chart.js registry, so it must happen
 * exactly once and before the first chart renders. Importing this module is what
 * does it — `RidershipChart` imports it for that side effect as much as for the
 * exports.
 */
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  hoverCrosshairPlugin,
  eventGutterPlugin,
  rangeSelectPlugin,
);

export { hoverCrosshairPlugin } from './hoverCrosshair';
export { eventGutterPlugin, groupEventsByMonthIndex } from './eventGutter';
export {
  rangeSelectPlugin,
  consumeDragSuppression,
  RANGE_SELECT_EVENTS,
  DRAG_THRESHOLD_PX,
} from './rangeSelect';
export {
  categoryColor,
  categoryTextColor,
  categoryChip,
  formatCategory,
} from './categoryColors';
export {
  eventDateToLabel,
  labelToEventDate,
  labelToDate,
  formatMonthLabel,
  formatEventDate,
} from './months';
