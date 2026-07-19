import { describe, it, expect, vi } from 'vitest';
import LineSelectorPanel from './LineSelectorPanel';
import { makeDashboardValue, makeLine, renderWithDashboard } from './testUtils';
import type { UserDashboardInputState } from '../../hooks/useUserDashboardInput';
import type { Line } from '../../@types/lines.types';
import type { ConsolidatedRidership } from '../../@types/metrics.types';

interface CapturedProps {
  lines: Line[];
  ridershipByLine: ConsolidatedRidership;
  isExpanded: boolean;
  setIsExpanded: (next: boolean) => void;
  searchText: string;
}

let capturedProps: CapturedProps | undefined;

vi.mock('../../components/LineSelector', () => ({
  default: (props: CapturedProps) => {
    capturedProps = props;
    return <div data-testid="line-selector" />;
  },
}));

describe('LineSelectorPanel', () => {
  it('renders LineSelector with visibleLines and expansion state from context', () => {
    const visibleLines = [makeLine({ id: 801 })];
    const ridershipByLine: ConsolidatedRidership = {
      801: { selected: true, ridershipRecords: [] },
    };
    const setIsLineSelectorExpanded = vi.fn();
    const value = makeDashboardValue({
      userDashboardInputState: {
        searchText: 'foo',
        lines: [makeLine({ id: 801 }), makeLine({ id: 802 })],
      } as unknown as UserDashboardInputState,
      visibleLines,
      ridershipByLine,
      isLineSelectorExpanded: true,
      setIsLineSelectorExpanded,
    });

    renderWithDashboard(<LineSelectorPanel />, value);

    // `lines` must be the visible subset, overriding the spread input state
    expect(capturedProps?.lines).toBe(visibleLines);
    expect(capturedProps?.ridershipByLine).toBe(ridershipByLine);
    expect(capturedProps?.isExpanded).toBe(true);
    expect(capturedProps?.setIsExpanded).toBe(setIsLineSelectorExpanded);
    expect(capturedProps?.searchText).toBe('foo');
  });
});
