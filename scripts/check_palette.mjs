/**
 * Checks the line palette for separation and contrast, so the numbers the design canvas
 * prints can be reproduced rather than trusted.
 *
 * Run with: npm run check-palette  (add hex arguments to check other colours instead)
 *
 * The colours are read out of `src/utils/lines.ts` rather than restated here, because a
 * palette that can drift from its checker is a checker that reports on nothing. Three
 * measures, all of them standard:
 *
 *   separation       OKLab distance times a hundred, which is the delta E the canvas quotes
 *   colourblindness  Machado 2009 matrices at severity 1.0, applied in linear light
 *   contrast         WCAG 2 relative luminance ratio
 *
 * The floors are the ones the artboards argue from: delta E 15 under normal vision and 8
 * under a simulation for a categorical palette, and 3 to 1 against the surface for a mark
 * that carries no label of its own.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Surfaces the canvas actually paints, lightest first. */
const SURFACES = {
  '#ffffff': 'panel white',
  '#f8f6f1': 'artboard card',
  '#f3eee2': 'artboard ground',
  '#e8e6e1': 'drawn map',
};

/** The current rail network, which is what every multi-line station mark has to separate. */
const RAIL_SIX = ['A', 'B', 'C', 'D', 'E', 'K'];

const FLOOR = { normal: 15, simulated: 8, contrast: 3 };

/** Who each column is about, spelled the way the artboards spell it. */
const READER = {
  normal: 'reader with normal vision',
  protan: 'protanope',
  deutan: 'deuteranope',
  tritan: 'tritanope',
};

// ---------------------------------------------------------------- colour maths

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const toLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toSrgb = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

function oklab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab distance times a hundred, which is the scale every delta E on the canvas uses. */
function deltaE(a, b) {
  const x = oklab(a);
  const y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

/** Machado, Oliveira and Fernandes 2009, severity 1.0. */
const CVD = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function simulate(rgb, kind) {
  const v = rgb.map(toLinear);
  return CVD[kind].map((row) =>
    Math.min(
      1,
      Math.max(0, toSrgb(row[0] * v[0] + row[1] * v[1] + row[2] * v[2])),
    ),
  );
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ---------------------------------------------------------------- the palette

/**
 * The lettered lines out of `src/utils/lines.ts`.
 *
 * Read with a regex rather than an import, because standing up a TypeScript loader to
 * reach nine string literals would cost more than it returns.
 */
function readPalette() {
  const source = readFileSync(join(ROOT, 'src/utils/lines.ts'), 'utf8');
  const block = source.match(/const definedLines = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('definedLines not found in src/utils/lines.ts');

  const lines = [];
  const entry = /letter:\s*'([A-Z])'[\s\S]*?color:\s*'(#[0-9a-fA-F]{6})'/g;
  let match;
  while ((match = entry.exec(block[1])) !== null) {
    lines.push({ letter: match[1], color: match[2].toLowerCase() });
  }
  if (lines.length === 0)
    throw new Error('no lettered lines parsed from definedLines');
  return lines;
}

// ---------------------------------------------------------------- reporting

const pad = (s, n) => String(s).padEnd(n);
const num = (v) => v.toFixed(1).padStart(6);

function separationTable(entries) {
  console.log('\nSeparation - OKLab delta E times a hundred');
  console.log(
    `  ${pad('pair', 12)}${pad('normal', 9)}${pad('protan', 9)}${pad('deutan', 9)}${pad('tritan', 9)}`,
  );
  const failures = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = hex(entries[i].color);
      const b = hex(entries[j].color);
      const d = {
        normal: deltaE(a, b),
        protan: deltaE(simulate(a, 'protan'), simulate(b, 'protan')),
        deutan: deltaE(simulate(a, 'deutan'), simulate(b, 'deutan')),
        tritan: deltaE(simulate(a, 'tritan'), simulate(b, 'tritan')),
      };
      const under = Object.entries(d).filter(([kind, v]) =>
        kind === 'normal' ? v < FLOOR.normal : v < FLOOR.simulated,
      );
      const pair = `${entries[i].letter}-${entries[j].letter}`;
      console.log(
        `  ${pad(pair, 12)}${num(d.normal)}   ${num(d.protan)}   ${num(d.deutan)}   ${num(d.tritan)}` +
          (under.length ? '   under floor' : ''),
      );
      under.forEach(([kind, v]) => failures.push({ pair, kind, value: v }));
    }
  }
  return failures;
}

function contrastTable(entries) {
  console.log('\nContrast - WCAG ratio against each surface the canvas paints');
  const surfaces = Object.keys(SURFACES);
  console.log(
    `  ${pad('line', 14)}${surfaces.map((s) => pad(s, 16)).join('')}`,
  );
  console.log(
    `  ${pad('', 14)}${surfaces.map((s) => pad(SURFACES[s], 16)).join('')}`,
  );
  const failures = [];
  entries.forEach((e) => {
    const cells = surfaces.map((s) => {
      const ratio = contrast(hex(e.color), hex(s));
      if (ratio < FLOOR.contrast)
        failures.push({ line: e.letter, surface: s, ratio });
      return pad(
        `${ratio.toFixed(2)}${ratio < FLOOR.contrast ? ' !' : ''}`,
        16,
      );
    });
    console.log(`  ${pad(`${e.letter} ${e.color}`, 14)}${cells.join('')}`);
  });
  return failures;
}

// ---------------------------------------------------------------- entry point

const extra = process.argv.slice(2).filter((a) => /^#[0-9a-fA-F]{6}$/.test(a));
const palette = readPalette();
const rail = palette.filter((l) => RAIL_SIX.includes(l.letter));
const checked = extra.length
  ? extra.map((color, i) => ({
      letter: `x${i + 1}`,
      color: color.toLowerCase(),
    }))
  : rail;

console.log('Palette check - colours read from src/utils/lines.ts');
console.log(
  'Method: OKLab delta E times a hundred; colour vision simulated with Machado 2009 at severity 1.0.',
);
console.log(
  `Floors: delta E ${FLOOR.normal} under normal vision, ${FLOOR.simulated} under a simulation, ${FLOOR.contrast} to 1 for contrast.`,
);
console.log(
  `\nChecking ${checked.map((c) => `${c.letter} ${c.color}`).join(', ')}` +
    (extra.length
      ? '  (from the command line)'
      : '  (the current rail network)'),
);

const separationFailures = separationTable(checked);
const contrastFailures = contrastTable(checked);

console.log('\nWhat fails');
if (separationFailures.length === 0 && contrastFailures.length === 0) {
  console.log(
    '  Nothing. Every pair clears its floor and every colour clears 3 to 1.',
  );
} else {
  separationFailures.forEach((f) =>
    console.log(
      `  ${f.pair} separates by only ${f.value.toFixed(1)} for a ` +
        `${READER[f.kind]}`,
    ),
  );
  contrastFailures.forEach((f) =>
    console.log(
      `  ${f.line} sits at ${f.ratio.toFixed(2)} to 1 against ${SURFACES[f.surface]} ${f.surface}, ` +
        'so it needs a label of its own',
    ),
  );
}

const hues = new Set(separationFailures.flatMap((f) => f.pair.split('-')));
if (hues.size) {
  console.log(
    `\n${hues.size} of the ${checked.length} colours sit in a pair under a floor: ` +
      `${[...hues].sort().join(', ')}.`,
  );
}
