import { describe, it, expect } from 'vitest';
import { signedChange } from '../signedChange';

describe('signedChange', () => {
  it('leads a gain with a plus and paints it green', () => {
    expect(signedChange(1000)).toEqual({
      text: '+1,000',
      className: 'text-green-600',
    });
  });

  it('keeps a loss’s own minus and paints it red', () => {
    expect(signedChange(-200)).toEqual({
      text: '-200',
      className: 'text-red-600',
    });
  });

  it('leaves zero uncoloured, because it is neither a gain nor a loss', () => {
    expect(signedChange(0)).toEqual({ text: '0', className: '' });
  });

  /**
   * `Math.round(-0.2)` is `-0`, which a caller rounding a stop's average will hand
   * straight over. It is not a loss, and it must not print as one.
   */
  it('draws negative zero as zero rather than as -0', () => {
    expect(signedChange(-0)).toEqual({ text: '0', className: '' });
  });

  it('groups thousands on both signs', () => {
    expect(signedChange(1234567).text).toBe('+1,234,567');
    expect(signedChange(-1234567).text).toBe('-1,234,567');
  });
});
