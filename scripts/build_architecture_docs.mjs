/**
 * Render the architecture diagram set.
 *
 * Source of truth is `docs/architecture/mermaid/*.mmd` — one diagram per file — paired
 * with `docs/architecture/captions.md` by filename stem. This script produces three
 * generated, committed outputs from them and nothing else:
 *
 *   - `docs/architecture/diagrams.md`   — GitHub renders the mermaid fences natively
 *   - `docs/architecture/architecture.html` — self-contained, SVG inlined, no network
 *   - `docs/architecture/architecture.pdf`  — printed from that same HTML
 *
 * Rendering reuses the Playwright Chromium already installed for the visual-regression
 * suite, driving the `mermaid` devDependency in-page. That keeps the toolchain to one
 * browser rather than pulling in mermaid-cli's own puppeteer.
 *
 * Deliberately a `.mjs` file under `scripts/`: `eslint.config.js` matches only
 * `**\/*.{ts,tsx}` and `tsconfig.app.json` includes only `src`, so nothing here reaches
 * `npm run lint` or `tsc -b`, and CI is untouched.
 *
 * Run with `npm run docs:architecture`. It is idempotent — two runs produce
 * byte-identical output, so a stale diff never turns up in an unrelated PR.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const archDir = path.join(repoRoot, 'docs', 'architecture');
const mermaidDir = path.join(archDir, 'mermaid');
const mermaidLib = path.join(repoRoot, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

const DOC_TITLE = 'metro_ridership_app — architecture';
const GENERATED_BY = 'scripts/build_architecture_docs.mjs';

function fail(message) {
  console.error(`\n  build_architecture_docs: ${message}\n`);
  process.exit(1);
}

/** Minimal inline markdown: escape first, then code spans, then bold/em. */
function inlineMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

/** Caption prose is plain paragraphs separated by blank lines. */
function captionToHtml(caption) {
  return caption
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${inlineMarkdown(para.replace(/\s*\n\s*/g, ' '))}</p>`)
    .join('\n        ');
}

/**
 * Parse captions.md into `stem -> { title, caption }`.
 *
 * Sections are `## <stem> — <title>`; the em dash is the separator, so a title may
 * contain hyphens. Everything before the first `##` is the file's own preamble.
 */
async function readCaptions() {
  const raw = await readFile(path.join(archDir, 'captions.md'), 'utf8');
  const sections = raw.split(/^## /m).slice(1);
  const byStem = new Map();

  for (const section of sections) {
    const newline = section.indexOf('\n');
    const heading = section.slice(0, newline === -1 ? undefined : newline).trim();
    const body = newline === -1 ? '' : section.slice(newline + 1).trim();
    const separator = heading.indexOf('—');
    if (separator === -1) fail(`captions.md heading is missing the "—" separator: "${heading}"`);

    const stem = heading.slice(0, separator).trim();
    const title = heading.slice(separator + 1).trim();
    if (byStem.has(stem)) fail(`captions.md has two sections for "${stem}"`);
    byStem.set(stem, { title, caption: body });
  }

  return byStem;
}

/** Load the .mmd files in filename order and pair each with its caption. */
async function readDiagrams() {
  const captions = await readCaptions();
  const files = (await readdir(mermaidDir)).filter((f) => f.endsWith('.mmd')).sort();
  if (files.length === 0) fail(`no .mmd files in ${mermaidDir}`);

  const diagrams = [];
  for (const file of files) {
    const stem = file.replace(/\.mmd$/, '');
    const entry = captions.get(stem);
    if (!entry) fail(`no captions.md section for ${file} (expected "## ${stem} — <title>")`);
    captions.delete(stem);

    const code = (await readFile(path.join(mermaidDir, file), 'utf8')).trimEnd();
    if (!code) fail(`${file} is empty`);
    diagrams.push({ stem, file, code, ...entry });
  }

  if (captions.size > 0) {
    fail(`captions.md has sections with no matching .mmd file: ${[...captions.keys()].join(', ')}`);
  }
  return diagrams;
}

/**
 * Render every diagram to inline SVG in one browser session.
 *
 * One session, sequential, with `deterministicIds` on: mermaid's element ids then come
 * from a counter rather than a random suffix, which is what makes the output stable
 * across runs.
 */
async function renderAll(diagrams) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ path: mermaidLib });

    await page.evaluate(async () => {
      /**
       * Mermaid sizes every node by measuring its rendered label, so the layout — and
       * therefore the path geometry in the SVG — depends on which font is actually
       * resolved at measure time. Without this wait the first diagram can be measured
       * against a fallback face and the output stops being reproducible.
       */
      await document.fonts.ready;

      /**
       * Mermaid draws the rounded label containers through a helper that jitters its
       * intermediate control points. The points stay collinear, so the picture is
       * identical either way, but the serialised path text is not — which is enough to
       * make every rebuild look like a change. Seeding the generator costs nothing and
       * keeps the committed SVG reproducible.
       */
      let seed = 0x2f6e2b1;
      Math.random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x80000000;
      };

      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        deterministicIds: true,
        deterministicIDSeed: 'metro-arch',
        fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        themeVariables: {
          background: '#ffffff',
          primaryColor: '#f8fafc',
          primaryTextColor: '#111827',
          primaryBorderColor: '#94a3b8',
          lineColor: '#475569',
          secondaryColor: '#eef2ff',
          tertiaryColor: '#f1f5f9',
          fontSize: '17px',
        },
        /**
         * Tighter than the defaults on purpose. These diagrams carry a lot of nodes, and
         * the stock spacing pushes them wide enough that scaling one to the page width
         * shrinks its labels past reading size.
         */
        flowchart: {
          htmlLabels: false,
          useMaxWidth: true,
          curve: 'basis',
          nodeSpacing: 38,
          rankSpacing: 52,
          padding: 10,
        },
        sequence: { useMaxWidth: true, wrap: true, width: 200 },
        class: { useMaxWidth: true },
      });
    });

    const rendered = [];
    for (const diagram of diagrams) {
      process.stdout.write(`  rendering ${diagram.file} … `);
      let svg;
      try {
        svg = await page.evaluate(
          async ([id, code]) => (await window.mermaid.render(id, code)).svg,
          [`d-${diagram.stem}`, diagram.code],
        );
      } catch (error) {
        console.log('FAILED');
        fail(`${diagram.file} did not parse:\n\n${error.message}`);
      }
      console.log('ok');
      rendered.push({ ...diagram, svg: normaliseSvg(svg) });
    }
    return rendered;
  } finally {
    await browser.close();
  }
}

