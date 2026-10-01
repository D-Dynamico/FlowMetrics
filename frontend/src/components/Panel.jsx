// Shared shell for every block, so loading and error states are handled once
// rather than eight times, and a failed fetch never renders an empty chart that
// looks like a finding of zero.
export function Panel({ title, note, actions, feature = false, children }) {
  return (
    <div className={feature ? 'panel feature' : 'panel'}>
      {(title || note || actions) && (
        <header>
          <div>
            {title && <h3>{title}</h3>}
            {note && <span className="note">{note}</span>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </div>
  )
}

// A placeholder the size of the block it stands in for, so switching order type
// does not make the page jump while data loads.
export function Skeleton({ height = 160 }) {
  return <div className="skeleton" style={{ height }} aria-label="Loading" />
}

// Built from /api/meta rather than a hardcoded list, so the options are exactly
// the states that survive cleaning and are ordered by volume.
export function StateSelect({ value, onChange, meta }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="State"
    >
      <option value="">All states</option>
      {(meta?.states ?? []).map((state) => (
        <option key={state.code} value={state.code}>
          {state.name}
        </option>
      ))}
    </select>
  )
}

// Two or three mutually exclusive views of the same block.
export function Tabs({ options, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((option) => (
        <button
          key={option.key}
          role="tab"
          aria-selected={value === option.key}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Failed({ error }) {
  return (
    <div className="state error">
      Could not load: {error}. Is the API running on port 8000?
    </div>
  )
}
