import {
  ResponsiveContainer,
  AreaChart,
  LineChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { useApi, useMeta, scopedPath, percent, number } from '../api'
import { Skeleton, Failed, StateSelect } from './Panel'

const AXIS = { fontSize: 12, fill: 'var(--muted)' }
const MARGIN = { top: 8, right: 4, bottom: 0, left: -18 }
const CHARTS_HEIGHT = 356

// Volume and on-time rate read together: the same dip during a volume spike is a
// capacity story, and on a normal day a process one. They share a time axis and a
// tooltip rather than one plot, because two scales on one plot invite comparing
// the lines' heights, which mean nothing.
export function Throughput({ orderType, state, onStateChange }) {
  const meta = useMeta()
  const path = state ? `/api/throughput?state=${state}` : '/api/throughput'
  const { data, error, loading } = useApi(scopedPath(path, orderType))
  const hiddenDays = data?.series.filter((day) => day.adherence == null).length

  return (
    <>
      <div className="filters">
        <StateSelect value={state} onChange={onStateChange} meta={meta} />
      </div>

      {loading && <Skeleton height={CHARTS_HEIGHT} />}
      {error && <Failed error={error} />}
      {data && (
        <>
          <div className="subhead">Orders delivered per day</div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} syncId="daily" margin={MARGIN}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="delivered_date" hide />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} tickCount={3} />
                <Tooltip formatter={(value) => [number(value), 'Orders']} />
                <Area
                  dataKey="orders"
                  stroke="var(--volume)"
                  fill="var(--volume)"
                  fillOpacity={0.14}
                  strokeWidth={1.25}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="subhead">On-time rate per day</div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} syncId="daily" margin={MARGIN}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="delivered_date"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={64}
                  tickFormatter={(d) => d.slice(0, 7)}
                />
                <YAxis
                  domain={[0, 1]}
                  ticks={[0, 0.5, 1]}
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(value) => [percent(value), 'On time']} />
                <Line
                  dataKey="adherence"
                  stroke="var(--chart-ink)"
                  strokeWidth={1.25}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="fine">
            No rate on {number(hiddenDays)} of {number(data.series.length)} days: those
            under {data.min_orders_per_day} orders, and those after the last purchase in
            the data, when only slow orders are still arriving.
          </p>
        </>
      )}
    </>
  )
}
