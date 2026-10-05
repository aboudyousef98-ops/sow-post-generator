// Phone detection for the iPhone shell (design handoff 2026-10-06).
// ≤480px → the bottom-tab mobile app replaces the desktop layout.
// jsdom has no matchMedia, so tests and odd embedders default to desktop.

import { useEffect, useState } from 'react';

const QUERY = '(max-width: 480px)';

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return mobile;
}
