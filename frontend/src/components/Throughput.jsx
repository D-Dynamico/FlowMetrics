import { useState } from 'react'
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
import { Panel, Loading, Failed, StateSelect } from './Panel'

// Volume and on-time rate on one chart because neither reads alone: the same dip
// during a volume spike is a capacity story, and on a normal day a process one.
export function Throughput({ orderType }) {
  const [state, setState] = useState('')
  const meta = useMeta()
  const path = state ? `/api/throughput?state=${state}` : '/api/throughput'
  const { data, error, loading } = useApi(scopedPath(path, orderType))

  return (
    <Panel
      title="Daily delivered volume"
      note={data ? `${number(data.series.length)} days` : null}
    >
      <div className="filters">
        <StateSelect value={state} onChange={setState} meta={meta} />
      </div>

      {loading && <Loading what="daily volume" />}
      {error && <Failed error={error} />}
      {data && (
        <div className="chart tall">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data.series}
            margin={{ top: 8, right: 8, bottom: 0, left: -14 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="delivered_date"
              tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
              minTickGap={48}
            />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
            />
            <Tooltip
              formatter={(value, name) =>
                name === 'adherence' ? percent(value) : number(value)
              }
            />
            <Area
              yAxisId="left"
              dataKey="orders"
              stroke="var(--accent)"
              fill="var(--accent)"
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
            <Line
              yAxisId="right"
              dataKey="adherence"
              stroke="var(--ontime)"
              strokeWidth={1}
              dot={false}
              opacity={0.75}
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}
