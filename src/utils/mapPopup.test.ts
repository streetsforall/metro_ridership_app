import { describe, it, expect } from 'vitest';
import { buildPopupHTML } from './mapPopup';
import type { Line } from '../@types/lines.types';

const makeLine = (overrides: Partial<Line> = {}): Line => ({
  id: 801,
  name: 'A Line',
  mode: 'Rail',
  provider: 'DO',
  selected: true,
  visible: true,
  ...overrides,
});

describe('buildPopupHTML', () => {
  it('always includes the line name in bold', () => {
    expect(buildPopupHTML('A Line')).toContain('<strong>A Line</strong>');
  });

  it('renders no table when line data is absent', () => {
    expect(buildPopupHTML('A Line')).not.toContain('<table>');
  });

  it('renders no table when line has no metrics', () => {
    const line = makeLine({ distanceMiles: undefined, averageRidership: undefined, ridersPerMile: undefined });
    expect(buildPopupHTML('A Line', line)).not.toContain('<table>');
  });

  it('includes a Miles row when distanceMiles is present', () => {
    const html = buildPopupHTML('A Line', makeLine({ distanceMiles: 22.3 }));
    expect(html).toContain('Miles');
    expect(html).toContain('22.3');
  });

  it('includes an Avg. Riders row with formatted number when averageRidership is present', () => {
    const html = buildPopupHTML('A Line', makeLine({ averageRidership: 15234 }));
    expect(html).toContain('Avg. Riders');
    expect(html).toContain('15,234');
  });

  it('rounds averageRidership before formatting', () => {
    const html = buildPopupHTML('A Line', makeLine({ averageRidership: 15234.7 }));
    expect(html).toContain('15,235');
  });

  it('includes a Riders/Mile row with formatted number when ridersPerMile is present', () => {
    const html = buildPopupHTML('A Line', makeLine({ ridersPerMile: 684 }));
    expect(html).toContain('Riders/Mile');
    expect(html).toContain('684');
  });

  it('omits Miles row when distanceMiles is absent', () => {
    const html = buildPopupHTML('A Line', makeLine({ averageRidership: 5000 }));
    expect(html).not.toContain('Miles');
  });

  it('omits Avg. Riders row when averageRidership is absent', () => {
    const html = buildPopupHTML('A Line', makeLine({ distanceMiles: 10 }));
    expect(html).not.toContain('Avg. Riders');
  });

  it('omits Riders/Mile row when ridersPerMile is absent', () => {
    const html = buildPopupHTML('A Line', makeLine({ averageRidership: 5000 }));
    expect(html).not.toContain('Riders/Mile');
  });

  it('renders all three rows when all metrics are present', () => {
    const html = buildPopupHTML('A Line', makeLine({
      distanceMiles: 22.3,
      averageRidership: 15000,
      ridersPerMile: 673,
    }));
    expect(html).toContain('Miles');
    expect(html).toContain('Avg. Riders');
    expect(html).toContain('Riders/Mile');
  });

  it('applies map-popup-value class to value cells', () => {
    const html = buildPopupHTML('A Line', makeLine({ distanceMiles: 10 }));
    expect(html).toContain('class="map-popup-value"');
  });
});
