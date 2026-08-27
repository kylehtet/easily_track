// A ledger amount that turns into a text input when clicked.

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
        onClick={(e) => e.stopPropagation()}
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
    <span
      className="editable-amt"
      title="Click to edit"
      onClick={(e) => {
        e.stopPropagation();
        onStart();
      }}
    >
      {display}
    </span>
  );
}
