import { useEffect, useState } from 'react';

// The one width the whole app already splits on: below 769px the BottomNav
// owns navigation and every desktop-only surface folds away. Kept as a hook
// rather than a CSS-only rule because both browse tabs move their search
// field on desktop and where a node LIVES is a DOM decision CSS cannot make:
// Explore portals its field into the header, Destinations renders its one
// field at the head of its column instead of inside the toolbar card.
const QUERY = '(min-width: 769px)';

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}
