import { useApi, scopedPath, percent, number } from '../api'
import { Panel, Skeleton, Failed, ViewTitle } from './Panel'

const LEG_LABEL = { approval: 'Payment approval', seller: 'Seller handover', carrier: 'Carrier transit' }
const LEG_ORDER = ['approval', 'seller', 'carrier']
const TYPE_LABEL = { interstate: 'Between states', intrastate: 'Within state' }

// The dominant leg takes the page's one hue, whichever leg that is for the
// selected order type. The other two stay neutral.
const legClass = (leg, dominant) => (leg === dominant ? 'leg-hue' : `leg-${leg}`)

const position = (day, span) => `${(day / span) * 100}%`

// One order drawn to scale against its own promise. Each mark is a separate
// median, so the stages stop a little short of the arrival mark; the note under
// the chart says so rather than stretching them to fit.
function OrderRow({ title, order, span, dominant, late }) {
  const gap = Math.abs(order.gap_days).toFixed(1)
  let start = 0

  return (
    <div className="order-row">
      <p className="order-title">
        <b>{title}</b>
        <span>{number(order.orders)} orders</span>
        <span className={late ? 'late' : ''}>
          {gap} days {late ? 'after' : 'before'} its promise
        </span>
      </p>
      <div className="track">
        {LEG_ORDER.map((leg) => {
          const length = order[`${leg}_days`]
          const left = start
          start += length
          const width = (length / span) * 100
          return (
            <span
              key={leg}
              className={`stage ${legClass(leg, dominant)}`}
              style={{ left: position(left, span), width: `${width}%` }}
              title={`${LEG_LABEL[leg]}: ${length.toFixed(1)} days`}
            >
              {width > 8 && `${length.toFixed(1)} days`}
            </span>
          )
        })}
        <span
          className={`mark arrival ${order.arrival_day / span > 0.9 ? 'near-end' : ''}`}
          style={{ left: position(order.arrival_day, span) }}
        >
          <em>Arrives day {order.arrival_day.toFixed(1)}</em>
        </span>
        <span className="mark promised" style={{ left: position(order.promised_day, span) }}>
          <em>Promised day {order.promised_day.toFixed(1)}</em>
        </span>
      </div>
    </div>
  )
}

function PromiseLine({ journey, dominant }) {
  const longest = Math.max(journey.late?.arrival_day ?? 0, journey.on_time.promised_day)
  const span = Math.ceil(longest / 5) * 5
  const ticks = Array.from({ length: span / 5 + 1 }, (_, index) => index * 5)

  return (
    <div className="promise-line">
      <div className="axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} style={{ left: position(tick, span) }}>
            {tick === 0 ? 'Bought' : `Day ${tick}`}
          </span>
        ))}
      </div>
      <OrderRow title="Typical on-time order" order={journey.on_time} span={span} dominant={dominant} />
      {journey.late && (
        <OrderRow title="Typical late order" order={journey.late} span={span} dominant={dominant} late />
      )}
    </div>
  )
}

