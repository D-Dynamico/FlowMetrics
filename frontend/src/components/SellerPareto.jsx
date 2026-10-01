import { useApi, scopedPath, percent, number } from '../api'
import { Panel, Skeleton, Failed } from './Panel'

// Every figure here comes straight from the Pareto computed in analysis/. An
// earlier version drew a cumulative curve from the 50 sellers the endpoint
// returns, which reached 100% at seller 50 and contradicted the headline figure
// beside it. The milestones below are what that curve was trying to show.
function Milestones({ pareto }) {
  const eligible = pareto.eligible_sellers || 1
  const marks = [
    { sellers: pareto.sellers_to_50, share: '50%' },
    { sellers: pareto.sellers_to_80, share: '80%' },
  ]

  return (
    <div className="milestones">
      <div className="ms-track">
        {marks.map((mark, index) => (
          <span
            key={mark.share}
            className={`ms-fill ms-${index}`}
            style={{ width: `${(mark.sellers / eligible) * 100}%` }}
          />
        ))}
      </div>
      <ul className="ms-legend">
        {marks.map((mark, index) => (
          <li key={mark.share}>
            <i className={`ms-${index}`} />
            <b>{number(mark.sellers)}</b> sellers carry <b>{mark.share}</b> of late orders
          </li>
        ))}
        <li>
          <i className="ms-rest" />
          {number(eligible)} sellers in total
        </li>
      </ul>
    </div>
  )
}

export function SellerPareto({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/sellers?limit=1', orderType))

  if (loading) return <Skeleton height={240} />
  if (error) return <Failed error={error} />

  const pareto = data.pareto
  const sla = data.seller_sla

  return (
    <Panel
      title="Sellers"
      note={`Sellers with ${data.min_orders_per_seller}+ orders`}
    >
      <p className="figure">
        {pareto.sellers_to_50} of {number(pareto.eligible_sellers)} sellers
        <small>
          account for half of all late orders. The top 10% carry{' '}
          {percent(pareto.top_decile_share, 0)}. The lever is seller management, not
          floor process.
        </small>
      </p>

      <Milestones pareto={pareto} />

      {/* The two deadlines are independent, and this is the number that
          matters: a seller can miss their handover and the customer still gets
          the order on time, because the promise carries slack. That is a
          planning finding, not an execution one. */}
      <div className="callout">
        <b>{percent(sla.share_of_breaches_absorbed_by_slack, 0)}</b> of missed seller
        handovers still reached the customer on time. The padding in the promise hides
        most seller delay.
      </div>
    </Panel>
  )
}
