import { useApi, useMeta, scopedPath, percent, number, stateName } from '../api'
import { Panel, Skeleton, Failed } from './Panel'

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
            {breakdown[leg] > 0.08 ? percent(breakdown[leg], 0) : ''}
          </span>
        ))}
      </div>
      <div className="legend">
        {legs.map((leg) => (
          <span key={leg}>
            <i style={{ background: LEG_COLOUR[leg] }} />
            {LEG_LABEL[leg]} <b>{percent(breakdown[leg], 0)}</b>
          </span>
        ))}
      </div>
    </>
  )
}

// Raw concentration would mostly restate where the orders are: SP holds most of
// the volume, so "most late orders are in SP" is true however well it performs.
// Showing miss share against order share is what separates a genuinely
// underperforming state from a merely large one. Only the top five are shown;
// the ratio is the finding, and a longer list dilutes it.
function LiftList({ lift, floor, meta }) {
  const rows = Object.entries(lift)
    .filter(([, s]) => s.lift != null && s.orders >= floor && s.lift > 1)
    .sort((a, b) => b[1].lift - a[1].lift)
    .slice(0, 5)
  const max = rows[0]?.[1].lift ?? 1

  if (rows.length === 0) {
    return <p className="note">No state with enough orders runs above its share.</p>
  }

  return (
    <ul className="bars">
      {rows.map(([state, s]) => (
        <li key={state} title={`${percent(s.miss_share)} of late orders, ${percent(s.order_share)} of all orders`}>
          <span className="bar-label">{stateName(state, meta)}</span>
          <span className="bar-track">
            <span className="bar-fill late" style={{ width: `${(s.lift / max) * 100}%` }} />
          </span>
          <span className="bar-value">{s.lift.toFixed(2)}×</span>
        </li>
      ))}
    </ul>
  )
}

function DistanceList({ distance }) {
  if (!distance) return null
  return (
    <ul className="rows">
      {Object.entries(distance.bands).map(([band, s]) => (
        <li key={band}>
          <span>{band} km</span>
          <span className="muted">{number(s.orders)} orders</span>
          <b>{percent(s.adherence)}</b>
        </li>
      ))}
    </ul>
  )
}

export function RcaPanel({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/rca', orderType))
  const meta = useMeta()

  if (loading) return <Skeleton height={520} />
  if (error) return <Failed error={error} />

  const overall = data.overall
  const drivers = overall.drivers || {}

  return (
    <Panel feature>
      <p className="headline">{data.headline}</p>
      {orderType === 'all' && <p className="segment-note">{data.segment_note}</p>}

      <div className="block">
        <div className="subhead">
          Stage that ran furthest over its normal time, across{' '}
          {number(data.late_count)} late orders
        </div>
        <LegBar breakdown={overall.leg_breakdown} />
      </div>

      <div className="split">
        <div>
          <div className="subhead">Late more often than their order volume explains</div>
          <LiftList lift={overall.state_lift} floor={overall.min_orders_per_lane} meta={meta} />
          <p className="fine">Share of late orders ÷ share of all orders. Hover for detail.</p>
        </div>
        <div>
          <div className="subhead">On-time rate by delivery distance</div>
          <DistanceList distance={drivers.distance} />
        </div>
      </div>

      {/* In the panel itself, not a README footnote. The predictors are
          confounded, and a reader who quotes the headline should meet this in
          the same breath. */}
      <div className="caveat">
        <span className="caveat-icon" aria-hidden="true">!</span>
        <p>{data.causal_caveat}</p>
      </div>
    </Panel>
  )
}