function StageShare({ breakdown, dominant }) {
  const legs = LEG_ORDER.filter((leg) => breakdown[leg] > 0)
  return (
    <div className="stage-share">
      <div className="share-bar">
        {legs.map((leg) => (
          <span
            key={leg}
            className={legClass(leg, dominant)}
            style={{ width: `${breakdown[leg] * 100}%` }}
          />
        ))}
      </div>
      <ul>
        {legs.map((leg) => (
          <li key={leg}>
            <i className={legClass(leg, dominant)} />
            {LEG_LABEL[leg]} <b>{percent(breakdown[leg], 0)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Answer({ orderType }) {
  const rca = useApi(scopedPath('/api/rca', orderType))
  const journey = useApi(scopedPath('/api/journey', orderType))

  if (rca.loading || journey.loading) return <Skeleton height={459} phone={540} />
  if (rca.error || journey.error) return <Failed error={rca.error || journey.error} />

  const overall = rca.data.overall
  const leg = overall.dominant_leg

  return (
    <Panel>
      <p className="answer">
        <b>{percent(overall.leg_breakdown[leg], 0)}</b> of late orders ran furthest over in{' '}
        {LEG_LABEL[leg].toLowerCase()}
      </p>
      <p className="answer-note">
        Each late order is put down to the stage furthest over its normal time.
        {leg === 'carrier' &&
          ' Carrier transit is one composite stage, so this data cannot say which part of it ran over.'}
      </p>
      <PromiseLine journey={journey.data} dominant={leg} />
      <StageShare breakdown={overall.leg_breakdown} dominant={leg} />
      <p className="fine">
        Each stage, arrival and promise is its own median across{' '}
        {number(rca.data.orders)} orders, so they do not add up exactly.
      </p>
    </Panel>
  )
}

function Strip({ orderType, kpis }) {
  const split = kpis.adherence_by_order_type || {}
  const slack = kpis.promise_slack || {}
  const review = kpis.review_impact

  return (
    <div className="strip">
      <div>
        <p className="label">Delivered on time</p>
        <p className="value">{percent(kpis.sla_adherence)}</p>
        <p className="sub">
          {orderType === 'all'
            ? Object.entries(split)
                .map(([type, rate]) => `${TYPE_LABEL[type]} ${percent(rate)}`)
                .join(' · ')
            : `${number(kpis.orders)} orders`}
        </p>
      </div>
      <div>
        <p className="label">Late orders</p>
        <p className="value late">{number(kpis.late_orders)}</p>
        <p className="sub">of {number(kpis.orders)} delivered</p>
      </div>
      <div>
        <p className="label">Typical on-time order arrives</p>
        <p className="value">
          {slack.median_days?.toFixed(1) ?? '—'} <small>days early</small>
        </p>
        <p className="sub">Measured against the promised date</p>
      </div>
      {review?.on_time && (
        <div>
          <p className="label">Average review</p>
          <p className="value">
            {review.on_time.mean_score.toFixed(1)} <small>on time</small>{' '}
            <span className="late">{review.late.mean_score.toFixed(1)}</span> <small>late</small>
          </p>
          <p className="sub">Out of 5 stars</p>
        </div>
      )}
    </div>
  )
}

// Paired rows, so one star reads straight across as the gap it is. This is what
// turns an operational metric into a business consequence.
function ReviewCost({ review }) {
  const stars = [5, 4, 3, 2, 1]
  const largest = Math.max(
    ...stars.flatMap((star) => [review.on_time.distribution[star] ?? 0, review.late.distribution[star] ?? 0]),
  )

  return (
    <Panel
      title="What a late order costs"
      note={`${percent(review.late.distribution[1] ?? 0, 0)} of late orders get one star, against ${percent(review.on_time.distribution[1] ?? 0, 0)} of on-time ones`}
    >
      <ul className="stars">
        <li className="stars-head">
          <span>Review</span>
          <span>On time</span>
          <span>Late</span>
        </li>
        {stars.map((star) => {
          const onTime = review.on_time.distribution[star] ?? 0
          const late = review.late.distribution[star] ?? 0
          return (
            <li key={star}>
              <span>
                {star} {star === 1 ? 'star' : 'stars'}
              </span>
              <span className="pair">
                <i style={{ width: `${(onTime / largest) * 100}%` }} />
                <b>{percent(onTime, 0)}</b>
              </span>
              <span className="pair late">
                <i style={{ width: `${(late / largest) * 100}%` }} />
                <b>{percent(late, 0)}</b>
              </span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

// The promise is a planning number, so the spread matters as much as the middle.
function Padding({ slack, sla }) {
  const marks = [
    ['Tenth percentile', slack.p10_days],
    ['Quarter', slack.p25_days],
    ['Middle order', slack.median_days],
    ['Three quarters', slack.p75_days],
    ['Ninetieth percentile', slack.p90_days],
  ]
  const span = Math.ceil(slack.p90_days / 5) * 5

  return (
    <Panel
      title="How much padding the promise carries"
      note={`Days to spare across ${number(slack.orders)} on-time orders`}
    >
      <ul className="padding">
        {marks.map(([label, value]) => (
          <li key={label}>
            <span>{label}</span>
            <span className="thin">
              <i style={{ width: `${(value / span) * 100}%` }} />
            </span>
            <b>{value.toFixed(1)} days</b>
          </li>
        ))}
      </ul>
      <p className="padding-note">
        <b>{percent(sla.share_of_breaches_absorbed_by_slack, 0)}</b> of missed seller handovers
        still reached the customer on time, so the padding hides most seller delay.
      </p>
    </Panel>
  )
}

export function PromiseView({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/kpis', orderType))

  return (
    <>
      <ViewTitle
        title="Where Brazilian deliveries lose their promised date"
        note="A late order is not a slightly slow order. It spends far longer with the carrier, and the promise has no room left for that."
      />
      <Answer orderType={orderType} />
      {loading && <Skeleton height={471} phone={916} />}
      {error && <Failed error={error} />}
      {data && (
        <>
          <Strip orderType={orderType} kpis={data} />
          <div className="pair-grid">
            {data.review_impact?.on_time && <ReviewCost review={data.review_impact} />}
            <Padding slack={data.promise_slack} sla={data.seller_sla} />
          </div>
        </>
      )}
    </>
  )
}
