import { useState } from 'react'
import { useApi, scopedPath, number, percent } from '../api'
import { Panel, Tabs, ViewTitle } from './Panel'
import { Throughput } from './Throughput'
import { OrderTable } from './OrderTable'

const CHECKS = [
  { key: 'volume', label: 'Daily series' },
  { key: 'orders', label: 'Order list' },
]

// Every exclusion is counted here in the order the cleaning applies it, so the
// drop from raw to clean is arithmetic a reader can check.
function Exclusions({ meta }) {
  const report = meta?.cleaning_report
  if (!report) return null

  const rules = [
    ['Not yet delivered', report.dropped_not_delivered],
    ['Missing a timestamp', report.dropped_null_timestamps],
    ['Outside the date range', report.dropped_outside_date_window],
    ['No items on the order', report.dropped_no_items],
    ['More than one seller', report.dropped_multi_seller],
    ['Impossible timestamps', report.dropped_negative_duration],
    ['Over 180 days end to end', report.dropped_impossible_tat],
  ]

  return (
    <Panel title="From raw orders to the analysis" note={`${percent(report.survival_rate, 0)} of orders kept`}>
      <table className="data">
        <tbody>
          <tr>
            <td>Orders in the raw data</td>
            <td className="num sorted">{number(report.raw_orders)}</td>
          </tr>
          {rules.map(([label, count]) => (
            <tr key={label}>
              <td className="muted">{label}</td>
              <td className="num muted">{count > 0 ? `−${number(count)}` : '0'}</td>
            </tr>
          ))}
          <tr>
            <td>Orders analysed</td>
            <td className="num sorted">{number(report.clean_orders)}</td>
          </tr>
        </tbody>
      </table>
      <p className="fine">
        Rankings ignore routes under {meta.floors?.min_orders_per_lane} orders and sellers under{' '}
        {meta.floors?.min_orders_per_seller}. {number(report.missing_distance)} orders have no
        distance but stay in everything else.
      </p>
    </Panel>
  )
}

function Limits({ orderType }) {
  const { data } = useApi(scopedPath('/api/rca', orderType))

  return (
    <Panel title="What this cannot say">
      <ul className="limits">
        <li>{data?.causal_caveat ?? 'These are associations, not causes.'}</li>
        <li>
          The carrier stage is composite. The data records no scans in transit, so line haul,
          sorting and last mile are one measurement, and the largest source of delay is the one
          it can say least about.
        </li>
        <li>
          Orders from more than one seller are left out, because one handover time cannot be
          split between sellers, so the seller findings apply to single-seller orders.
        </li>
        <li>
          This is Brazil from 2017 to 2018. The marketplace structure transfers to other
          countries, but cash on delivery returns, festive peaks and quick commerce are absent.
        </li>
      </ul>
    </Panel>
  )
}

export function EvidenceView({ orderType, meta }) {
  const [check, setCheck] = useState('volume')
  const [state, setState] = useState('')

  return (
    <>
      <ViewTitle
        title="How it was measured"
        note="What was kept, what the data cannot support, and the raw series and orders behind every figure."
      />
      <div className="pair-grid first">
        <Exclusions meta={meta} />
        <Limits orderType={orderType} />
      </div>
      <Panel
        title="Check the data yourself"
        actions={<Tabs options={CHECKS} value={check} onChange={setCheck} />}
      >
        {check === 'volume' ? (
          <Throughput orderType={orderType} state={state} onStateChange={setState} />
        ) : (
          <OrderTable orderType={orderType} state={state} onStateChange={setState} />
        )}
      </Panel>
    </>
  )
}
