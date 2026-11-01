// Shared shell for every block, so loading and error states are handled once
// rather than eight times, and a failed fetch never renders an empty chart that
// looks like a finding of zero.
export function Panel({ title, note, actions, children }) {
  return (
    <div className="panel">
      {(title || note || actions) && (
        <header>
          <div>
            {title && <h2>{title}</h2>}
            {note && <span className="note">{note}</span>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </div>
  )
}

// Each view is named for a noun or the question it answers, with one line on the
// data under it.
export function ViewTitle({ title, note }) {
  return (
    <div className="view-title">
      <h1>{title}</h1>
      {note && <p>{note}</p>}
    </div>
  )
}

// A placeholder the size of the block it stands in for on first load, at desktop
// and phone width, so the page does not jump when the data arrives.
export function Skeleton({ height = 160, phone = height }) {
  return (
    <div
      className="skeleton"
      style={{ '--height': `${height}px`, '--height-phone': `${phone}px` }}
      aria-label="Loading"
    />
  )
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
