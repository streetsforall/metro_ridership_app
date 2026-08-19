import { describe, it, expect } from 'vitest';
import { buildPopupHTML, buildStopPopupHTML } from '../mapPopup';
import { makeLineReadout, makeStopPlace } from '../../test/builders';
import type { StopReadout } from '../../stops';

describe('buildPopupHTML', () => {
  it('always includes the line name in bold', () => {
    expect(buildPopupHTML('A Line')).toContain('<strong>A Line</strong>');
  });

  it('renders no table when line data is absent', () => {
    expect(buildPopupHTML('A Line')).not.toContain('<table>');
  });

  it('renders no table when line has no metrics', () => {
    const line = makeLineReadout({ distanceMiles: undefined, averageRidership: undefined, ridersPerMile: undefined });
    expect(buildPopupHTML('A Line', line)).not.toContain('<table>');
  });

  it('includes a Miles row when distanceMiles is present', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({ distanceMiles: 22.3 }));
    expect(html).toContain('Miles');
    expect(html).toContain('22.3');
  });

  it('includes an Avg. Riders row with formatted number when averageRidership is present', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({ averageRidership: 15234 }));
    expect(html).toContain('Avg. Riders');
    expect(html).toContain('15,234');
  });

  it('rounds averageRidership before formatting', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({ averageRidership: 15234.7 }));
    expect(html).toContain('15,235');
  });

  it('includes a Riders/Mile row with formatted number when ridersPerMile is present', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({ ridersPerMile: 684 }));
    expect(html).toContain('Riders/Mile');
    expect(html).toContain('684');
  });

  it('omits Miles row when distanceMiles is absent', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({ averageRidership: 5000 }));
    expect(html).not.toContain('Miles');
  });

  it('omits Avg. Riders row when averageRidership is absent', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({ distanceMiles: 10 }));
    expect(html).not.toContain('Avg. Riders');
  });

  it('omits Riders/Mile row when ridersPerMile is absent', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({ averageRidership: 5000 }));
    expect(html).not.toContain('Riders/Mile');
  });

  it('renders all three rows when all metrics are present', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({
      distanceMiles: 22.3,
      averageRidership: 15000,
      ridersPerMile: 673,
    }));
    expect(html).toContain('Miles');
    expect(html).toContain('Avg. Riders');
    expect(html).toContain('Riders/Mile');
  });

  it('applies map-popup-value class to value cells', () => {
    const html = buildPopupHTML('A Line', makeLineReadout({ distanceMiles: 10 }));
    expect(html).toContain('class="map-popup-value"');
  });
});

describe('buildStopPopupHTML', () => {
  const makeStopReadout = (
    overrides: Partial<StopReadout> = {},
  ): StopReadout => ({
    ...makeStopPlace(),
    line_name: 204,
    measuredAverage: 1000,
    shareOfLine: 0.125,
    averageBoardings: 1000,
    averageAlightings: 900,
    netAverage: 100,
    monthsReported: 12,
    ...overrides,
  });

  it('leads with the stop name', () => {
    expect(buildStopPopupHTML(makeStopReadout(), 'Line 204')).toContain(
      '<strong>Vermont / Wilshire</strong>',
    );
  });

  it('names the line the figures are measured on', () => {
    const html = buildStopPopupHTML(makeStopReadout(), 'Line 204');
    expect(html).toContain('<div class="map-popup-sub">Line 204</div>');
  });

  /**
   * The vocabulary check. `CONTEXT.md` registers Boardings and Alightings and lists
   * ons/offs under *avoid*; this popup is UI copy, so the wire's own abbreviations
   * must not reach it.
   */
  it('says Boardings and Alightings, never ons or offs', () => {
    const html = buildStopPopupHTML(makeStopReadout(), 'Line 204');
    expect(html).toContain('Avg. Boardings');
    expect(html).toContain('Avg. Alightings');
    expect(html).not.toMatch(/\bons\b|\boffs\b/i);
  });

  it('rounds and groups the figures like the line popup does', () => {
    const html = buildStopPopupHTML(
      makeStopReadout({ averageBoardings: 15234.7 }),
      'Line 204',
    );
    expect(html).toContain('15,235');
  });

  it('renders the share of line as a percentage', () => {
    const html = buildStopPopupHTML(
      makeStopReadout({ shareOfLine: 0.0824 }),
      'Line 204',
    );
    expect(html).toContain('8.2%');
  });

  it('omits a figure that is absent rather than printing a zero', () => {
    const html = buildStopPopupHTML(
      makeStopReadout({ shareOfLine: undefined }),
      'Line 204',
    );
    expect(html).not.toContain('Share of line');
  });

  it('renders no table for a readout with no figures at all', () => {
    const html = buildStopPopupHTML(
      makeStopReadout({
        averageBoardings: undefined,
        averageAlightings: undefined,
        shareOfLine: undefined,
      }),
      'Line 204',
    );
    expect(html).not.toContain('<table>');
    expect(html).toContain('<strong>Vermont / Wilshire</strong>');
  });
});
