import { useState } from 'react'
import { useApi, useMeta, scopedPath, number, laneName } from '../api'
import { Skeleton, Failed, StateSelect } from './Panel'

const PAGE_SIZE = 15

export function OrderTable({ orderType, state, onStateChange }) {
  const [late, setLate] = useState('')
  const [page, setPage] = useState(1)
  const meta = useMeta()

  const query = new URLSearchParams({ page, page_size: PAGE_SIZE })
  if (state) query.set('state', state)
  if (late) query.set('late', late)

  const { data, error, loading } = useApi(scopedPath(`/api/orders?${query}`, orderType))

  // Filtering while on page 9 of the old result set shows nothing.
  const filter = (apply) => (value) => {
    apply(value)
    setPage(1)
  }

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <>
      <div className="filters">
        <StateSelect value={state} onChange={filter(onStateChange)} meta={meta} />
        <select
          value={late}
          onChange={(event) => filter(setLate)(event.target.value)}
          aria-label="Outcome"
        >
          <option value="">On time and late</option>
          <option value="true">Late only</option>
          <option value="false">On time only</option>
        </select>
        {data && <span className="note push">{number(data.total)} orders</span>}
      </div>

      {loading && <Skeleton height={PAGE_SIZE * 37 + 36} />}
      {error && <Failed error={error} />}
      {data && (
        <table className="data">
          <thead>
            <tr>
              <th>Route</th>
              <th className="hide-sm">Category</th>
              <th className="num">Seller</th>
              <th className="num">Carrier</th>
              <th className="num">Review</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((order) => (
              <tr key={order.order_id}>
                <td>{laneName(order.lane, meta)}</td>
                <td className="hide-sm muted">{order.category?.replaceAll('_', ' ') ?? '—'}</td>
                <td className="num">{(order.seller_leg_hrs / 24).toFixed(1)} d</td>
                <td className="num">{(order.carrier_leg_hrs / 24).toFixed(1)} d</td>
                <td className="num">{order.review_score ?? '—'}</td>
                <td>
                  <span className={`pill ${order.is_late ? 'late' : 'ontime'}`}>
                    {order.is_late ? 'Late' : 'On time'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ← Previous
        </button>
        <span className="note">
          Page {number(page)} of {number(lastPage)}
        </span>
        <button disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
          Next →
        </button>
      </div>
    </>
  )
}
