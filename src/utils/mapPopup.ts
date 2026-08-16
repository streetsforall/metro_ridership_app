import type { LineReadout } from '../ridership';
import type { StopReadout } from '../stops';

export function buildPopupHTML(name: string, line?: LineReadout): string {
  const rows: string[] = [];
  if (line?.distanceMiles)
    rows.push(
      `<tr><td>Miles</td><td class="map-popup-value">${line.distanceMiles}</td></tr>`,
    );
  if (line?.averageRidership)
    rows.push(
      `<tr><td>Avg. Riders</td><td class="map-popup-value">${Math.round(line.averageRidership).toLocaleString()}</td></tr>`,
    );
  if (line?.ridersPerMile)
    rows.push(
      `<tr><td>Riders/Mile</td><td class="map-popup-value">${Math.round(line.ridersPerMile).toLocaleString()}</td></tr>`,
    );
  return `<strong>${name}</strong>${rows.length ? `<table>${rows.join('')}</table>` : ''}`;
}

/** `1234.5` → `"1,235"`. Same rounding the line popup and the line table use. */
const figure = (value: number): string =>
  Math.round(value).toLocaleString();

/**
 * The hover popup for one stop marker, beside the line popup and in the same shape.
 *
 * **Boardings and Alightings**, never "ons"/"offs" — `CONTEXT.md`'s vocabulary is
 * binding on UI copy, and this string is UI copy.
 *
 * The figures come off the Stop Readout the panel already derived; nothing is
 * recomputed here. `lineName` is passed in rather than looked up because the readout
 * carries a numeric line id and the display name lives in line metadata — the same
 * split the line popup has.
 *
 * A readout with no figures renders as a bare name. That state is unreachable through
 * `buildStopView` (a readout exists only because a record landed in it), and it is
 * handled for the same reason `StopReadout` declares the fields optional: the contract
 * does not depend on the caller knowing that.
 */
export function buildStopPopupHTML(
  readout: StopReadout,
  lineName: string,
): string {
  const rows: string[] = [];
  if (readout.averageBoardings !== undefined)
    rows.push(
      `<tr><td>Avg. Boardings</td><td class="map-popup-value">${figure(readout.averageBoardings)}</td></tr>`,
    );
  if (readout.averageAlightings !== undefined)
    rows.push(
      `<tr><td>Avg. Alightings</td><td class="map-popup-value">${figure(readout.averageAlightings)}</td></tr>`,
    );
  if (readout.shareOfLine !== undefined)
    rows.push(
      `<tr><td>Share of line</td><td class="map-popup-value">${(readout.shareOfLine * 100).toFixed(1)}%</td></tr>`,
    );

  return (
    `<strong>${readout.name}</strong>` +
    `<div class="map-popup-sub">${lineName}</div>` +
    (rows.length ? `<table>${rows.join('')}</table>` : '')
  );
}
