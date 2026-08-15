import type { Chart as ChartJS, Plugin } from 'chart.js';
import colors from 'tailwindcss/colors';

export interface HoverCrosshairOptions {
  /**
   * Month index to draw at, overriding the tooltip's own active element. Set
   * when the month came from the keyboard or from a pin — neither of which goes
   * through Chart.js's hover machinery, so neither shows up in
   * `tooltip.getActiveElements()`.
   */
  focusedIndex?: number | null;
  /** Draw solid rather than dashed, marking the month as pinned. */
  isPinned?: boolean;
}

function readOptions(chart: ChartJS): HoverCrosshairOptions {
  return (
    (chart.options.plugins as Record<string, HoverCrosshairOptions | undefined>)
      .hoverCrosshair ?? {}
  );
}

export const hoverCrosshairPlugin: Plugin<'line'> = {
  id: 'hoverCrosshair',
  afterDraw(chart) {
    const { focusedIndex, isPinned } = readOptions(chart);

    let x: number | undefined;
    if (focusedIndex !== null && focusedIndex !== undefined) {
      x = chart.scales.x.getPixelForValue(focusedIndex);
    } else {
      const active = chart.tooltip?.getActiveElements();
      if (!active?.length) return;
      x = active[0].element.x;
    }

    const {
      ctx,
      chartArea: { top, bottom },
    } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.stone['500'];
    ctx.setLineDash(isPinned ? [] : [4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};
