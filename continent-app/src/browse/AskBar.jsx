import React from 'react';
import { Button, IconButton } from '../components/ui/index.js';
import { CloseIcon, SparkIcon } from '../components/Icons.jsx';
import { prefersReducedMotion } from '../lib/motion.js';

/**
 * Ask Carta's bar on Explore (T568): a real field under the filter chips,
 * not a button dressed as one. The question is typed here and asked at
 * once; the answer opens in the panel (AskSearchFull). Under the field, a
 * few questions to ask, the first ones built from the places the list
 * shows now, so they follow the filters. "/" anywhere on the page puts the
 * caret in the field. While the field is empty and idle it types those same
 * questions out and erases them, one after another (T569, the owner: no
 * placeholder, some animation); a focus, a typed letter, a hidden tab, the
 * bar out of view or reduced motion stops it.
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

// Milliseconds a letter types and erases in, and how long a whole question
// holds before it goes.
const TYPE_MS = 45;
const ERASE_MS = 18;
const HOLD_MS = 1800;

/** The questions, typed out and erased in turn while `on`; '' when off. */
function useTypedHint(lines, on, boxRef) {
  const [shown, setShown] = React.useState('');
  const key = lines.join('|');
  React.useEffect(() => {
    if (!on || !lines.length || prefersReducedMotion()) { setShown(''); return undefined; }
    let line = 0;
    let n = 0;
    let erasing = false;
    let timer = 0;
    let visible = true;
    const tick = () => {
      if (!visible || document.hidden) { timer = setTimeout(tick, 400); return; }
      const full = lines[line];
      if (!erasing) {
        n += 1;
        setShown(full.slice(0, n));
        if (n >= full.length) { erasing = true; timer = setTimeout(tick, HOLD_MS); return; }
        timer = setTimeout(tick, TYPE_MS);
      } else {
        n -= 1;
        setShown(full.slice(0, Math.max(0, n)));
        if (n <= 0) { erasing = false; line = (line + 1) % lines.length; timer = setTimeout(tick, TYPE_MS * 8); return; }
        timer = setTimeout(tick, ERASE_MS);
      }
    };
    const io = typeof IntersectionObserver === 'function' && boxRef.current
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; })
      : null;
    if (io) io.observe(boxRef.current);
    timer = setTimeout(tick, 600);
    return () => { clearTimeout(timer); io?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the lines
  }, [key, on, boxRef]);
  return shown;
}

export const AskBar = React.forwardRef(function AskBar(
  { t, asked = '', places = [], onAsk, onOpen, onClear },
  ref,
) {
  const [text, setText] = React.useState(asked);
  React.useEffect(() => { setText(asked); }, [asked]);
  const inputRef = React.useRef(null);
  const boxRef = React.useRef(null);
  const [focused, setFocused] = React.useState(false);

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
  const hint = useTypedHint(sugs, !text && !focused, boxRef);

  return (
    <div className={`ask-bar${text ? ' has-text' : ''}`} ref={boxRef}>
      {/* The ref is the field, so the answer panel hangs from it. */}
      <form ref={ref} className="ask-bar-field" role="search" onSubmit={submit}>
        <label className="ask-bar-label" htmlFor="ask-bar-input">
          <SparkIcon size={18} />
          <span>{t('ask.title')}</span>
        </label>
        <span className="ask-bar-input-wrap">
        {/* The typed hint: drawn, not read (the label names the field). */}
        {hint && <span className="ask-bar-hint" aria-hidden="true">{hint}<span className="ask-bar-caret" /></span>}
        <input
          ref={inputRef}
          id="ask-bar-input"
          className="ask-bar-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="off"
          enterKeyHint="search"
          aria-keyshortcuts="/"
        />
        </span>
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
