import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { CountryFlag } from './CountryFlag.jsx';

/**
 * The app-language switch: a compact flag pill in the header that opens a
 * short list of supported languages, each with its SVG flag (CountryFlag -
 * the app never uses emoji). Only the UI chrome follows the choice; sight
 * names deliberately stay in their language of origin so they keep matching
 * street signs and Google Maps.
 */
export function LanguagePicker() {
  const { lang, setLang, t, languages } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on outside click / Escape (same manners as OriginPicker).
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = languages.find((l) => l.code === lang) || languages[0];

  return (
    <div className="lang-picker" ref={rootRef}>
      <button
        className="lang-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t('lang.pick')}
      >
        <CountryFlag country={current.flag} size={14} />
        <span className="lang-btn-code">{current.code.toUpperCase()}</span>
        <span className="lang-btn-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="lang-pop" role="listbox" aria-label={t('lang.pick')}>
          {languages.map((l) => (
            <button
              key={l.code}
              className={`lang-opt ${l.code === lang ? 'on' : ''}`}
              onClick={() => { setLang(l.code); setOpen(false); }}
              role="option"
              aria-selected={l.code === lang}
            >
              <CountryFlag country={l.flag} size={15} />
              <span className="lang-opt-label">{l.label}</span>
              {l.code === lang && <span className="lang-opt-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
