import React from 'react';
import { Button } from '../../components/ui/index.js';
import { SparkIcon } from '../../components/Icons.jsx';
import { openAskChat, closeAskChat, useAskChat } from './askChatStore.js';
import '../../styles/76-ask-door.css';

/**
 * Ask Carta's doors and its one host (T570, made app-wide by T574).
 *
 * AskChatDoor: a small "Ask Carta" button that opens (or closes) the one
 * chat, wherever it stands; its selected state follows the chat.
 *
 * AskChatHost: the chat itself, loaded on the first open (AskChat.jsx),
 * rendered once, by Explore. A seed ({ text, n }, Home's question) or an
 * open request opens it and asks at once.
 */
const AskChat = React.lazy(() => import('./AskChat.jsx'));

export function AskChatDoor({ t, className = '' }) {
  const { open } = useAskChat();
  return (
    <Button variant="secondary" className={`ac-door ${className}`.trim()}
      iconStart={<SparkIcon size={18} />} aria-expanded={open}
      onClick={(e) => (open ? closeAskChat() : openAskChat(e.currentTarget))}>
      {t('askChat.open')}
    </Button>
  );
}

export function AskChatHost({ seed = null, openRequest = false, onOpenRequested, ...chat }) {
  const { open, seed: storeSeed } = useAskChat();
  React.useEffect(() => {
    if (!openRequest && !seed?.text) return;
    openAskChat(null, seed);
    onOpenRequested?.();
  }, [openRequest, seed, onOpenRequested]);
  if (!open) return null;
  return (
    <React.Suspense fallback={null}>
      <AskChat {...chat} seed={storeSeed} onClose={closeAskChat} />
    </React.Suspense>
  );
}
