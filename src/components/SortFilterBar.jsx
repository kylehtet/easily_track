const SORTS = [
  ['net', 'Net income'],
  ['value', 'Value'],
  ['appreciation', 'Appreciation'],
  ['address', 'Address'],
  ['updated', 'Last updated'],
];

const FILTERS = [
  ['all', 'All'],
  ['ziprent', 'Ziprent'],
  ['personal', 'Self-managed'],
];

export default function SortFilterBar({ sortBy, onSort, filter, onFilter }) {
  return (
    <div className="controls-row">
      <div className="control-group">
        <span className="control-caption">Sort</span>
        {SORTS.map(([k, label]) => (
          <button
            key={k}
            className={`seg ${sortBy === k ? 'is-active' : ''}`}
            onClick={() => onSort(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="control-group">
        <span className="control-caption">Show</span>
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            className={`seg ${filter === k ? 'is-active' : ''}`}
            onClick={() => onFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