/** Widest a diagram may be scaled down to before the figure scrolls instead. */
const MIN_RENDER_WIDTH = 2100;

/**
 * Let CSS size the SVG, but put a floor under how far it may shrink.
 *
 * Mermaid stamps `style="max-width: NNNpx"` on the root, which caps a diagram at its
 * natural width and leaves it stranded in a wide column. Dropping that — and the fixed
 * width/height attributes — hands sizing to the stylesheet.
 *
 * The floor matters because the widest diagrams here are ~3900px. Scaled into a 1280px
 * column that is a third of natural size, which takes the labels below reading size. A
 * `min-width` lets those few scroll horizontally in their figure instead, while every
 * diagram narrower than the floor still simply fits.
 */
function normaliseSvg(svg) {
  const viewBox = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) [\d.]+"/.exec(svg);
  const natural = viewBox ? Math.round(Number(viewBox[1])) : 0;
  // Only the oversized few get a floor. Anything narrower simply scales down to fit,
  // which for most of these is a mild reduction that stays perfectly readable.
  const floorStyle = natural > MIN_RENDER_WIDTH ? ` style="min-width:${MIN_RENDER_WIDTH}px"` : '';

  return svg
    .replace(/<svg([^>]*?)\sstyle="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
    .replace(/<svg /, `<svg${floorStyle} `)
    .replace(/<br\s*>/g, '<br/>');
}

function buildMarkdown(diagrams) {
  const lines = [
    '<!--',
    `  GENERATED FILE — do not edit. Built by ${GENERATED_BY}.`,
    '  Edit the diagram in docs/architecture/mermaid/<name>.mmd or the prose in',
    '  docs/architecture/captions.md, then run `npm run docs:architecture`.',
    '-->',
    '',
    `# ${DOC_TITLE}`,
    '',
    'A whole-system view plus one diagram per subsystem. GitHub renders the fences below;',
    '`architecture.html` and `architecture.pdf` in this folder are the same content, rendered.',
    '',
    '## Contents',
    '',
  ];

  for (const [index, diagram] of diagrams.entries()) {
    lines.push(`${index + 1}. [${diagram.title}](#${slug(diagram.title)})`);
  }

  for (const diagram of diagrams) {
    lines.push('', '---', '', `## ${diagram.title}`, '', diagram.caption, '', '```mermaid', diagram.code, '```');
  }

  lines.push('', '---', '', `<sub>Generated by \`${GENERATED_BY}\` from \`mermaid/\` + \`captions.md\`.</sub>`, '');
  return lines.join('\n');
}

