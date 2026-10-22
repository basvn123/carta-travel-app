import React from 'react';
import { Button, IconButton } from '../components/ui/index.js';
import { CloseIcon, SparkIcon } from '../components/Icons.jsx';

/**
 * Ask Carta's bar on Explore (T568): a real field under the filter chips,
 * not a button dressed as one. The question is typed here and asked at
 * once; the answer opens in the panel (AskSearchFull). Under the field, a
 * few questions to ask, the first ones built from the places the list
 * shows now, so they follow the filters. "/" anywhere on the page puts the
 * caret in the field.
 *
 *   asked        the question the panel has answered ('' for none)
 *   places       city names at the top of the list now, for the suggestions
 *   onAsk(q)     ask q ('' opens the panel with nothing asked)
 *   onOpen()     open the panel on its answer
 *   ref          the field (the form), which the panel hangs from
 *   onClear()    forget the question and its answer
 */
const EXAMPLES = ['ask.ex.budget', 'ask.ex.warm', 'ask.ex.hike', 'ask.ex.nocar'];

function askSuggestions(t, places = []) {
  const [a, b] = places;
  const out = [];
  if (a && b) out.push(t('ask.sug.compare', { a, b }));
  if (a) out.push(t('ask.sug.when', { place: a }));
  for (const k of EXAMPLES) if (out.length < 4) out.push(t(k));
  return out;
}

export const AskBar = React.forwardRef(function AskBar(
  { t, asked = '', places = [], onAsk, onOpen, onClear },
  ref,
) {
  const [text, setText] = React.useState(asked);
  React.useEffect(() => { setText(asked); }, [asked]);
  const inputRef = React.useRef(null);

  // "/" puts the caret in the field, unless the reader is typing elsewhere.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const input = inputRef.current;
      if (!input || !input.offsetParent) return;
      e.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const q = text.trim();
  const answered = asked && q === asked.trim();
  const submit = (e) => {
    e.preventDefault();
    if (answered) onOpen?.();
    else onAsk?.(q);
  };
  const clear = () => {
    setText('');
    if (asked) onClear?.();
    inputRef.current?.focus();
  };
  const sugs = askSuggestions(t, places);

  return (
    <div className={`ask-bar${text ? ' has-text' : ''}`}>
      {/* The ref is the field, so the answer panel hangs from it. */}
      <form ref={ref} className="ask-bar-field" role="search" onSubmit={submit}>
        <label className="ask-bar-label" htmlFor="ask-bar-input">
          <SparkIcon size={18} />
          <span>{t('ask.title')}</span>
        </label>
        <input
          ref={inputRef}
          id="ask-bar-input"
          className="ask-bar-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('ask.barPlaceholder')}
          autoComplete="off"
          enterKeyHint="search"
          aria-keyshortcuts="/"
        />
        {text ? (
          <IconButton label={t('ask.clearAria')} className="ask-bar-clear" onClick={clear}>
            <CloseIcon size={16} />
          </IconButton>
        ) : (
          <kbd className="ask-bar-kbd" aria-hidden="true">/</kbd>
        )}
        <Button type="submit" variant={q && !answered ? 'primary' : 'secondary'} className="ask-bar-go"
          aria-haspopup="dialog">
          {answered ? t('ask.seeAnswer') : t('ask.go')}
        </Button>
      </form>
      <ul className="ask-bar-sugs" aria-label={t('ask.tryOne')}>
        {sugs.map((s) => (
          <li key={s}>
            <Button size="sm" variant="secondary" className="ask-bar-sug" onClick={() => { setText(s); onAsk?.(s); }}>
              {s}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
});
