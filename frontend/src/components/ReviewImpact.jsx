import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useApi, scopedPath, percent } from '../api'
import { Panel, Loading, Failed } from './Panel'

// This is what turns an operational metric into a business consequence. A
// manager can ignore a percentage; a measurable drop in customer satisfaction is
// harder to leave alone.
export function ReviewImpact({ orderType }) {
  const { data, error, loading } = useApi(scopedPath('/api/kpis', orderType))

  if (loading) return <Loading what="review scores" />
  if (error) return <Failed error={error} />

  const review = data.review_impact
  if (!review?.on_time) return null

  const scores = [1, 2, 3, 4, 5].map((score) => ({
    score: `${score}★`,
    'On time': review.on_time.distribution[score] ?? 0,
    Late: review.late.distribution[score] ?? 0,
  }))

  return (
    <Panel title="What lateness costs in customer satisfaction">
      <p className="figure">
        {review.on_time.mean_score} → {review.late.mean_score}
        <small>
          Mean review score falls by {review.score_gap} points when an order
          misses its promised date. {percent(review.late.distribution[1] ?? 0)} of
          late orders are rated one star, against{' '}
          {percent(review.on_time.distribution[1] ?? 0)} of on-time ones.
        </small>
      </p>

      <div className="chart tall">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={scores} margin={{ top: 16, right: 10, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="score" tick={{ fontSize: 12, fill: 'var(--ink-faint)' }} />
          <YAxis
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
          />
          <Tooltip formatter={(v) => percent(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="On time" fill="var(--ontime)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Late" fill="var(--late)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </Panel>
  )
}
