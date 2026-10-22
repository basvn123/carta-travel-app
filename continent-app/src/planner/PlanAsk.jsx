import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { AskChatDoor } from '../browse/ask/AskChatButton.jsx';

/**
 * Ask Carta on the Plan start page (T558; T574): the door to the one chat
 * Explore hosts, so a question asked here joins the same conversations and
 * the same answers as everywhere else. On desktop the header carries the
 * same door; this one is the phone's way in, and the page's own.
 */
export function PlanAsk() {
  const { t } = useI18n();
  return <AskChatDoor t={t} className="ac-in-plan" />;
}
