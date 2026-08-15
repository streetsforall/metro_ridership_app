import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { stopRidershipPlugin } from './stop-ridership-plugin';

/**
 * The plugin's spec runs entirely against small committed fixtures under
 * `vite/__fixtures__/`. It must never read `src/data/stop_ridership.*.json`: those are
 * multi-megabyte pipeline output that this branch does not even have, and a test that
 * depended on them would fail for the wrong reason on a fresh clone.
 *
 * Paths, not `new URL(…, import.meta.url)` — Vite's transform rewrites that form into
 * asset handling, and a dynamic first argument into a glob import.
 */
const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
);
const fixtures = (name: string) => join(FIXTURE_ROOT, name);
const fixtureFile = (dir: string, name: string) =>
  readFileSync(join(dir, name), 'utf8');

/** A directory that does not exist — the pre-ingest state, with no committed file needed. */
const NO_DATA = fixtures('no-stop-data');
const BOTH = fixtures('stops');
const RAIL_ONLY = fixtures('rail-only');
const MALFORMED = fixtures('malformed');

const MANIFEST_ID = 'virtual:stop-ridership-manifest';
const RESOLVED_MANIFEST_ID = '\0' + MANIFEST_ID;

/**
 * Rollup types every hook as `ObjectHook<T>` — a function *or* `{ handler }`. These
 * are returned as plain functions, so the specs narrow once here rather than casting
 * at every call site.
 */
function asFunction<T>(hook: T | { handler: T } | undefined): T {
  if (typeof hook === 'function') return hook;
  if (hook && typeof hook === 'object' && 'handler' in hook)
    return hook.handler;
  throw new Error('hook is not callable');
}

/** Evaluate the generated virtual module without running it: every value is a JSON literal. */
function readManifest(plugin: Plugin): Record<string, unknown> {
  const load = asFunction(plugin.load) as (
    this: unknown,
    id: string,
  ) => string | undefined;
  const source = load.call(undefined, RESOLVED_MANIFEST_ID);
  if (typeof source !== 'string')
    throw new Error('load did not return the manifest module');

  const manifest: Record<string, unknown> = {};
  for (const [, name, value] of source.matchAll(/export const (\w+) = (.+);/g))
    manifest[name] = JSON.parse(value) as unknown;
  return manifest;
}

/** Run `generateBundle` and collect what it emitted. */
function emittedFiles(plugin: Plugin): { fileName: string; source: string }[] {
  const emitted: { fileName: string; source: string }[] = [];
  const generateBundle = asFunction(plugin.generateBundle) as (
    this: { emitFile: (file: unknown) => void },
    ...args: unknown[]
  ) => void;

  generateBundle.call(
    {
      emitFile: (file: unknown) => {
        const asset = file as { fileName: string; source: string };
        emitted.push({ fileName: asset.fileName, source: asset.source });
      },
    },
    {},
    {},
    { write: true },
  );
  return emitted;
}

interface Served {
  status: 'served' | 'passed-through';
  contentType?: string;
  body?: string;
}

/** Drive the dev middleware for one request path. */
function request(plugin: Plugin, url: string): Served {
  let handler: ((req: unknown, res: unknown, next: () => void) => void) | null =
    null;
  const configureServer = asFunction(plugin.configureServer) as (
    this: unknown,
    server: unknown,
  ) => void;
  configureServer.call(undefined, {
    middlewares: {
      use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
        handler = fn;
      },
    },
  });
  if (!handler) throw new Error('configureServer registered no middleware');

  const result: Served = { status: 'passed-through' };
  const res = {
    setHeader: (name: string, value: string) => {
      if (name === 'Content-Type') result.contentType = value;
    },
    end: (body: string) => {
      result.status = 'served';
      result.body = body;
    },
  };
  (handler as (req: unknown, res: unknown, next: () => void) => void)(
    { url },
    res,
    () => {
      /* fell through to the next middleware */
    },
  );
  return result;
}

