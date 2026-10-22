import React from 'react';
import { Button } from '../../components/ui/index.js';
import { SparkIcon } from '../../components/Icons.jsx';

/**
 * Ask Carta's one door (T570): a small button in the header on desktop and
 * beside Filters on a phone. The chat and everything behind it load on the
 * first press (AskChat.jsx) and close again with its own control. A seed
 * ({ text, n }, Home's question) opens it and asks at once.
 */
const AskChat = React.lazy(() => import('./AskChat.jsx'));

export function AskChatButton({ className = '', seed = null, openRequest = false, onOpenRequested, ...chat }) {
  const { t } = chat;
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  React.useEffect(() => {
    if (!openRequest && !seed?.text) return;
    setOpen(true);
    onOpenRequested?.();
  }, [openRequest, seed, onOpenRequested]);
  const close = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => btnRef.current?.focus());
  }, []);
  return (
    <>
      <Button ref={btnRef} variant="secondary" className={`ac-door ${className}`.trim()}
        iconStart={<SparkIcon size={18} />} aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}>
        {t('askChat.open')}
      </Button>
      {open && (
        <React.Suspense fallback={null}>
          <AskChat {...chat} seed={seed} onClose={close} />
        </React.Suspense>
      )}
    </>
  );
}
