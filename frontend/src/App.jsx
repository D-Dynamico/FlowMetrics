import { useState } from 'react'
import './App.css'
import { useApi, number } from './api'
import { KpiRow } from './components/KpiRow'
import { RcaPanel } from './components/RcaPanel'
import { LaneTable } from './components/LaneTable'
import { SellerPareto } from './components/SellerPareto'
import { ReviewImpact } from './components/ReviewImpact'
import { Throughput } from './components/Throughput'
import { OrderTable } from './components/OrderTable'

const SCOPES = [
  { key: 'all', label: 'All orders' },
  { key: 'interstate', label: 'Between states' },
  { key: 'intrastate', label: 'Within one state' },
]

// The toggle is not decorative. Switching it is how a reader sees that the two
// segments fail for different reasons: between states the carrier stage
// dominates, within one state the seller stage surfaces because there is no long
// transit to absorb a slow handover. State lives here and is passed down, so
// every block below moves together.
function OrderTypeToggle({ value, onChange }) {
  return (
    <div className="toggle">
      {SCOPES.map((scope) => (
        <button
          key={scope.key}
          aria-pressed={value === scope.key}
          onClick={() => onChange(scope.key)}
        >
          {scope.label}
        </button>
      ))}
      <span className="hint">
        The two segments fail for different reasons — switch to see it
      </span>
    </div>
  )
}

function Footer() {
  const { data } = useApi('/api/meta')
  if (!data) return null

  const report = data.cleaning_report || {}
  const source = data.data_source || {}

  return (
    <footer className="footer">
      Data:{' '}
      <a href={source.url} target="_blank" rel="noreferrer">
        {source.name}
      </a>
      , published by {source.publisher} under {source.licence}. Real, anonymised
      orders placed between {data.date_range?.[0]} and {data.date_range?.[1]}.
      <br />
      {number(report.clean_orders)} of {number(report.raw_orders)} orders (
      {Math.round((report.survival_rate ?? 0) * 100)}%) survive cleaning. Removed:{' '}
      {number(report.dropped_not_delivered)} not yet delivered,{' '}
      {number(report.dropped_multi_seller)} with more than one seller,{' '}
      {number(report.dropped_negative_duration)} with impossible timestamps,{' '}
      {number(report.dropped_null_timestamps)} missing a timestamp,{' '}
      {number(report.dropped_outside_date_window)} outside the date range,{' '}
      {number(report.dropped_impossible_tat)} taking over 180 days.
      <br />
      Rankings exclude routes under {data.floors?.min_orders_per_lane} orders and
      sellers under {data.floors?.min_orders_per_seller}.
    </footer>
  )
}

export default function App() {
  const [orderType, setOrderType] = useState('all')

  return (
    <div className="page">
      <div className="masthead">
        <h1>FlowMetrics</h1>
        <p>
          Delivery performance and root cause analysis across 93,585 Brazilian
          marketplace orders. Which stage of the journey loses the promise, where
          those losses concentrate, and what travels with them.
        </p>
      </div>

      <KpiRow orderType={orderType} />
      <OrderTypeToggle value={orderType} onChange={setOrderType} />

      <RcaPanel orderType={orderType} />
      <LaneTable orderType={orderType} />
      <SellerPareto orderType={orderType} />
      <ReviewImpact orderType={orderType} />
      <Throughput orderType={orderType} />
      <OrderTable orderType={orderType} />

      <Footer />
    </div>
  )
}
