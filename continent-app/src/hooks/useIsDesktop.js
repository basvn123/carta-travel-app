import { useEffect, useState } from 'react';

// The one width the whole app already splits on: below 769px the BottomNav
// owns navigation and every desktop-only surface folds away. Kept as a hook
// rather than a CSS-only rule because the Destinations and Explore tabs move
// their search field INTO the header on desktop (a portal), and a portal is a
// DOM decision CSS cannot make.
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
