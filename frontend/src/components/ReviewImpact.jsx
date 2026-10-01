import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { useApi, scopedPath, percent } from '../api'
import { Panel, Skeleton, Failed } from './Panel'

const AXIS = { fontSize: 11, fill: 'var(--ink-faint)' }

// This is what turns an operational metric into a business consequence. A
// manager can ignore a percentage; a measurable drop in customer satisfaction is
// harder to leave alone.
export function ReviewImpact({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/kpis', orderType))

  if (loading) return <Skeleton height={280} />
  if (error) return <Failed error={error} />

  const review = data.review_impact
  if (!review?.on_time) return null

  const scores = [1, 2, 3, 4, 5].map((score) => ({
    score: `${score}★`,
    'On time': review.on_time.distribution[score] ?? 0,
    Late: review.late.distribution[score] ?? 0,
  }))

  return (
    <Panel>
      <div className="split tight">
        <div>
          <p className="figure">
            {review.on_time.mean_score.toFixed(1)}
            <span className="arrow">→</span>
            <span className="bad">{review.late.mean_score.toFixed(1)}</span>
            <small>
              Average review score, on time against late.{' '}
              {percent(review.late.distribution[1] ?? 0, 0)} of late orders get one star,
              against{' '}
              {percent(review.on_time.distribution[1] ?? 0, 0)} of on-time ones.
            </small>
          </p>
          <div className="legend">
            <span>
              <i style={{ background: 'var(--ontime)' }} />
              On time
            </span>
            <span>
              <i style={{ background: 'var(--late)' }} />
              Late
            </span>
          </div>
        </div>

        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scores} margin={{ top: 6, right: 4, bottom: 0, left: -18 }} barGap={2}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="score" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip formatter={(v) => percent(v)} cursor={{ fill: 'var(--surface-sunk)' }} />
              <Bar dataKey="On time" fill="var(--ontime)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Late" fill="var(--late)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Panel>
  )
}
