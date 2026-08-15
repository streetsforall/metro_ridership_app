import { describe, it, expect } from 'vitest';
import {
  panelSizeToParam,
  parsePanelSize,
  parseSummarySplit,
  summarySplitToParam,
} from './panelSizes';

describe('parsePanelSize', () => {
  it('reads the small step', () => {
    expect(parsePanelSize('s')).toBe('small');
  });

  it('reads the large step', () => {
    expect(parsePanelSize('l')).toBe('large');
  });

  it('falls back to standard when the param is absent', () => {
    expect(parsePanelSize(null)).toBe('standard');
  });

  it('falls back to standard for an unrecognised value rather than throwing', () => {
    expect(parsePanelSize('xl')).toBe('standard');
  });

  it('falls back to standard for an empty value', () => {
    expect(parsePanelSize('')).toBe('standard');
  });
});

describe('panelSizeToParam', () => {
  it('writes nothing for the default step', () => {
    expect(panelSizeToParam('standard')).toBeNull();
  });

  it('round-trips small', () => {
    expect(parsePanelSize(panelSizeToParam('small'))).toBe('small');
  });

  it('round-trips large', () => {
    expect(parsePanelSize(panelSizeToParam('large'))).toBe('large');
  });
});

describe('parseSummarySplit', () => {
  it('reads an even split', () => {
    expect(parseSummarySplit('50')).toBe(50);
  });

  it('reads a map-heavy split', () => {
    expect(parseSummarySplit('30')).toBe(30);
  });

  it('falls back to 40 when the param is absent', () => {
    expect(parseSummarySplit(null)).toBe(40);
  });

  /** `Number('')` is 0 and `Number('abc')` is NaN — neither is a split. */
  it('falls back to 40 for an empty value', () => {
    expect(parseSummarySplit('')).toBe(40);
  });

  it('falls back to 40 for a non-numeric value', () => {
    expect(parseSummarySplit('half')).toBe(40);
  });

  it('falls back to 40 for a number that is not one of the three steps', () => {
    expect(parseSummarySplit('45')).toBe(40);
  });
});

describe('summarySplitToParam', () => {
  it('writes nothing for the default split', () => {
    expect(summarySplitToParam(40)).toBeNull();
  });

  it('round-trips an even split', () => {
    expect(parseSummarySplit(summarySplitToParam(50))).toBe(50);
  });

  it('round-trips a map-heavy split', () => {
    expect(parseSummarySplit(summarySplitToParam(30))).toBe(30);
  });
});
