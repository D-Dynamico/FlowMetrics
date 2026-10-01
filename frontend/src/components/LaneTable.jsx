import { useState } from 'react'
import { useApi, useMeta, scopedPath, percent, number, days, laneName } from '../api'
import { Panel, Skeleton, Failed, Tabs } from './Panel'

// Two orderings, because they answer different questions and the data disagrees
// between them. A small route at low on-time rate is a quality problem; a large
// route losing many orders may cost more customers in total. Showing only one
// makes the network look either uniformly fine or like a set of small disasters.
const SORTS = [
  { key: 'adherence', label: 'Worst on-time rate' },
  { key: 'late_orders', label: 'Most late orders' },
]

export function LaneTable({ orderType }) {
  const [sortBy, setSortBy] = useState('adherence')
  const meta = useMeta()
  const { data, error, loading } = useApi(
    scopedPath(`/api/lanes?sort_by=${sortBy}&limit=8`, orderType),
  )

  return (
    <Panel
      title="Routes"
      note={
        data
          ? `Seller state → customer state. Top 8 of ${number(data.lanes_above_floor)} routes with ${data.min_orders_per_lane}+ orders.`
          : null
      }
      actions={<Tabs options={SORTS} value={sortBy} onChange={setSortBy} />}
    >
      {loading && <Skeleton height={300} />}
      {error && <Failed error={error} />}
      {data && (
        <table className="data">
          <thead>
            <tr>
              <th>Route</th>
              <th className="num">Orders</th>
              <th className="num">Late</th>
              <th className="num">On time</th>
              <th className="num hide-sm">Typical transit</th>
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
