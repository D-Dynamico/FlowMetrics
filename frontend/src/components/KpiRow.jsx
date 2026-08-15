import { useApi, scopedPath, percent, number } from '../api'
import { Loading, Failed } from './Panel'

function Kpi({ label, value, children }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {children && <div className="sub">{children}</div>}
    </div>
  )
}

export function KpiRow({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/kpis', orderType))

  if (loading) return <Loading what="headline numbers" />
  if (error) return <Failed error={error} />

  const split = data.adherence_by_order_type || {}
  const slack = data.promise_slack || {}
  const review = data.review_impact || {}

  return (
    <div className="kpi-row">
      {/* The split sits under the pooled figure rather than in its own panel:
          interstate and intrastate are different operations, so the pooled rate
          moves whenever the order mix moves even when nothing operational has
          changed. Showing it alone invites exactly that misreading. */}
      <Kpi label="On-time delivery" value={percent(data.sla_adherence)}>
        {Object.entries(split).map(([type, rate]) => (
          <span key={type}>
            {type} <b>{percent(rate)}</b>
          </span>
        ))}
      </Kpi>

      {/* Second, not last. A median order arriving nearly two weeks early is the
          strongest thing this data says, and it reframes the adherence number
          directly above it. */}
      <Kpi
        label="Typical delivery vs promise"
        value={
          <>
            {slack.median_days ?? '—'}
            <small>days early</small>
          </>
        }
      >
        <span>
          10th pct <b>{slack.p10_days}</b>
        </span>
        <span>
          90th pct <b>{slack.p90_days}</b>
        </span>
      </Kpi>

      <Kpi label="Late orders" value={number(data.late_orders)}>
        <span>
          of <b>{number(data.orders)}</b> delivered
        </span>
      </Kpi>

      <Kpi
        label="Review score when late"
        value={
          <>
            {review.late?.mean_score ?? '—'}
            <small>of 5</small>
          </>
        }
      >
        <span>
          on time <b>{review.on_time?.mean_score}</b>
        </span>
        <span>
          gap <b>−{review.score_gap}</b>
        </span>
      </Kpi>
    </div>
  )
}
