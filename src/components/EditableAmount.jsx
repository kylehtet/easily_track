// A ledger amount that turns into a text input when clicked.
//
// Both states render the same box — see `.editable-amt` / `.ledger-input` in
// global.css — so switching between them doesn't move anything on the row.
// The resting state is a <button> rather than a <span> so the figures are
// reachable by keyboard, not just by mouse.

export default function EditableAmount({
  editing,
  value,
  display,
  onStart,
  onChange,
  onCommit,
  onCancel,
}) {
  if (editing) {
    return (
      <input
        className="ledger-input"
        value={value}
        autoFocus
        inputMode="decimal"
        aria-label="Amount"
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') onCancel();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="editable-amt"
      title="Click to edit"
      onClick={(e) => {
        e.stopPropagation();
        onStart();
      }}
    >
      {display}
    </button>
  );
}
