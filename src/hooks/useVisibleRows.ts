import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Which of a long list's rows have been scrolled into view, so the table mounts only the
 * sparklines worth drawing — add-only, because unmounting on scroll-away thrashes Chart.js.
 */

export interface VisibleRows {
  /** A `ref` callback per row, cached because a fresh one costs an unobserve/observe pair. */
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

  // No IntersectionObserver — jsdom, mostly — means every row counts as visible.
  const supported =
    typeof window !== 'undefined' &&
    typeof window.IntersectionObserver === 'function';

  useEffect(() => {
    const scroller = root.current;
    if (!supported || !scroller) return;

    /* `root` is the scroller, because `rootMargin` grows the root rect and the viewport's
       is the wrong one to grow. */
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
          // Bail when the batch adds nothing new, or every row re-renders for nothing.
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
