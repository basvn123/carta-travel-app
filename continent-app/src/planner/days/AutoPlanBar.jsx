import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { SparkIcon, CheckIcon, CloseIcon } from '../../components/Icons.jsx';
import './AutoPlanBar.css';

// The bot's failure codes, said the way its own form says them.
const FAIL_KEY = {
  auth: 'ai.signIn', no_auth_config: 'ai.signIn', user_cap: 'ai.quotaUser',
  global_cap: 'ai.quotaGlobal', no_ai: 'ai.unavailable', too_few: 'ai.tooFew',
};
const RETRYABLE = new Set(['ai_busy', 'ai_timeout', 'ai_error', 'network', 'ai_bad_output']);

/**
 * "Let Carta plan them" at work (T823, owner 2026-10-29: every day, one by
 * one). One bar over the day planner: which day Carta is on, a way to stop,
 * and at the end how many days it planned. A failure says how far it got,
 * why, and offers the rest again (a passing hiccup) or the Trip Pass (the
 * traveller's allowance is spent). aria-live so the progress is heard.
 */
export function AutoPlanBar({ queue, city, onStop, onResume, onPass, onClose }) {
  const { t } = useI18n();
  const of = queue.list.length;
  const at = Math.min(queue.i + 1, of);
  let text;
  let tone = 'run';
  if (queue.phase === 'run') {
    text = t('tp.auto.running', { n: at, total: of, city });
  } else if (queue.phase === 'done') {
    tone = 'done';
    text = of === 0 ? t('tp.auto.none') : t(queue.planned === 1 ? 'tp.auto.doneOne' : 'tp.auto.done', { n: queue.planned });
    // A town with too few places left for one more day: said, not skipped quietly.
    if (queue.skipped > 0) text = `${text} ${t(queue.skipped === 1 ? 'tp.auto.skippedOne' : 'tp.auto.skipped', { n: queue.skipped })}`;
  } else if (queue.phase === 'stopped') {
    tone = 'still';
    text = t('tp.auto.stopped', { n: queue.planned, total: of });
  } else {
    tone = 'fail';
    text = `${t('tp.auto.failed', { n: queue.planned, total: of })} ${t(FAIL_KEY[queue.code] || 'ai.error')}`;
  }
  const canResume = queue.phase === 'stopped' || (queue.phase === 'fail' && RETRYABLE.has(queue.code));
  return (
    <div className={`autoplan is-${tone}`} role="status" aria-live="polite" data-testid="autoplan">
      <span className="autoplan-icon" aria-hidden="true">
        {tone === 'done' ? <CheckIcon size={18} /> : <SparkIcon size={18} />}
      </span>
      <span className="autoplan-text">{text}</span>
      {queue.phase === 'run' && of > 0 && (
        <span className="autoplan-meter" aria-hidden="true">
          <span style={{ width: `${Math.round((queue.i / of) * 100)}%` }} />
        </span>
      )}
      <span className="autoplan-acts">
        {queue.phase === 'run' && <Button size="sm" variant="secondary" onClick={onStop}>{t('tp.auto.stop')}</Button>}
        {canResume && <Button size="sm" variant="primary" onClick={onResume}>{t('tp.auto.resume')}</Button>}
        {queue.phase === 'fail' && queue.code === 'user_cap' && (
          <Button size="sm" variant="primary" onClick={onPass}>{t('tp.auto.pass')}</Button>
        )}
        {queue.phase !== 'run' && (
          <button type="button" className="autoplan-close" onClick={onClose} aria-label={t('a11y.dismiss')}>
            <CloseIcon size={18} />
          </button>
        )}
      </span>
    </div>
  );
}
