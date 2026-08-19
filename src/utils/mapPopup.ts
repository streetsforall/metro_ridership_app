import type { LineReadout } from '../ridership';
import type { StopReadout } from '../stops';
import { formatRiders, formatShare } from './figures';

/** One label/value line of a popup table. */
const row = (label: string, value: string): string =>
  `<tr><td>${label}</td><td class="map-popup-value">${value}</td></tr>`;

export function buildPopupHTML(name: string, line?: LineReadout): string {
  const rows: string[] = [];
  if (line?.distanceMiles) rows.push(row('Miles', String(line.distanceMiles)));
  if (line?.averageRidership)
    rows.push(row('Avg. Riders', formatRiders(line.averageRidership)));
  if (line?.ridersPerMile)
    rows.push(row('Riders/Mile', formatRiders(line.ridersPerMile)));
  return `<strong>${name}</strong>${rows.length ? `<table>${rows.join('')}</table>` : ''}`;
}

/**
 * The hover popup for one stop marker, in the same shape as the line popup.
 *
 * **Boardings and Alightings**, never "ons"/"offs": `CONTEXT.md`'s vocabulary binds UI
 * copy, and this is UI copy.
 *
 * `lineName` is passed in because the readout carries a numeric line id and the display
 * name lives in line metadata — the same split the line popup has. A readout with no
 * figures renders as a bare name; `buildStopView` cannot produce one, but the fields are
 * optional and the contract should not depend on the caller knowing that.
 */
export function buildStopPopupHTML(
  readout: StopReadout,
  lineName: string,
): string {
  const rows: string[] = [];
  if (readout.averageBoardings !== undefined)
    rows.push(row('Avg. Boardings', formatRiders(readout.averageBoardings)));
  if (readout.averageAlightings !== undefined)
    rows.push(row('Avg. Alightings', formatRiders(readout.averageAlightings)));
  if (readout.shareOfLine !== undefined)
    rows.push(row('Share of line', formatShare(readout.shareOfLine)));

  return (
    `<strong>${readout.name}</strong>` +
    `<div class="map-popup-sub">${lineName}</div>` +
    (rows.length ? `<table>${rows.join('')}</table>` : '')
  );
}
