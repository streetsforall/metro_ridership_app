import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Returns the great-circle distance in miles between two coordinates using the
 * Haversine formula: d = 2R · arcsin(√(sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)))
 * Accurate to within ~0.5% for the distances involved in transit routes.
 */
export function haversineDistance(lon1, lat1, lon2, lat2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Returns the total route length in miles for a GeoJSON MultiLineString's
 * coordinates array. Each lineString is summed independently (consecutive
 * point pairs within a lineString are connected; separate lineStrings are not).
 */
export function multiLineStringDistance(coordinates) {
  let total = 0;
  for (const lineString of coordinates) {
    for (let i = 1; i < lineString.length; i++) {
      total += haversineDistance(
        lineString[i - 1][0], lineString[i - 1][1],
        lineString[i][0], lineString[i][1],
      );
    }
  }
  return total;
}

// Returns true when a MultiLineString encodes a round trip: two lineStrings where
// the second begins at the endpoint of the first (outbound + inbound directions).
export function isRoundTrip(coordinates) {
  if (coordinates.length !== 2) return false;
  const [ls0, ls1] = coordinates;
  const end = ls0[ls0.length - 1];
  const start = ls1[0];
  return Math.abs(end[0] - start[0]) < 0.0001 && Math.abs(end[1] - start[1]) < 0.0001;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const geojson = JSON.parse(
    readFileSync(resolve(__dirname, '../public/metro_lines.geojson'), 'utf8'),
  );

  const distances = {};
  for (const feature of geojson.features) {
    const { line_id } = feature.properties;
    const coords = feature.geometry.coordinates;
    const miles = multiLineStringDistance(isRoundTrip(coords) ? [coords[0]] : coords);
    distances[line_id] = Math.round(miles * 10) / 10;
  }

  writeFileSync(
    resolve(__dirname, '../src/data/line_distances.json'),
    JSON.stringify(distances, null, 2),
  );

  console.log(`Computed distances for ${Object.keys(distances).length} lines`);
}
