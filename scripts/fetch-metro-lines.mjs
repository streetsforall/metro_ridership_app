/**
 * Fetches LA Metro GTFS data and converts route shapes to GeoJSON.
 * Run with: npm run fetch-lines
 * Refresh monthly to keep route geometry up to date.
 *
 * Output: src/data/metro_lines.geojson
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'metro_lines.geojson');

// LA Metro publishes separate GTFS feeds for rail and bus.
// Update these URLs if the feed location changes.
const GTFS_URLS = {
  rail: 'https://gitlab.com/LACMTA/gtfs_rail/-/raw/master/gtfs_rail.zip',
  bus: 'https://gitlab.com/LACMTA/gtfs_bus/-/raw/master/gtfs_bus.zip',
};

// Override display names for BRT lines that appear in the bus GTFS feed
const BRT_NAMES = { 901: 'G Line', 910: 'J Line' };

// Must match busLineColor() in src/utils/lines.ts exactly
export function busLineColor(lineId) {
  const hue = Math.round((lineId * 137.508) % 360);
  return `hsl(${hue}, 75%, 45%)`;
}

// Canonical colors from src/utils/lines.ts definedLines (used instead of GTFS color)
const RAIL_COLORS = {
  801: '#0072bc', 802: '#eb131b', 803: '#58a738', 804: '#fdb913',
  805: '#a05da5', 806: '#f9a825', 807: '#e56db1', 901: '#fc4c02', 910: '#adB8bf',
};

/**
 * Parses a simple CSV string (no multi-line quoted fields).
 * Handles quoted fields with commas inside them.
 */
export function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length === 0) return [];

  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

export function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function fetchGTFS(url) {
  console.log(`  Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);

  const getFile = (name) => {
    const entry = zip.getEntry(name);
    if (!entry) return [];
    return parseCSV(entry.getData().toString('utf-8'));
  };

  return { getFile };
}

/**
 * Builds GeoJSON features from one GTFS feed.
 * @param {string} mode - 'Rail' or 'Bus'
 */
async function processGTFSFeed(url, mode) {
  const { getFile } = await fetchGTFS(url);

  console.log('  Parsing routes...');
  const routes = getFile('routes.txt');

  console.log('  Parsing trips...');
  const trips = getFile('trips.txt');

  console.log('  Parsing shapes...');
  const shapesRaw = getFile('shapes.txt');

  // Build shape_id → sorted coordinate array
  console.log('  Building shape geometries...');
  const shapePoints = {};
  for (const row of shapesRaw) {
    const id = row.shape_id;
    if (!shapePoints[id]) shapePoints[id] = [];
    shapePoints[id].push({
      seq: parseInt(row.shape_pt_sequence, 10),
      lng: parseFloat(row.shape_pt_lon),
      lat: parseFloat(row.shape_pt_lat),
    });
  }
  for (const id of Object.keys(shapePoints)) {
    shapePoints[id].sort((a, b) => a.seq - b.seq);
  }

  // Map route_id → set of shape_ids (via trips)
  const routeShapes = {};
  for (const trip of trips) {
    if (!trip.route_id || !trip.shape_id) continue;
    if (!routeShapes[trip.route_id]) routeShapes[trip.route_id] = new Set();
    routeShapes[trip.route_id].add(trip.shape_id);
  }

  const features = [];

  for (const route of routes) {
    // Resolve line_id
    let lineId;
    let name;
    if (mode === 'Rail') {
      // Rail GTFS: route_id is the numeric line ID (801, 802, ...) and
      // route_short_name is empty. Use route_id directly.
      lineId = parseInt(route.route_id, 10);
      if (isNaN(lineId) || !RAIL_COLORS[lineId]) continue;
      // Strip "Metro " prefix from long name to get "A Line", "B Line", etc.
      name = (route.route_long_name ?? '').replace(/^Metro\s+/i, '').trim() || `Line ${lineId}`;
    } else {
      // Bus routes normally have a numeric short name.
      // BRT lines (G/J) have an empty short name but a parseable route_id like "901-13201".
      let shortName = route.route_short_name?.trim();
      if (!shortName) {
        shortName = route.route_id?.split('-')[0]?.trim();
      }
      if (!shortName) continue;
      lineId = parseInt(shortName, 10);
      if (isNaN(lineId)) continue;
      name = BRT_NAMES[lineId] ?? `Line ${lineId}`;
    }

    // Use canonical brand colors for known rail/BRT IDs; deterministic hue for bus.
    const color = RAIL_COLORS[lineId] ?? busLineColor(lineId);

    // Collect all unique shapes for this route
    const shapeIds = routeShapes[route.route_id] ? [...routeShapes[route.route_id]] : [];
    if (shapeIds.length === 0) continue;

    // For bus routes, pick the single longest shape to keep file size manageable.
    // For rail, include all distinct shapes to capture branches.
    let coordArrays;
    if (mode === 'Rail') {
      coordArrays = shapeIds
        .filter((id) => shapePoints[id])
        .map((id) => shapePoints[id].map((p) => [p.lng, p.lat]));
    } else {
      const longest = shapeIds
        .filter((id) => shapePoints[id])
        .sort((a, b) => (shapePoints[b]?.length ?? 0) - (shapePoints[a]?.length ?? 0))[0];
      if (!longest) continue;
      coordArrays = [shapePoints[longest].map((p) => [p.lng, p.lat])];
    }

    if (coordArrays.length === 0) continue;

    features.push({
      type: 'Feature',
      properties: { line_id: lineId, name, color, mode },
      geometry: {
        type: 'MultiLineString',
        coordinates: coordArrays,
      },
    });
  }

  return features;
}

async function main() {
  console.log('Fetching LA Metro GTFS data...\n');

  const allFeatures = [];

  console.log('[Rail]');
  const railFeatures = await processGTFSFeed(GTFS_URLS.rail, 'Rail');
  console.log(`  Built ${railFeatures.length} rail features\n`);
  allFeatures.push(...railFeatures);

  console.log('[Bus]');
  const busFeatures = await processGTFSFeed(GTFS_URLS.bus, 'Bus');
  console.log(`  Built ${busFeatures.length} bus features\n`);
  allFeatures.push(...busFeatures);

  const geojson = {
    type: 'FeatureCollection',
    features: allFeatures,
  };

  writeFileSync(OUT_PATH, JSON.stringify(geojson, null, 2), 'utf-8');
  console.log(`Written to ${OUT_PATH}`);
  console.log(`Total features: ${allFeatures.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
