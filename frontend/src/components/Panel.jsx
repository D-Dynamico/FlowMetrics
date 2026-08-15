// Shared shell for every block, so loading and error states are handled once
// rather than eight times, and a failed fetch never renders an empty chart that
// looks like a finding of zero.
export function Panel({ title, note, feature = false, children }) {
  return (
    <section className={feature ? 'panel feature' : 'panel'}>
      {(title || note) && (
        <header>
          {title && <h2>{title}</h2>}
          {note && <span className="note">{note}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Loading({ what = 'data' }) {
  return <div className="state">Loading {what}…</div>
}

// Built from /api/meta rather than a hardcoded list, so the options are exactly
// the states that survive cleaning and are ordered by volume. Full names, with
// the code kept alongside because the tables and the source data use it.
export function StateSelect({ value, onChange, meta }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">All states</option>
      {(meta?.states ?? []).map((state) => (
        <option key={state.code} value={state.code}>
          {state.name} ({state.code})
        </option>
      ))}
    </select>
  )
}

export function Failed({ error }) {
  return (
    <div className="state error">
      Could not load: {error}. Is the API running on port 8000?
    </div>
  )
}
