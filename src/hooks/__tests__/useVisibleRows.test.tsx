import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVisibleRows } from '../useVisibleRows';

/** Nothing scrolls in jsdom, so the observer is stubbed and driven by hand. */

let notify: IntersectionObserverCallback;
let constructedWith: IntersectionObserverInit | undefined;
const observed: Element[] = [];
const unobserved: Element[] = [];
const disconnected = vi.fn();

const stubObserver = (): void => {
  observed.length = 0;
  unobserved.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      root = null;
      rootMargin = '';
      thresholds: number[] = [];
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        notify = callback;
        constructedWith = options;
      }
      observe(element: Element) {
        observed.push(element);
      }
      unobserve(element: Element) {
        unobserved.push(element);
      }
      disconnect() {
        disconnected();
      }
      takeRecords() {
        return [];
      }
    },
  );
};

/** A hook instance whose root is a real detached element. */
const renderWithRoot = () => {
  const root: { current: HTMLDivElement | null } = {
    current: document.createElement('div'),
  };
  const view = renderHook(() => useVisibleRows(root));
  return { ...view, root };
};

/** Only the two fields the hook reads; the rest of the entry is never touched. */
const entry = (target: Element, isIntersecting: boolean) =>
  ({ target, isIntersecting }) as unknown as IntersectionObserverEntry;

const report = (target: Element, isIntersecting: boolean): void => {
  act(() => {
    notify([entry(target, isIntersecting)], {} as IntersectionObserver);
  });
};

const intersect = (target: Element): void => {
  report(target, true);
};

afterEach(() => {
  vi.unstubAllGlobals();
  disconnected.mockClear();
});

describe('useVisibleRows', () => {
  /** Without the API the fallback has to be a table that draws, not one of blank cells. */
  it('reports every row visible when IntersectionObserver is unavailable', () => {
    const root = { current: document.createElement('div') };
    const { result } = renderHook(() => useVisibleRows(root));

    expect(result.current.isVisible('anything')).toBe(true);
  });

  it('starts with nothing visible when the observer exists', () => {
    stubObserver();
    const { result } = renderWithRoot();

    expect(result.current.isVisible('a')).toBe(false);
  });

  /** The whole reason the scroller is passed in: `rootMargin` grows the *root* rect. */
  it('observes against the scroller it was given, with a margin', () => {
    stubObserver();
    const { root } = renderWithRoot();

    expect(constructedWith?.root).toBe(root.current);
    expect(constructedWith?.rootMargin).toBe('200px 0px');
  });

  it('marks a row visible once its element intersects', () => {
    stubObserver();
    const { result } = renderWithRoot();

    const cell = document.createElement('td');
    act(() => {
      result.current.observe('a')(cell);
    });
    intersect(cell);

    expect(result.current.isVisible('a')).toBe(true);
  });

  /** Add-only: unmount-on-scroll-away would be a construct/destroy treadmill. */
  it('keeps a row visible after it stops intersecting', () => {
    stubObserver();
    const { result } = renderWithRoot();

    const cell = document.createElement('td');
    act(() => {
      result.current.observe('a')(cell);
    });
    intersect(cell);

    report(cell, false);

    expect(result.current.isVisible('a')).toBe(true);
  });

  it('leaves other rows alone', () => {
    stubObserver();
    const { result } = renderWithRoot();

    const first = document.createElement('td');
    const second = document.createElement('td');
    act(() => {
      result.current.observe('a')(first);
      result.current.observe('b')(second);
    });
    intersect(first);

    expect(result.current.isVisible('a')).toBe(true);
    expect(result.current.isVisible('b')).toBe(false);
  });

  /** An inline arrow would cost an unobserve/observe pair per row per render. */
  it('hands back the same ref callback for a key', () => {
    stubObserver();
    const { result, rerender } = renderWithRoot();

    const first = result.current.observe('a');
    rerender();

    expect(result.current.observe('a')).toBe(first);
  });

  it('unobserves an element when its row unmounts', () => {
    stubObserver();
    const { result } = renderWithRoot();

    const cell = document.createElement('td');
    act(() => {
      result.current.observe('a')(cell);
      result.current.observe('a')(null);
    });

    expect(unobserved).toContain(cell);
  });

  it('disconnects on unmount', () => {
    stubObserver();
    const { unmount } = renderWithRoot();

    unmount();

    expect(disconnected).toHaveBeenCalled();
  });
});
