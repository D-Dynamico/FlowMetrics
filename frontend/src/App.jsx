import { useEffect, useState } from 'react'
import './App.css'
import { useMeta, number, percent } from './api'
import { PromiseView } from './components/PromiseView'
import { WhereView } from './components/WhereView'
import { ActView } from './components/ActView'
import { EvidenceView } from './components/EvidenceView'

// One question per view. The page used to run every block in one long scroll,
// which left the reader to work out how the pieces related.
const VIEWS = [
  { key: 'promise', label: 'The promise', short: 'Promise', Component: PromiseView },
  { key: 'where', label: 'Where it breaks', short: 'Where', Component: WhereView },
  { key: 'act', label: 'Who to act on', short: 'Act on', Component: ActView },
  { key: 'evidence', label: 'How it was measured', short: 'Method', Component: EvidenceView },
]

const SCOPES = [
  { key: 'all', label: 'All orders' },
  { key: 'interstate', label: 'Between states' },
  { key: 'intrastate', label: 'Within one state' },
]

const viewFromHash = () => {
  const key = window.location.hash.slice(1)
  return VIEWS.some((view) => view.key === key) ? key : 'promise'
}

// The toggle is not decorative. Switching it is how a reader sees that the two
// segments fail for different reasons: between states the carrier leg dominates,
// within one state the seller leg surfaces because there is no long transit to
// absorb a slow handover. It lives in the sidebar so it stays in reach on every
// view, all of which move together.
function ScopeSwitch({ value, onChange, counts }) {
  return (
    <div className="scope" role="group" aria-label="Order type">
      <p className="nav-label">Order type</p>
      {SCOPES.map((scope) => (
        <button
          key={scope.key}
          aria-pressed={value === scope.key}
          onClick={() => onChange(scope.key)}
        >
          <span>{scope.label}</span>
          {counts?.[scope.key] != null && (
            <span className="count">{number(counts[scope.key])}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function Sidebar({ view, orderType, onOrderType, meta }) {
  const counts = meta && {
    all: meta.orders,
    interstate: meta.order_type_counts?.interstate,
    intrastate: meta.order_type_counts?.intrastate,
  }

  return (
    <aside className="sidebar">
      <a className="brand" href="#promise">
        <img src="./favicon.svg" alt="" width="24" height="24" />
        <span>
          FlowMetrics
          <small>Olist delivery review</small>
        </span>
      </a>

      <nav aria-label="Views">
        {VIEWS.map((item) => (
          <a
            key={item.key}
            href={`#${item.key}`}
            aria-current={view === item.key ? 'page' : undefined}
          >
            <span className="long">{item.label}</span>
            <span className="short">{item.short}</span>
          </a>
        ))}
      </nav>

      <ScopeSwitch value={orderType} onChange={onOrderType} counts={counts} />

      <p className="byline">
        A supply chain portfolio project by Dayanand.{' '}
        <a href="https://github.com/D-Dynamico/FlowMetrics" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </p>
    </aside>
  )
}

// Every exclusion stays one click away from every view, and the source is
// credited wherever the data is shown.
function Footer({ meta }) {
  if (!meta) return null
  const report = meta.cleaning_report || {}
  const source = meta.data_source || {}

  return (
    <footer className="footer">
      Data:{' '}
      <a href={source.url} target="_blank" rel="noreferrer">
        {source.name}
      </a>
      , {source.publisher}, {source.licence}. Orders bought {meta.date_range?.[0]} to{' '}
      {meta.date_range?.[1]}. {number(report.clean_orders)} of {number(report.raw_orders)}{' '}
      orders kept ({percent(report.survival_rate, 0)}):{' '}
      <a href="#evidence">see what was excluded</a>.
    </footer>
  )
}

export default function App() {
  const [view, setView] = useState(viewFromHash)
  const [orderType, setOrderType] = useState('all')
  const meta = useMeta()

  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const { Component } = VIEWS.find((item) => item.key === view)

  return (
    <div className="shell">
      <Sidebar view={view} orderType={orderType} onOrderType={setOrderType} meta={meta} />
      <main className="canvas">
        <Component orderType={orderType} meta={meta} />
        <Footer meta={meta} />
      </main>
    </div>
  )
}
