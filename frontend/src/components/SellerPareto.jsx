import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts'
import { useApi, scopedPath, percent, number } from '../api'
import { Panel, Loading, Failed } from './Panel'

export function SellerPareto({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/sellers?limit=50', orderType))

  if (loading) return <Loading what="seller performance" />
  if (error) return <Failed error={error} />

  const pareto = data.pareto
  const sla = data.seller_sla

  // Cumulative curve built from the ranked seller list. The single figure above
  // it is the point; the curve is supporting evidence, which is why the number
  // is large and the chart is small.
  const ranked = [...data.sellers].sort((a, b) => b.late_orders - a.late_orders)
  const total = ranked.reduce((sum, s) => sum + s.late_orders, 0)
  let running = 0
  const curve = ranked.map((seller, index) => {
    running += seller.late_orders
    return { rank: index + 1, share: total ? running / total : 0 }
  })

  return (
    <Panel
      title="Seller concentration"
      note={`sellers with at least ${data.min_orders_per_seller} orders`}
    >
      <p className="figure">
        {pareto.sellers_to_50} of {number(pareto.eligible_sellers)} sellers
        <small>
          account for half of all late orders. This sits upstream of the
          operation: the lever is seller management, not floor process. The top
          10% of sellers carry {percent(pareto.top_decile_share)} of the misses.
        </small>
      </p>

      <div className="split">
        <div>
          <div className="subhead">Cumulative share of late orders</div>
          <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curve} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="rank"
                tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
                label={{
                  value: 'sellers, worst first',
                  position: 'insideBottom',
                  offset: -2,
                  fontSize: 11,
                  fill: 'var(--ink-faint)',
                }}
              />
              <YAxis
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
              />
              <Tooltip
                formatter={(v) => percent(v)}
                labelFormatter={(v) => `Top ${v} sellers`}
              />
              <ReferenceLine y={0.5} stroke="var(--late)" strokeDasharray="4 3" />
              <Line
                type="monotone"
                dataKey="share"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

        <div>
          {/* The two deadlines are independent, and this is the cell that matters:
              a seller can miss their handover and the customer still gets the
              order on time, because the promise carries slack. That is a
              planning finding, not an execution one. */}
          <div className="subhead">Handover deadline vs customer outcome</div>
          <table>
            <tbody>
              <tr>
                <td>Sellers missing their handover deadline</td>
                <td className="num">{percent(sla.handover_breach_rate)}</td>
              </tr>
              <tr>
                <td>…where the customer still got it on time</td>
                <td className="num lift-over">
                  {percent(sla.share_of_breaches_absorbed_by_slack)}
                </td>
              </tr>
              <tr>
                <td>…where the customer got it late</td>
                <td className="num">{percent(sla.breached_and_late)}</td>
              </tr>
              <tr>
                <td>Late despite an on-time handover</td>
                <td className="num">{percent(sla.on_time_handover_and_late)}</td>
              </tr>
            </tbody>
          </table>
          <p className="note" style={{ marginTop: 10 }}>
            The padding in the promise absorbs most seller delay before the
            customer ever sees it.
          </p>
        </div>
      </div>
    </Panel>
  )
}
