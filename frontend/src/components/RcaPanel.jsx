import { useApi, useMeta, scopedPath, percent, number, stateName } from '../api'
import { Panel, Loading, Failed } from './Panel'

const LEG_LABEL = { approval: 'Payment approval', seller: 'Seller handover', carrier: 'Carrier transit' }
const LEG_COLOUR = {
  approval: 'var(--leg-approval)',
  seller: 'var(--leg-seller)',
  carrier: 'var(--leg-carrier)',
}
const LEG_ORDER = ['approval', 'seller', 'carrier']

function LegBar({ breakdown }) {
  const legs = LEG_ORDER.filter((leg) => breakdown[leg] > 0)
  return (
    <>
      <div className="leg-bar">
        {legs.map((leg) => (
          <span
            key={leg}
            style={{ width: `${breakdown[leg] * 100}%`, background: LEG_COLOUR[leg] }}
            title={`${LEG_LABEL[leg]}: ${percent(breakdown[leg])}`}
          >
            {breakdown[leg] > 0.06 ? percent(breakdown[leg], 0) : ''}
          </span>
        ))}
      </div>
      <div className="legend">
        {legs.map((leg) => (
          <span key={leg}>
            <i style={{ background: LEG_COLOUR[leg] }} />
            {LEG_LABEL[leg]}
          </span>
        ))}
      </div>
    </>
  )
}

// Raw concentration would mostly restate where the orders are: SP holds most of
// the volume, so "most late orders are in SP" is true however well it performs.
// Showing miss share against order share is what separates a genuinely
// underperforming state from a merely large one.
function LiftTable({ lift, floor, meta }) {
  const rows = Object.entries(lift)
    .filter(([, s]) => s.lift != null && s.orders >= floor)
    .sort((a, b) => b[1].lift - a[1].lift)
    .slice(0, 8)

  return (
    <table>
      <thead>
        <tr>
          <th>State</th>
          <th className="num">Share of late</th>
          <th className="num">Share of orders</th>
          <th className="num">Ratio</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([state, s]) => (
          <tr key={state}>
            <td>
              {stateName(state, meta)}{' '}
              <span className="code">{state}</span>
            </td>
            <td className="num">{percent(s.miss_share)}</td>
            <td className="num">{percent(s.order_share)}</td>
            <td className={`num ${s.lift > 1 ? 'lift-over' : 'lift-under'}`}>
              {s.lift.toFixed(2)}×
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DistanceTable({ distance }) {
  if (!distance) return null
  return (
    <table>
      <thead>
        <tr>
          <th>Distance</th>
          <th className="num">Orders</th>
          <th className="num">On time</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(distance.bands).map(([band, s]) => (
          <tr key={band}>
            <td>{band} km</td>
            <td className="num">{number(s.orders)}</td>
            <td className="num">{percent(s.adherence)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RcaPanel({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/rca', orderType))
  const meta = useMeta()

  if (loading) return <Loading what="the late-order analysis" />
  if (error) return <Failed error={error} />

  const overall = data.overall
  const drivers = overall.drivers || {}

  return (
    <Panel
      title="Where late orders go wrong"
      note={`${number(data.late_count)} late orders analysed`}
      feature
    >
      <p className="headline">{data.headline}</p>
      <p className="segment-note">{data.segment_note}</p>

      {/* In the panel itself, not a README footnote. The predictors are
          confounded, and a reader who quotes the headline should meet this in
          the same breath. */}
      <div className="caveat">
        <b>How to read this</b>
        {data.causal_caveat}
      </div>

      <div className="block">
        <div className="subhead">
          Which stage ran furthest over its own normal time
        </div>
        <LegBar breakdown={overall.leg_breakdown} />
      </div>

      <div className="split">
        <div>
          <div className="subhead">
            States absorbing more late orders than their volume explains
          </div>
          <LiftTable
            lift={overall.state_lift}
            floor={overall.min_orders_per_lane}
            meta={meta}
          />
        </div>
        <div>
          <div className="subhead">On-time rate by delivery distance</div>
          <DistanceTable distance={drivers.distance} />
          {drivers.category && (
            <p className="note" style={{ marginTop: 12, lineHeight: 1.6 }}>
              Product category is a weak signal: {drivers.category.worst.name} is
              worst at {percent(drivers.category.worst.adherence)},{' '}
              {drivers.category.best.name} best at{' '}
              {percent(drivers.category.best.adherence)}, across{' '}
              {drivers.category.categories_ranked} categories with at least{' '}
              {drivers.category.min_orders_per_category} orders.
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}