describe('stop-ridership plugin', () => {
  describe('with both payloads present', () => {
    const plugin = () => stopRidershipPlugin({ dataDir: BOTH });

    it('resolves the manifest virtual module', () => {
      const resolveId = asFunction(plugin().resolveId) as (
        this: unknown,
        id: string,
      ) => string | undefined;
      expect(resolveId.call(undefined, MANIFEST_ID)).toBe(RESOLVED_MANIFEST_ID);
      expect(resolveId.call(undefined, './something-else')).toBeUndefined();
    });

    it('reports the span across both payloads', () => {
      // bus covers 2025-07…09, rail 2025-08…09.
      expect(readManifest(plugin())).toMatchObject({
        minMonth: '2025-07',
        maxMonth: '2025-09',
        monthCount: 3,
      });
    });

    it('reports each payload’s byte length', () => {
      const manifest = readManifest(plugin());
      expect(manifest.busBytes).toBe(
        Buffer.byteLength(fixtureFile(BOTH, 'stop_ridership.bus.json'), 'utf8'),
      );
      expect(manifest.railBytes).toBe(
        Buffer.byteLength(
          fixtureFile(BOTH, 'stop_ridership.rail.json'),
          'utf8',
        ),
      );
    });

    it('emits both payloads as assets at the output root', () => {
      expect(emittedFiles(plugin()).map((file) => file.fileName)).toEqual([
        'stop-ridership.bus.json',
        'stop-ridership.rail.json',
      ]);
    });

    it('emits the file bytes verbatim — the payload arrives pre-encoded', () => {
      const emitted = emittedFiles(plugin());
      expect(emitted[0].source).toBe(
        fixtureFile(BOTH, 'stop_ridership.bus.json'),
      );
    });

    it('serves each payload from the dev middleware', () => {
      expect(request(plugin(), '/stop-ridership.rail.json')).toMatchObject({
        status: 'served',
        contentType: 'application/json',
      });
    });

    it('ignores the query string when matching the path', () => {
      expect(request(plugin(), '/stop-ridership.bus.json?t=1').status).toBe(
        'served',
      );
    });

    it('passes any other path through to the next middleware', () => {
      expect(request(plugin(), '/ridership.json').status).toBe(
        'passed-through',
      );
      expect(request(plugin(), '/index.html').status).toBe('passed-through');
    });
  });

  /**
   * The crux of this PR. The pipeline PR that writes these files has not merged, so
   * `src/data/stop_ridership.*.json` do not exist — and a fresh clone before the first
   * ingest is in exactly the same state. Absent is a supported state, not a failure.
   */
  describe('with the data files absent', () => {
    const plugin = () => stopRidershipPlugin({ dataDir: NO_DATA });

    it('reports zero coverage rather than throwing', () => {
      expect(readManifest(plugin())).toEqual({
        minMonth: null,
        maxMonth: null,
        monthCount: 0,
        busBytes: 0,
        railBytes: 0,
      });
    });

    it('emits nothing', () => {
      expect(emittedFiles(plugin())).toEqual([]);
    });

    it('passes the payload paths through, so the dev server 404s them', () => {
      expect(request(plugin(), '/stop-ridership.bus.json').status).toBe(
        'passed-through',
      );
      expect(request(plugin(), '/stop-ridership.rail.json').status).toBe(
        'passed-through',
      );
    });
  });

  describe('with only one payload present', () => {
    const plugin = () => stopRidershipPlugin({ dataDir: RAIL_ONLY });

    it('reports the present payload’s span and zero bytes for the absent one', () => {
      expect(readManifest(plugin())).toMatchObject({
        minMonth: '2026-01',
        maxMonth: '2026-01',
        monthCount: 1,
        busBytes: 0,
      });
      expect(readManifest(plugin()).railBytes).toBeGreaterThan(0);
    });

    it('emits only the payload it has', () => {
      expect(emittedFiles(plugin()).map((file) => file.fileName)).toEqual([
        'stop-ridership.rail.json',
      ]);
    });
  });

  /** Absent is a state; corrupt is a bug, and must stop the build rather than ship. */
  it('throws on a payload that is not columnar', () => {
    expect(() =>
      readManifest(stopRidershipPlugin({ dataDir: MALFORMED })),
    ).toThrow(/not a columnar stop payload/);
  });
});
