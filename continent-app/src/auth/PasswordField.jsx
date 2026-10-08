import React, { useState } from 'react';
import { EyeIcon, EyeOffIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * Password input with a reveal toggle, and the one place a password field's
 * error is allowed to appear: directly under the field it belongs to.
 *
 * Typing a long passphrase blind on a phone is how people end up locked out of
 * accounts they still own, hence the reveal. `error` and `hint` are wired
 * through aria-describedby rather than left as loose text, so a screen reader
 * hears "current password, invalid, that current password isn't right" instead
 * of a sentence stranded somewhere below the button.
 *
 * Its own file since T390 (brief V3-11): the sign-in modal, the reset screen
 * and the account's password forms are one field, so a traveller meets the
 * same reveal toggle wherever a password is typed.
 */
export function PasswordField({
  id, label, value, onChange, autoComplete, placeholder, required = false, error = '', hint = null,
  mark = null,
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  return (
    <div className={`auth-field${error ? ' has-error' : ''}${mark ? ' has-mark' : ''}`}>
      <label className="auth-label" htmlFor={id}>{label}</label>
      <div className="pw-input-wrap">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
        />
        {mark}
        <button
          type="button"
          className="pw-reveal"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={t(shown ? 'account.hidePassword' : 'account.showPassword')}
        >
          {shown ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </button>
      </div>
      {error && <p className="auth-field-error" id={errorId} role="alert">{error}</p>}
      {hint && <div className="auth-field-hint" id={hintId}>{hint}</div>}
    </div>
  );
}
