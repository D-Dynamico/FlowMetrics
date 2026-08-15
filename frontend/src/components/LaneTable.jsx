import { useState } from 'react'
import { useApi, useMeta, scopedPath, percent, number, laneName } from '../api'
import { Panel, Loading, Failed } from './Panel'

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
    scopedPath(`/api/lanes?sort_by=${sortBy}&limit=15`, orderType),
  )

  return (
    <Panel
      title="Delivery routes"
      note={
        data
          ? `${number(data.lanes_above_floor)} routes with at least ${data.min_orders_per_lane} orders`
          : null
      }
    >
      <div className="filters">
        {SORTS.map((sort) => (
          <button
            key={sort.key}
            className="page"
            aria-pressed={sortBy === sort.key}
            onClick={() => setSortBy(sort.key)}
          >
            {sort.label}
          </button>
        ))}
      </div>

      {loading && <Loading what="routes" />}
      {error && <Failed error={error} />}
      {data && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th className="num">Orders</th>
                <th className="num">Late</th>
                <th className="num">On time</th>
                <th className="num">Median transit</th>
                <th className="num">Median distance</th>
              </tr>
            </thead>
            <tbody>
              {data.lanes.map((lane) => (
                <tr key={lane.lane}>
                  <td>
                    {laneName(lane.lane, meta)}{' '}
                    <span className="code">{lane.lane}</span>
                  </td>
                  <td className="num">{number(lane.orders)}</td>
                  <td className="num">{number(lane.late_orders)}</td>
                  <td className="num">{percent(lane.adherence)}</td>
                  <td className="num">{(lane.median_carrier_hrs / 24).toFixed(1)} d</td>
                  <td className="num">{number(Math.round(lane.median_distance_km))} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
