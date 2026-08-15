import { describe, it, expect, vi } from 'vitest';
import { hoverCrosshairPlugin } from '../hoverCrosshair';

// Called as a method on the plugin object, not extracted from it, so the
// unbound-method rule stays satisfied.
type AfterDraw = (chart: unknown, args: unknown, opts: unknown) => void;
const plugin = hoverCrosshairPlugin as unknown as { afterDraw: AfterDraw };
const afterDraw: AfterDraw = (chart, args, opts) =>
  plugin.afterDraw(chart, args, opts);

const makeChart = ({
  activeX,
  focusedIndex = null,
  isPinned = false,
}: {
  activeX?: number;
  focusedIndex?: number | null;
  isPinned?: boolean;
}) => ({
  options: { plugins: { hoverCrosshair: { focusedIndex, isPinned } } },
  tooltip: {
    getActiveElements: () =>
      activeX === undefined ? [] : [{ element: { x: activeX } }],
  },
  scales: { x: { getPixelForValue: (i: number) => 50 + i * 25 } },
  ctx: {
    save: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    lineWidth: 0,
    strokeStyle: '',
  },
  chartArea: { top: 10, bottom: 200 },
});

describe('hoverCrosshair', () => {
  it('draws a vertical line at the hovered x position', () => {
    const chart = makeChart({ activeX: 100 });
    afterDraw(chart, {}, {});
    expect(chart.ctx.moveTo).toHaveBeenCalledWith(100, 10);
    expect(chart.ctx.lineTo).toHaveBeenCalledWith(100, 200);
    expect(chart.ctx.stroke).toHaveBeenCalledOnce();
  });

  it('does nothing when no tooltip elements are active', () => {
    const chart = makeChart({});
    afterDraw(chart, {}, {});
    expect(chart.ctx.beginPath).not.toHaveBeenCalled();
    expect(chart.ctx.stroke).not.toHaveBeenCalled();
  });

  it('dashes the line for a hovered month', () => {
    const chart = makeChart({ activeX: 100 });
    afterDraw(chart, {}, {});
    expect(chart.ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
  });

  /**
   * Keyboard focus and pins never touch Chart.js's hover machinery, so they do
   * not appear in `getActiveElements()`. Without the override the crosshair
   * would sit on the last hovered month while the tooltip described another.
   */
  it('draws at the focused index when one is given', () => {
    const chart = makeChart({ focusedIndex: 4 });
    afterDraw(chart, {}, {});
    expect(chart.ctx.moveTo).toHaveBeenCalledWith(150, 10);
  });

  it('prefers the focused index over the hovered element', () => {
    const chart = makeChart({ activeX: 100, focusedIndex: 4 });
    afterDraw(chart, {}, {});
    expect(chart.ctx.moveTo).toHaveBeenCalledWith(150, 10);
  });

  it('draws index 0 rather than falling through to the hover path', () => {
    const chart = makeChart({ activeX: 300, focusedIndex: 0 });
    afterDraw(chart, {}, {});
    expect(chart.ctx.moveTo).toHaveBeenCalledWith(50, 10);
  });

  it('draws a solid line for a pinned month', () => {
    const chart = makeChart({ focusedIndex: 4, isPinned: true });
    afterDraw(chart, {}, {});
    expect(chart.ctx.setLineDash).toHaveBeenCalledWith([]);
  });
});
