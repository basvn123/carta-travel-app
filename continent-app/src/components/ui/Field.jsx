/*
 * Field (T422): a labelled input, select or textarea, with optional help and
 * error text.
 *
 * The label is required and always visible: a placeholder is never the name of
 * a field (T418-c found five fields named only by a placeholder). Help and
 * error are tied to the control with aria-describedby; an error also sets
 * aria-invalid and says what happened and what to do, in one sentence.
 *
 *   <Field label="Email" type="email" value={v} onChange={...} />
 *   <Field as="select" label="Country" value={c} onChange={...}>{options}</Field>
 *   <Field as="textarea" label="Notes" hint="Only you see these" />
 * Pass hideLabel for a search box whose purpose the icon and context make
 * plain: the label stays for assistive tech, visually hidden.
 */
import React, { useId } from 'react';

export const Field = React.forwardRef(function Field(
  { label, hint, error, as = 'input', hideLabel = false, id, className = '', children, ...rest },
  ref
) {
  const auto = useId();
  const fid = id || `f${auto.replace(/[^a-zA-Z0-9]/g, '')}`;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const Control = as === 'select' || as === 'textarea' ? as : 'input';
  return (
    <div className={['field', error && 'has-error', className].filter(Boolean).join(' ')}>
      <label className={hideLabel ? 'field-label sr-only' : 'field-label'} htmlFor={fid}>{label}</label>
      <div className={`field-control field-${Control}`}>
        <Control
          ref={ref}
          id={fid}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {Control === 'input' ? undefined : children}
        </Control>
      </div>
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
      {error && <p className="field-error" id={errId}>{error}</p>}
    </div>
  );
});
