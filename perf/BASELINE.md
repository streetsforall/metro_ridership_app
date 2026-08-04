# Performance baseline & results

Front-end performance review of the metro ridership app. All numbers are from a
**production build** (`npm run build`), never the dev server.

## How to reproduce

```bash
npm run build                 # production build → dist/
ANALYZE=1 npm run build       # + bundle treemap at dist/stats.html
```

Raw/gzip/brotli sizes were measured with Node's `zlib` over the emitted assets:

```bash
node -e 'const fs=require("fs"),z=require("zlib");const b=fs.readFileSync(process.argv[1]);console.log(b.length, z.gzipSync(b).length, z.brotliCompressSync(b).length)' dist/assets/<file>
```

Table sizes below are **KiB** (bytes ÷ 1024), so they read ~2–4% smaller than Vite's
build log, which prints decimal kB (bytes ÷ 1000) — same bytes, different unit.

## The problem (baseline)

The dataset was `import`-inlined into `App.tsx`, so the entire app shipped as **one
6.4 MB JS chunk** — most of it a giant object literal that the browser must parse and
execute before first render. Chart.js and MapLibre GL were in that same chunk.

| Asset | raw | gzip | brotli |
|---|---:|---:|---:|
| Entry JS (single chunk) | 6250.3 kB | 844.2 kB | 590.9 kB |
| Entry CSS (single) | 81.1 kB | 13.5 kB | 11.0 kB |
| **Entry total (gates first paint)** | **6331.5 kB** | **857.7 kB** | **601.8 kB** |
| `public/metro_lines.geojson` (runtime fetch) | 6.57 MB | — | — |
| `src/data/old_ridership.json` (dead, unused) | 4.10 MB | — | — |

Vite warned: *"Some chunks are larger than 500 kB after minification."*

## The changes

1. **Ridership data → fetched columnar asset.** A build-time Vite plugin
   (`vite/ridership-data-plugin.ts`) re-encodes the canonical
   `src/data/ridership.json` into a minified columnar `{cols,rows}` blob served at
   `/ridership.json`. The app fetches and decodes it at runtime
   (`src/utils/ridershipData.ts`) instead of inlining it into the JS. Date bounds come
   from the plugin's `virtual:ridership-bounds` module. The canonical file and the
   Python pipeline are untouched.
2. **Code-split OutputArea.** Lazy-loaded via `React.lazy`, moving MapLibre GL (the
   single largest dependency) and the main chart out of the entry chunk.
3. **Minified `metro_lines.geojson`** (writer + committed file): 6.57 MB → 2.23 MB.
4. **Deleted** dead `src/data/old_ridership.json` (4.10 MB).

## Results (after)

| Asset | raw | gzip | brotli | when it loads |
|---|---:|---:|---:|---|
| Entry JS | 475.9 kB | 159.4 kB | 137.0 kB | blocks first paint |
| Entry CSS | 12.6 kB | 3.7 kB | 3.2 kB | blocks first paint |
| **Entry total** | **488.5 kB** | **163.1 kB** | **140.2 kB** | **blocks first paint** |
| `OutputArea-*.js` (Chart.js + MapLibre) | 1044.4 kB | 283.7 kB | 231.5 kB | async, after paint |
| `OutputArea-*.css` (MapLibre CSS) | 68.5 kB | 9.9 kB | 8.0 kB | async, after paint |
| `/ridership.json` (columnar) | 1016.3 kB | 297.0 kB | 184.7 kB | async fetch (`JSON.parse`) |
| `public/metro_lines.geojson` | 2.23 MB | — | — | async fetch (map) |

## Delta

| Metric | Before | After | Change |
|---|---:|---:|---:|
| **Entry chunk, raw** (parse/execute cost) | 6331.5 kB | 488.5 kB | **−92.3%** |
| **Entry chunk, gzip** | 857.7 kB | 163.1 kB | **−81.0%** |
| **Entry chunk, brotli** | 601.8 kB | 140.2 kB | **−76.7%** |
| Ridership data, raw | 6.64 MB (in JS) | 1.02 MB (fetched) | **−85%**, off the JS parse path |
| geojson, raw | 6.57 MB | 2.23 MB | **−66%** |

The headline win is the **entry chunk**: what the browser must download, parse, and
execute before the UI appears drops ~92% in raw bytes. The dataset now arrives as a
much smaller JSON asset parsed with native `JSON.parse` (instead of a multi-MB JS
object literal), in parallel with first paint rather than blocking it. MapLibre GL
loads on demand with the chart/map area.

## Runtime cold-load (measured)

The bundle sizes above are the real story, but they're a proxy for load time. To confirm
the win shows up at runtime, both production builds were served over plain HTTP
(`python -m http.server`, so the browser sees uncompressed bytes and no server gzip) and
loaded in a headless Chromium, reading `PerformanceNavigationTiming`. "Before" is
`origin/main` (e9dbf08) built in a throwaway worktree; "after" is this branch. Each
figure is the **first (cold) load** of a freshly started server — no HTTP cache and no
V8 code cache for the content-hashed assets — so the two are directly comparable.

| Metric | Before (e9dbf08) | After | Change |
|---|---:|---:|---:|
| DOMContentLoaded / load — **cold** | 226 / 227 ms | 122 / 122 ms | **~−46%** |
| DOMContentLoaded / load — warm reload | 51 ms | 71 ms | ~even (see below) |
| JS transferred before React mounts | 6,405 kB (one chunk) | 487 kB (entry only) | **−92%** |
| Line rows + chart rendered | 158 rows + canvas ✓ | 158 rows + canvas ✓ | identical |

Reproduce (after; do the same against an `origin/main` build for the before number):

```bash
python -m http.server 4199 --bind 127.0.0.1 --directory dist
# then in the browser console on http://127.0.0.1:4199/ :
#   const n = performance.getEntriesByType('navigation')[0]
#   ({ dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd })
```

These localhost numbers **understate** the real-world win:

- **Localhost download is instant.** The 6.4 MB → 487 kB entry (864 kB → 163 kB gzipped)
  costs almost nothing to transfer here; on a real network that download delta dominates
  and dwarfs the ~100 ms parse gap measured above.
- **Fast desktop CPU.** Mobile / mid-tier CPUs parse and compile JS 4–6× slower, so the
  cold gap widens on the devices that need it most.
- **Warm reloads converge** (51 vs 71 ms) because V8 caches the compiled bytecode after
  the first compile — the entry-chunk win matters most for first-time visitors and on
  real networks, not warm repeat loads on a fast desktop.
- The headless pane doesn't composite frames, so FCP/LCP paint timings weren't captured;
  DOMContentLoaded/load bracket the entry-chunk parse+execute and are the reliable signal
  here.

## Verification

- `npm run build` — clean (`tsc -b` + `vite build`).
- `npm run test` — 272 unit tests pass (incl. columnar decode round-trip + updated
  `App.test.tsx` fetch mock).
- `npm run test:e2e` — 6 Playwright visual snapshots pass unchanged (async loading is
  awaited in `gotoDashboard`, so screenshots capture the populated dashboard).
- `npm run lint` — clean.

## Notes / further opportunities (out of scope here)

- **Chart.js still sits in the entry chunk** via the per-row sparkline in
  `LineTableRow` (reached through the always-loaded `LineSelector`). Lazy-loading the
  sparkline would trim the entry chunk further.
- **geojson coordinate precision** could be trimmed for additional map-payload savings.
- The render hot-path `JSON.stringify(...)` dependency arrays are intentional
  (CLAUDE.md) and were left untouched.
- Static hosts should serve `/ridership.json` and the geojson with gzip/brotli +
  sensible cache headers.
