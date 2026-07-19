import { useEffect, useState } from 'react';

/** Matches Tailwind's `lg` breakpoint, which the old grid layout keyed on. */
const DESKTOP_QUERY = '(min-width: 1024px)';

const getMatches = (): boolean =>
  /* jsdom has no matchMedia (and the frozen test setup can't stub it); the
     desktop dock layout is the default there */
  typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_QUERY).matches
    : true;

/** True at or above the `lg` breakpoint; the dock only renders on desktop. */
export default function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(getMatches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mediaQuery.addEventListener('change', onChange);
    setIsDesktop(mediaQuery.matches);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
