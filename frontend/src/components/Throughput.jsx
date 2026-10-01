import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { useApi, useMeta, scopedPath, percent, number } from '../api'
import { Skeleton, Failed, StateSelect } from './Panel'

const AXIS = { fontSize: 11, fill: 'var(--ink-faint)' }

// Volume and on-time rate on one chart because neither reads alone: the same dip
// during a volume spike is a capacity story, and on a normal day a process one.
export function Throughput({ orderType, state, onStateChange }) {
  const meta = useMeta()
  const path = state ? `/api/throughput?state=${state}` : '/api/throughput'
  const { data, error, loading } = useApi(scopedPath(path, orderType))

  return (
    <>
      <div className="filters">
        <StateSelect value={state} onChange={onStateChange} meta={meta} />
        <div className="legend">
          <span>
            <i style={{ background: 'var(--accent)' }} />
            Orders delivered per day
          </span>
          <span>
            <i style={{ background: 'var(--ontime)' }} />
            On-time rate
          </span>
        </div>
      </div>

      {loading && <Skeleton height={260} />}
      {error && <Failed error={error} />}
      {data && (
        <div className="chart tall">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.series} margin={{ top: 8, right: 0, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="delivered_date"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                minTickGap={64}
                tickFormatter={(d) => d.slice(0, 7)}
              />
              <YAxis yAxisId="left" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 1]}
                ticks={[0, 0.5, 1]}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value, name) =>
                  name === 'adherence' ? [percent(value), 'On time'] : [number(value), 'Orders']
                }
              />
              <Area
                yAxisId="left"
                dataKey="orders"
                stroke="var(--accent)"
                fill="var(--accent)"
                fillOpacity={0.1}
                strokeWidth={1.25}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                dataKey="adherence"
                stroke="var(--ontime)"
                strokeWidth={1}
                dot={false}
                opacity={0.7}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}
