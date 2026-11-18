import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { HeartIcon } from '../../components/Icons.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { startPlace } from '../../lib/settings/index.js';
import { formatMoney } from '../../lib/money.js';
import { useStyleFigures, styleName } from '../styles/styleBits.jsx';
import { wayIcon, PricesIcon } from './settingsBits.jsx';

/**
 * The overview (G12 Settings): five rows, in this order, each a door to its
 * step; the Style row opens the Style Studio. Every value is the model's
 * own full text (settingsSummary), never shortened: the overview has the
 * room the band does not. Start says the place alone, under its label.
 */
export function SettingsOverview({ model, focusRow, onOpen, onStyle }) {
  const { t } = useI18n();
  const sum = model.summary(t);
  const ts = model.ts;
  const style = ts?.active || null;
  const figures = useStyleFigures(style ? [style] : [], model.data?.destinations || null);
  const fig = style ? figures.get(style.id) : null;
  const held = Boolean(style && (ts?.changed || ts?.held));
  const place = startPlace(model.m, model.data);

  // Back from a step: focus lands on the row it came from.
  const listRef = React.useRef(null);
  React.useEffect(() => {
    if (!focusRow) return;
    listRef.current?.querySelector(`[data-row="${focusRow}"]`)?.focus();
  }, [focusRow]);

  const rows = [
    { key: 'start', // A country is a flag post, a town or here a pin, as on the chip.
      icon: model.start.kind === 'country' ? HouseIcon.from : HouseIcon.pin, label: t('settings.sheet.row.start'),
      value: place || t('settingsSum.startNone') },
    { key: 'when', icon: HouseIcon.calendar, label: t('settings.sheet.row.when'), value: sum.get('when')?.text },
    { key: 'way', icon: wayIcon(model.way.mode), label: t('settings.sheet.row.way'), value: sum.get('way')?.text },
    { key: 'style', icon: HeartIcon, label: t('settings.sheet.row.style'),
      value: style ? styleName(t, style) : t('settingsSum.styleNone'),
      sub: style && Number.isFinite(fig) ? t('settings.sheet.styleDay', { amount: formatMoney(fig) }) : '',
      held },
    { key: 'prices', icon: PricesIcon, label: t('settings.sheet.row.prices'), value: sum.get('prices')?.text },
  ];

  return (
    <ul className="set-rows" ref={listRef}>
      {rows.map((r) => {
        const Icon = r.icon;
        const said = [r.value, r.sub, r.held ? t('studio.heldTitle') : ''].filter(Boolean).join(', ');
        return (
          <li key={r.key}>
            <Pressable
              data-row={r.key}
              className={`set-row set-row-${r.key}`}
              aria-label={t('settings.changeAria', { label: r.label, value: said })}
              onClick={() => (r.key === 'style' ? onStyle() : onOpen(r.key))}
            >
              <span className="set-row-ic" aria-hidden="true"><Icon size={22} /></span>
              <span className="set-row-text">
                <span className="set-row-label">{r.label}</span>
                <span className="set-row-value">{r.value}</span>
                {r.sub && <span className="set-row-sub">{r.sub}</span>}
                {r.held && <span className="set-row-held">{t('studio.heldTitle')}</span>}
              </span>
              <HouseIcon.next size={18} className="set-row-chev" />
            </Pressable>
          </li>
        );
      })}
    </ul>
  );
}