function slug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function buildHtml(diagrams) {
  const toc = diagrams
    .map((d, i) => `<li><a href="#${d.stem}"><span class="num">${String(i + 1).padStart(2, '0')}</span>${inlineMarkdown(d.title)}</a></li>`)
    .join('\n          ');

  const sections = diagrams
    .map(
      (d, i) => `
      <section class="diagram" id="${d.stem}">
        <h2><span class="num">${String(i + 1).padStart(2, '0')}</span>${inlineMarkdown(d.title)}</h2>
        ${captionToHtml(d.caption)}
        <figure>
          ${d.svg}
          <figcaption>${escapeHtml(d.file)}</figcaption>
        </figure>
      </section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(DOC_TITLE)}</title>
<style>
  :root {
    --bg: #ffffff;
    --fg: #1f2937;
    --muted: #6b7280;
    --rule: #e5e7eb;
    --accent: #0369a1;
    --card: #ffffff;
    --card-rule: #e5e7eb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1220;
      --fg: #e5e7eb;
      --muted: #9ca3af;
      --rule: #1f2937;
      --accent: #7dd3fc;
      --card: #f8fafc;
      --card-rule: #cbd5e1;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.6 ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1280px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
  header h1 { font-size: 1.9rem; margin: 0 0 .4rem; letter-spacing: -0.02em; }
  header p { color: var(--muted); margin: 0 0 2rem; max-width: 62ch; }
  nav { border: 1px solid var(--rule); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 3rem; }
  nav h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 .75rem; }
  nav ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 2.5rem; }
  nav li { break-inside: avoid; margin: .2rem 0; }
  nav a { color: var(--fg); text-decoration: none; }
  nav a:hover { color: var(--accent); text-decoration: underline; }
  .num { color: var(--muted); font-variant-numeric: tabular-nums; margin-right: .6rem; font-size: .85em; }
  section.diagram { border-top: 1px solid var(--rule); padding-top: 2.25rem; margin-top: 2.5rem; }
  section.diagram:first-of-type { border-top: 0; margin-top: 0; }
  h2 { font-size: 1.35rem; letter-spacing: -0.01em; margin: 0 0 .75rem; }
  p { max-width: 74ch; }
  code { font: .88em/1.4 ui-monospace, "Cascadia Code", Consolas, monospace; background: rgba(127,127,127,.16); padding: .1em .35em; border-radius: 4px; }
  figure { margin: 1.75rem 0 0; background: var(--card); border: 1px solid var(--card-rule); border-radius: 10px; padding: 1.25rem; overflow-x: auto; }
  figure svg { display: block; width: 100%; height: auto; max-width: 100%; }
  figcaption { color: #64748b; font: .75rem ui-monospace, Consolas, monospace; margin-top: .75rem; text-align: right; }
  footer { color: var(--muted); font-size: .85rem; border-top: 1px solid var(--rule); margin-top: 3.5rem; padding-top: 1.25rem; }
  @media print {
    :root { --bg: #fff; --fg: #111827; --rule: #d1d5db; --card: #fff; --card-rule: #d1d5db; }
    body { font-size: 11pt; }
    .wrap { max-width: none; padding: 0; }
    nav { break-after: page; }
    section.diagram { break-before: page; border-top: 0; margin-top: 0; padding-top: 0; }
    section.diagram:first-of-type { break-before: avoid; }
    figure { break-inside: avoid; overflow: visible; }
    /* Drop the on-screen scroll floor and cap by height as well as width, so a tall or
       wide diagram scales to the page instead of being clipped at the margin. */
    figure svg { min-width: 0 !important; max-height: 17cm; width: auto; max-width: 100%; margin: 0 auto; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(DOC_TITLE)}</h1>
      <p>A whole-system view plus one diagram per subsystem, generated from the mermaid
      sources in <code>docs/architecture/mermaid/</code>. Diagrams sit on a light card in
      both themes so the rendered colours stay legible.</p>
    </header>
    <nav>
      <h2>Contents</h2>
      <ol>
          ${toc}
      </ol>
    </nav>
${sections}
    <footer>Generated by <code>${escapeHtml(GENERATED_BY)}</code> from <code>mermaid/</code> + <code>captions.md</code>. Do not edit this file directly.</footer>
  </div>
</body>
</html>
`;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A fixed timestamp, written over the one Chromium stamps into the PDF.
 *
 * Same byte length as the real thing, so every offset in the cross-reference table
 * stays valid. Without this the committed binary differs on every rebuild for no
 * reason anyone reviewing the diff can see.
 */
const FIXED_PDF_DATE = "D:20000101000000+00'00'";

async function writePdf(html) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      // A3 landscape rather than A4: these diagrams are wide, and the extra 12cm of
      // page width is the difference between readable labels and a grey smudge.
      width: '420mm',
      height: '297mm',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
    });

    const stamped = Buffer.from(
      pdf
        .toString('latin1')
        .replace(/(\/(?:Creation|Mod)Date\s*\()D:\d{14}[+-]\d{2}'\d{2}'/g, `$1${FIXED_PDF_DATE}`),
      'latin1',
    );
    if (stamped.length !== pdf.length) fail('PDF date normalisation changed the file length');

    await writeFile(path.join(archDir, 'architecture.pdf'), stamped);
  } finally {
    await browser.close();
  }
}

const diagrams = await readDiagrams();
console.log(`\n  ${diagrams.length} diagrams\n`);

const rendered = await renderAll(diagrams);

await writeFile(path.join(archDir, 'diagrams.md'), buildMarkdown(rendered), 'utf8');
const html = buildHtml(rendered);
await writeFile(path.join(archDir, 'architecture.html'), html, 'utf8');
await writePdf(html);

console.log('\n  wrote docs/architecture/diagrams.md, architecture.html, architecture.pdf\n');
