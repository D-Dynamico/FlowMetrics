import { useState } from 'react'
import './App.css'
import { useMeta, number, percent } from './api'
import { KpiRow } from './components/KpiRow'
import { RcaPanel } from './components/RcaPanel'
import { LaneTable } from './components/LaneTable'
import { SellerPareto } from './components/SellerPareto'
import { ReviewImpact } from './components/ReviewImpact'
import { Explore } from './components/Explore'

const SCOPES = [
  { key: 'all', label: 'All orders' },
  { key: 'interstate', label: 'Between states' },
  { key: 'intrastate', label: 'Within one state' },
]

// The toggle is not decorative. Switching it is how a reader sees that the two
// segments fail for different reasons: between states the carrier stage
// dominates, within one state the seller stage surfaces because there is no long
// transit to absorb a slow handover. It sits in the sticky bar so it stays in
// reach while reading any block below, all of which move together.
function OrderTypeToggle({ value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Order type">
      {SCOPES.map((scope) => (
        <button
          key={scope.key}
          aria-pressed={value === scope.key}
          onClick={() => onChange(scope.key)}
        >
          {scope.label}
        </button>
      ))}
    </div>
  )
}

function Section({ step, title, lede, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <span className="step">{step}</span>
        <div>
          <h2>{title}</h2>
          {lede && <p className="lede">{lede}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

// Every exclusion stays visible on the page: the totals in the summary line,
// the per-rule counts one click away. Hiding them entirely would leave an
// unexplained drop between the raw and the clean row counts.
function Footer({ meta }) {
  if (!meta) return null
  const report = meta.cleaning_report || {}
  const source = meta.data_source || {}

  const rules = [
    ['Not yet delivered', report.dropped_not_delivered],
    ['More than one seller', report.dropped_multi_seller],
    ['Impossible timestamps (negative stage)', report.dropped_negative_duration],
    ['Outside the date range', report.dropped_outside_date_window],
    ['Missing a timestamp', report.dropped_null_timestamps],
    ['Over 180 days end to end', report.dropped_impossible_tat],
  ]

  return (
    <footer className="footer">
      <p>
        Data:{' '}
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.name}
        </a>
        , {source.publisher}, {source.licence}. Real, anonymised orders delivered{' '}
        {meta.date_range?.[0]} to {meta.date_range?.[1]}.
      </p>
      <details>
        <summary>
          {number(report.clean_orders)} of {number(report.raw_orders)} orders kept (
          {percent(report.survival_rate, 0)}) — see what was excluded
        </summary>
        <table className="exclusions">
          <tbody>
            {rules.map(([label, count]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{number(count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">
          Rankings ignore routes under {meta.floors?.min_orders_per_lane} orders and
          sellers under {meta.floors?.min_orders_per_seller}, so a handful of orders
          cannot top a list.
        </p>
      </details>
    </footer>
  )
}

export default function App() {
  const [orderType, setOrderType] = useState('all')
  const meta = useMeta()

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="./favicon.svg" alt="" width="20" height="20" />
            FlowMetrics
          </div>
          <OrderTypeToggle value={orderType} onChange={setOrderType} />
        </div>
      </header>

      <main className="page">
        <div className="intro">
          <h1>Where Brazilian marketplace deliveries lose their promised date</h1>
          <p>
            {meta ? number(meta.cleaning_report?.clean_orders) : '…'} delivered
            orders, {meta?.date_range?.[0]?.slice(0, 4)}–
            {meta?.date_range?.[1]?.slice(0, 4)}. Switch order type at the top to
            compare deliveries between states with deliveries inside one state.
          </p>
        </div>

        <KpiRow orderType={orderType} />

        <Section step="1" title="Which stage goes wrong, and where">
          <RcaPanel orderType={orderType} />
        </Section>

        <Section
          step="2"
          title="Who to act on"
          lede="The routes to renegotiate and the sellers to call."
        >
          <LaneTable orderType={orderType} />
          <SellerPareto orderType={orderType} />
        </Section>

        <Section step="3" title="What it costs">
          <ReviewImpact orderType={orderType} />
        </Section>

        <Section step="4" title="Explore the data">
          <Explore orderType={orderType} />
        </Section>

        <Footer meta={meta} />
      </main>
    </>
  )
}
