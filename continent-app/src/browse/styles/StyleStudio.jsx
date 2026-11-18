import React from 'react';
import { createPortal } from 'react-dom';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { useSettings } from '../../components/SettingsLine.jsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { useDialogExit } from '../../lib/motion.js';
import { useI18n } from '../../i18n/index.jsx';
import { useStyleFigures, styleName } from './styleBits.jsx';
import { StyleOverview } from './StyleOverview.jsx';
import { StyleWizard } from './StyleWizard.jsx';
import { STEPS } from './studioSteps.js';
import '../../styles/79-style-studio.css';

/**
 * The Style Studio (G12, owner 2026-11-18): the one place a travel style is
 * seen, switched, made and changed. Every door (the corner disc, a price's
 * "where you sleep and eat", the planner, Explore's "Priced for") opens it
 * through `ts.setOpen`, and nothing else edits a style.
 *
 * Two views in one sheet: the overview (your styles as cards) and the
 * wizard (one question a step). The sheet is the house sheet's scaffold
 * (fsheet scrim, focus trap with Escape, the leave on --dur-2) with a head
 * of its own, because the wizard's head is a progress bar, not a title: a
 * full-height page on a phone, a 560 px dialog from 769 px.
 *
 *   <StyleStudio onClose={() => ts.setOpen(false)} />
 *
 * It reads `useSettings().travelStyles` and opens where `ts.open` says:
 * { view: 'overview' }, { view: 'create' } or { view: 'edit', id, step }.
 * Load it lazily: it carries Motion, which stays out of the first load.
 */
export function StyleStudio({ onClose }) {
  const app = useSettings();
  const ts = app?.travelStyles;
  const { t } = useI18n();
  const [view, setView] = React.useState(() => targetOf(ts?.open, ts));
  // A door pressed while the studio is open (the planner behind it, a
  // price) moves the studio there.
  const lastOpen = React.useRef(ts?.open);
  React.useEffect(() => {
    if (ts?.open && ts.open !== lastOpen.current) setView(targetOf(ts.open, ts));
    lastOpen.current = ts?.open;
  }, [ts?.open]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new door moves the view

  const destinations = app?.data?.destinations || null;
  const figures = useStyleFigures(ts?.list || [], destinations);
  const exit = useDialogExit(onClose);

  // Escape is one key with several meanings: an open card menu closes, a
  // changed draft asks first, otherwise the sheet leaves. The view in front
  // registers what it does with Escape here.
  const escRef = React.useRef(null);
  const panelRef = React.useRef(null);
  useFocusTrap(panelRef, () => { if (!escRef.current?.()) exit.close(); });

  // The phone's keyboard shrinks the visual viewport, not the layout one, so
  // the full-height sheet follows visualViewport and its foot stays above the
  // keys (iOS ignores dvh for the keyboard).
  React.useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const el = panelRef.current;
    if (!vv || !el) return undefined;
    const fit = () => el.style.setProperty('--sst-vvh', `${Math.round(vv.height)}px`);
    fit();
    vv.addEventListener('resize', fit);
    return () => vv.removeEventListener('resize', fit);
  }, []);

  // Done or Save lands on the overview with the style risen in and a short
  // status line, which then fades (4 s) so it never piles up.
  const [after, setAfter] = React.useState({ fresh: '', status: '' });
  React.useEffect(() => {
    if (!after.status) return undefined;
    const id = setTimeout(() => setAfter((a) => ({ ...a, status: '' })), 4000);
    return () => clearTimeout(id);
  }, [after.status]);

  if (!ts) return null;
  const editing = view.view === 'edit' ? ts.list.find((s) => s.id === view.id) : null;
  const wizard = view.view === 'create' || (view.view === 'edit' && editing);

  const done = (id, draft, how) => {
    const name = styleName(t, draft);
    const active = how === 'created' || id === ts.activeId;
    const status = !active ? t('studio.saved', { name })
      : how === 'saved' && ts.held ? t('studio.savedHeld', { name })
        : t('studio.nowPricing', { name });
    setAfter({ fresh: how === 'created' ? id : '', status });
    setView({ view: 'overview' });
  };

  return createPortal(
    <div
      className={`fsheet-scrim sst-scrim${exit.leaving ? ' is-leaving' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !escRef.current?.()) exit.close(); }}
    >
      <div
        ref={panelRef}
        className={`fsheet sst${wizard ? ' is-wizard' : ''}${exit.leaving ? ' is-leaving' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sst-title"
      >
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">
            {wizard ? (
              <StyleWizard
                key={view.view === 'edit' ? `e${view.id}` : 'create'}
                ts={ts}
                style={editing}
                startStep={view.step}
                destinations={destinations}
                meta={app?.data?.meta}
                escRef={escRef}
                onBack={() => setView({ view: 'overview' })}
                onClose={exit.close}
                onDone={done}
              />
            ) : (
              <StyleOverview
                ts={ts}
                figures={figures}
                fresh={after.fresh}
                escRef={escRef}
                onClose={exit.close}
                onCreate={() => { setAfter({ fresh: '', status: '' }); setView({ view: 'create' }); }}
                onEdit={(id) => { setAfter({ fresh: '', status: '' }); setView({ view: 'edit', id, step: 'name' }); }}
              />
            )}
          </MotionConfig>
        </LazyMotion>
        {/* One polite live region for the whole sheet, mounted from the
            start so the status line is announced when it arrives. */}
        <p className="sst-status" role="status">
          {after.status && !wizard ? <span className="sst-status-line">{after.status}</span> : null}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/** Where a `ts.open` value lands: the overview unless it names a create or
 *  an edit of a style that exists (a deleted style falls back). */
function targetOf(open, ts) {
  if (open && typeof open === 'object') {
    if (open.view === 'create') return { view: 'create' };
    if (open.view === 'edit' && ts?.list?.some((s) => s.id === open.id)) {
      return { view: 'edit', id: open.id, step: STEPS.includes(open.step) ? open.step : 'name' };
    }
  }
  return { view: 'overview' };
}
