import React from 'react';
import { useI18n } from '../../i18n/index.jsx';

/**
 * A side-by-side reading of one override: the base object the pipeline wrote
 * into app_data.json (beaches.json, lakes.json, and so on, already loaded by
 * ContentSection into its `items` state) beside the JSON patch stored in
 * content_overrides. The admin approves what a traveller will see, not what
 * the raw patch object says in isolation, so the two columns show the field
 * as it stood before and as it will read after the patch applies. Only the
 * fields the patch actually sets are listed: an override never has an
 * opinion about a field it does not carry, so there is nothing to diff there.
 *
 * Fields the patch carries that this file does not know by name are listed
 * under their raw key (extraRows), so the diff cannot fall behind the patch.
 *
 * `hidden` and `featured` are flags, not text, so they get their own row
 * worded as a sentence rather than forced into a before/after string pair.
 *
 * This component only reads. It never calls adminSetOverride and never
 * mutates its inputs; ContentSection.jsx keeps sole ownership of the save
 * and revert actions and the editor's own form state.
 */

const TEXT_FIELDS = [
  { key: 'name', label: 'diffFieldName' },
  { key: 'blurb', label: 'diffFieldBlurb' },
  { key: 'image', label: 'diffFieldImage' },
];

/** The base value for one field, reading the same two shapes ContentSection
 *  already reads (a single `image` string is layer-specific: trails keep
 *  `img`, everything else keeps `images[0]`, so the caller resolves that and
 *  hands this component a plain `image` string on the base object). */
function baseText(base, key) {
  if (!base) return '';
  const v = base[key];
  return typeof v === 'string' ? v : '';
}

function patchText(patch, key) {
  const v = patch ? patch[key] : undefined;
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function isImageField(key) {
  return key === 'image';
}

function Cell({ value, changed, empty, isImage }) {
  const { t } = useI18n();
  if (!value) {
    return <span className="diffcell diffcell-empty">{t('admin.diffEmpty')}</span>;
  }
  if (isImage) {
    return (
      <span className={`diffcell diffcell-image ${changed ? 'changed' : ''}`}>
        <img src={value} alt="" loading="lazy" />
        <code>{value}</code>
      </span>
    );
  }
  return <span className={`diffcell ${changed ? 'changed' : ''} ${empty ? 'diffcell-empty' : ''}`}>{value}</span>;
}

/**
 * `base` is the catalogue item as the pipeline wrote it (already resolved to
 * a plain `{ name, blurb, image }` shape by the caller; see
 * baseObjectForDiff in ContentSection.jsx). `patch` is the override's raw
 * JSON patch, exactly as content_overrides.patch stores it, or null/{} for
 * an override with nothing set (which renders as "no changes").
 */
export function OverrideDiffViewer({ base, patch }) {
  const { t } = useI18n();
  const p = patch || {};
  // Only a field the patch actually sets gets a row: the patch has no
  // opinion about a field it does not carry, so there is nothing to diff
  // there, and listing it beside every field the base object happens to
  // hold would bury the one or two things this override really changes.
  const rows = TEXT_FIELDS.map(({ key, label }) => {
    const before = baseText(base, key);
    const after = patchText(p, key);
    if (after === undefined) return null;
    return {
      key, label, before, after, changed: after !== before, isImage: isImageField(key),
    };
  }).filter(Boolean);

  const flagRows = [
    { key: 'hidden', label: 'diffFieldHidden', before: 'diffHiddenBefore', after: 'diffHiddenAfter', set: p.hidden === true },
    { key: 'featured', label: 'diffFieldFeatured', before: 'diffFeaturedBefore', after: 'diffFeaturedAfter', set: p.featured === true },
  ].filter((r) => r.set);

  // Any other key the patch carries is listed by its own name, so a field
  // added to the patch shape later shows up in the diff instead of saving
  // silently and never appearing (T076-c). The known keys above keep their
  // worded labels; these get the raw key and the value as JSON.
  const known = new Set([...TEXT_FIELDS.map((f) => f.key), 'hidden', 'featured']);
  const extraRows = Object.keys(p)
    .filter((key) => !known.has(key) && p[key] !== undefined && p[key] !== null)
    .map((key) => {
      const raw = p[key];
      const after = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const b = base ? base[key] : undefined;
      const before = b === undefined || b === null ? '' : (typeof b === 'string' ? b : JSON.stringify(b));
      return { key, before, after, changed: after !== before };
    });

  const nothing = rows.length === 0 && flagRows.length === 0 && extraRows.length === 0;

  return (
    <div className="diffviewer" aria-label={t('admin.diffTitle')}>
      <div className="diffviewer-head">
        <span className="diffviewer-col">{t('admin.diffBefore')}</span>
        <span className="diffviewer-col">{t('admin.diffAfter')}</span>
      </div>
      {nothing && <p className="adminpage-muted diffviewer-none">{t('admin.diffNone')}</p>}
      {rows.map((r) => (
        <div key={r.key} className={`diffrow ${r.changed ? 'changed' : ''}`}>
          <span className="diffrow-label">{t(`admin.${r.label}`)}</span>
          <div className="diffviewer-pair">
            <Cell value={r.before} changed={r.changed} empty={!r.before} isImage={r.isImage} />
            <Cell value={r.after} changed={r.changed} empty={!r.after} isImage={r.isImage} />
          </div>
        </div>
      ))}
      {extraRows.map((r) => (
        <div key={r.key} className={`diffrow ${r.changed ? 'changed' : ''}`}>
          <span className="diffrow-label"><code>{r.key}</code></span>
          <div className="diffviewer-pair">
            <Cell value={r.before} changed={r.changed} empty={!r.before} />
            <Cell value={r.after} changed={r.changed} empty={!r.after} />
          </div>
        </div>
      ))}
      {flagRows.map((r) => (
        <div key={r.key} className="diffrow changed diffrow-flag">
          <span className="diffrow-label">{t(`admin.${r.label}`)}</span>
          <div className="diffviewer-pair">
            <Cell value={t(`admin.${r.before}`)} changed={false} empty={false} />
            <Cell value={t(`admin.${r.after}`)} changed empty={false} />
          </div>
        </div>
      ))}
    </div>
  );
}
