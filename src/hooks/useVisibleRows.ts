import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Which of a long list's rows have been scrolled into view. The stop table draws a
 * Chart.js sparkline per row across ~800 rows, so this reports which are worth mounting.
 *
 * One observer for the list, not one per row: 800 `IntersectionObserver` instances is a
 * worse problem than the one being solved.
 *
 * Add-only — a row once seen stays visible, because unmounting on scroll-away turns a
 * scroll into a construct/destroy treadmill of expensive Chart.js instances. It also makes
 * re-sorting a non-event, since the caller keys rows by the same string this hook does.
 */

export interface VisibleRows {
  /**
   * A `ref` callback for the row's observed element, cached per key: an inline arrow is a
   * new function every render, and React answers that with an unobserve/observe pair.
   */
  observe: (key: string) => (element: Element | null) => void;
  isVisible: (key: string) => boolean;
}

export interface UseVisibleRowsOptions {
  /** How far ahead of the scroller's edge to mount. */
  rootMargin?: string;
}

export function useVisibleRows(
  root: RefObject<Element | null>,
  { rootMargin = '200px 0px' }: UseVisibleRowsOptions = {},
): VisibleRows {
  const [visible, setVisible] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const keysByElement = useRef(new Map<Element, string>());
  const callbacks = useRef(new Map<string, (element: Element | null) => void>());
  const observer = useRef<IntersectionObserver | null>(null);

  // No IntersectionObserver means every row is visible. jsdom does not implement it, and
  // the fallback has to be a table that draws rather than one of blank cells.
  const supported =
    typeof window !== 'undefined' &&
    typeof window.IntersectionObserver === 'function';

  useEffect(() => {
    const scroller = root.current;
    if (!supported || !scroller) return;

    /*
     * `root` is the scroller, not the viewport. A viewport-rooted observer would report
     * the right rows, but `rootMargin` grows the root rect — the viewport, under
     * `root: null` — and not this table's clip, so the margin would buy nothing and every
     * sparkline would pop in exactly as it became visible.
     */
    const instance = new IntersectionObserver(
      (entries) => {
        const arrived: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = keysByElement.current.get(entry.target);
          if (key !== undefined) arrived.push(key);
        }
        if (arrived.length === 0) return;

        setVisible((previous) => {
          // A set rebuilt on every notification re-renders every row for nothing, so
          // bail when the batch adds nothing new.
          if (arrived.every((key) => previous.has(key))) return previous;
          const next = new Set(previous);
          for (const key of arrived) next.add(key);
          return next;
        });
      },
      { root: scroller, rootMargin },
    );

    observer.current = instance;
    for (const element of keysByElement.current.keys()) instance.observe(element);

    return () => {
      instance.disconnect();
      observer.current = null;
    };
  }, [supported, root, rootMargin]);

  const observe = useCallback((key: string) => {
    const existing = callbacks.current.get(key);
    if (existing) return existing;

    const callback = (element: Element | null): void => {
      if (element) {
        keysByElement.current.set(element, key);
        observer.current?.observe(element);
        return;
      }
      // The row is unmounting: drop every element still mapped to this key.
      for (const [known, mapped] of keysByElement.current)
        if (mapped === key) {
          observer.current?.unobserve(known);
          keysByElement.current.delete(known);
        }
    };

    callbacks.current.set(key, callback);
    return callback;
  }, []);

  const isVisible = useCallback(
    (key: string) => !supported || visible.has(key),
    [supported, visible],
  );

  return { observe, isVisible };
}
