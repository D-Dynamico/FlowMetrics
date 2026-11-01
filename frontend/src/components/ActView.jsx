import { useState } from 'react'
import { useApi, useMeta, scopedPath, percent, number, days, laneName } from '../api'
import { Panel, Skeleton, Failed, Tabs, ViewTitle } from './Panel'

// Two orderings, because they answer different questions and the data disagrees
// between them. A small route at low on-time rate is a quality problem; a large
// route losing many orders may cost more customers in total. Showing only one
// makes the network look either uniformly fine or like a set of small disasters.
const SORTS = [
  { key: 'adherence', label: 'Worst on-time rate' },
  { key: 'late_orders', label: 'Most late orders' },
]

const ROWS = 8
const SELLERS_SHOWN = 6

function Routes({ orderType }) {
  const [sortBy, setSortBy] = useState('adherence')
  const meta = useMeta()
  const { data, error, loading } = useApi(
    scopedPath(`/api/lanes?sort_by=${sortBy}&limit=${ROWS}`, orderType),
  )

  return (
    <Panel
      title="Routes to renegotiate"
      note={
        data
          ? `Top ${ROWS} of ${number(data.lanes_above_floor)} routes with ${data.min_orders_per_lane}+ orders`
          : null
      }
      actions={<Tabs options={SORTS} value={sortBy} onChange={setSortBy} />}
    >
      {loading && <Skeleton height={ROWS * 34 + 36} phone={ROWS * 37 + 36} />}
      {error && <Failed error={error} />}
      {data && (
        <table className="data">
          <thead>
            <tr>
              <th>Seller state → customer state</th>
              <th className="num">Orders</th>
              <th className="num">Late</th>
              <th className="num">On time</th>
              <th className="num hide-sm">Transit</th>
            </tr>
          </thead>
          <tbody>
            {data.lanes.map((lane) => (
              <tr key={lane.lane}>
                <td>{laneName(lane.lane, meta)}</td>
                <td className="num">{number(lane.orders)}</td>
                <td className={`num ${sortBy === 'late_orders' ? 'sorted' : ''}`}>
                  {number(lane.late_orders)}
                </td>
                <td className={`num ${sortBy === 'adherence' ? 'sorted' : ''}`}>
                  {percent(lane.adherence, 0)}
                </td>
                <td className="num hide-sm">{days(lane.median_carrier_hrs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

// Every figure here comes straight from the Pareto computed in analysis/. An
// earlier version drew a cumulative curve from the sellers the endpoint returns,
// which reached 100% at the last row and contradicted the headline figure.
function Concentration({ pareto, sla, floor }) {
  const eligible = pareto.eligible_sellers || 1
  const marks = [
    { sellers: pareto.sellers_to_50, share: '50%', className: 'ms-0' },
    { sellers: pareto.sellers_to_80, share: '80%', className: 'ms-1' },
  ]

  return (
    <Panel title="Sellers to call" note={`Sellers with ${floor}+ orders`}>
      <p className="file-figure">
        {pareto.sellers_to_50} of {number(eligible)}
        <small>sellers account for half of all late orders</small>
      </p>
      <div className="ms-track">
        {marks.map((mark) => (
          <span
            key={mark.share}
            className={mark.className}
            style={{ width: `${(mark.sellers / eligible) * 100}%` }}
          />
        ))}
      </div>
      <dl className="facts">
        {marks.map((mark) => (
          <div key={mark.share}>
            <dt>
              <i className={mark.className} />
              Carry {mark.share} of late orders
            </dt>
            <dd>{number(mark.sellers)} sellers</dd>
          </div>
        ))}
        <div>
          <dt>Top tenth of sellers carry</dt>
          <dd>{percent(pareto.top_decile_share, 0)}</dd>
        </div>
        <div>
          <dt>Orders missing the handover deadline</dt>
          <dd>{percent(sla.handover_breach_rate)}</dd>
        </div>
        <div>
          <dt>Of those, still reached the customer on time</dt>
          <dd>{percent(sla.share_of_breaches_absorbed_by_slack, 0)}</dd>
        </div>
      </dl>
      <p className="fine">
        The lever is seller management rather than floor process. Sellers are anonymised in the
        data, so each appears by the start of its ID.
      </p>
    </Panel>
  )
}

function SellerTable({ sellers, total }) {
  return (
    <Panel title="Lowest on-time rate" note={`${SELLERS_SHOWN} of ${number(total)} sellers`}>
      <table className="data">
        <thead>
          <tr>
            <th>Seller</th>
            <th className="num">Orders</th>
            <th className="num">Late</th>
            <th className="num">On time</th>
            <th className="num hide-sm">Missed handover</th>
            <th className="num hide-sm">Typical handover</th>
          </tr>
        </thead>
        <tbody>
          {sellers.map((seller) => (
            <tr key={seller.seller_id}>
              <td title={seller.seller_id}>
                <code>{seller.seller_id.slice(0, 8)}…</code>
              </td>
              <td className="num">{number(seller.orders)}</td>
              <td className="num">{number(seller.late_orders)}</td>
              <td className="num sorted">{percent(seller.adherence, 0)}</td>
              <td className="num hide-sm">{percent(seller.handover_breach_rate, 0)}</td>
              <td className="num hide-sm">{days(seller.median_seller_leg_hrs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

export function ActView({ orderType }) {
  const { data, error, loading } = useApi(
    scopedPath(`/api/sellers?limit=${SELLERS_SHOWN}`, orderType),
  )

  return (
    <>
      <ViewTitle
        title="Who to act on"
        note="The routes to renegotiate and the sellers to call, each ranked with a floor so a handful of orders cannot top a list."
      />
      <div className="act-grid">
        <Routes orderType={orderType} />
        {loading && <Skeleton height={416} phone={455} />}
        {error && <Failed error={error} />}
        {data && (
          <Concentration
            pareto={data.pareto}
            sla={data.seller_sla}
            floor={data.min_orders_per_seller}
          />
        )}
      </div>
      {loading && <Skeleton height={366} phone={350} />}
      {data && <SellerTable sellers={data.sellers} total={data.sellers_above_floor} />}
    </>
  )
}
