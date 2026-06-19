import type { Line } from '../@types/lines.types';

export function buildPopupHTML(name: string, line?: Line): string {
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
