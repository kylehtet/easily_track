import { useState } from 'react';

/**
 * Password field with a SHOW / HIDE toggle pinned to its right edge.
 *
 * Shared by the login gate and the account menu's change-password form so the
 * two behave identically — typing a password you cannot read is the same
 * problem wherever it happens.
 */
export default function PasswordInput({
  value,
  onChange,
  placeholder = 'Password',
  autoComplete = 'current-password',
  autoFocus = false,
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? 'hide' : 'show'}
      </button>
    </div>
  );
}
