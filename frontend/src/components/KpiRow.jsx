import { useApi, scopedPath, percent, number } from '../api'
import { Skeleton, Failed } from './Panel'

const TYPE_LABEL = { interstate: 'Between states', intrastate: 'Within state' }

function Kpi({ label, value, unit, tone, children }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {children && <div className="sub">{children}</div>}
    </div>
  )
}

export function KpiRow({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/kpis', orderType))

  if (loading) return <Skeleton height={132} />
  if (error) return <Failed error={error} />

  const split = data.adherence_by_order_type || {}
  const slack = data.promise_slack || {}

  return (
    <div className="kpi-row">
      {/* The split sits under the pooled figure rather than in its own panel:
          interstate and intrastate are different operations, so the pooled rate
          moves whenever the order mix moves even when nothing operational has
          changed. Showing it alone invites exactly that misreading. */}
      <Kpi label="Delivered on time" value={percent(data.sla_adherence)}>
        {orderType === 'all' && Object.entries(split).map(([type, rate]) => (
          <span key={type}>
            {TYPE_LABEL[type] ?? type} <b>{percent(rate)}</b>
          </span>
        ))}
      </Kpi>

      <Kpi label="Late orders" value={number(data.late_orders)} tone="bad">
        <span>
          of <b>{number(data.orders)}</b> delivered
        </span>
      </Kpi>

      {/* A median order arriving nearly two weeks early is the strongest thing
          this data says, and it reframes the on-time rate beside it. */}
      <Kpi label="Typical on-time order arrives" value={slack.median_days?.toFixed(1) ?? '—'} unit="days early">
        <span>The promise has more padding than the operation needs</span>
      </Kpi>
    </div>
  )
}
