import { useState } from 'react'
import { useApi, useMeta, scopedPath, number, laneName } from '../api'
import { Panel, Loading, Failed, StateSelect } from './Panel'

export function OrderTable({ orderType }) {
  const [state, setState] = useState('')
  const [late, setLate] = useState('')
  const [page, setPage] = useState(1)
  const meta = useMeta()

  const query = new URLSearchParams({ page, page_size: 25 })
  if (state) query.set('state', state)
  if (late) query.set('late', late)

  const { data, error, loading } = useApi(
    scopedPath(`/api/orders?${query}`, orderType),
  )

  const change = (setter) => (event) => {
    setter(event.target.value)
    setPage(1) // Filtering while on page 9 of the old result set shows nothing.
  }

  const lastPage = data ? Math.ceil(data.total / data.page_size) : 1

  return (
    <Panel title="Orders" note={data ? `${number(data.total)} matching` : null}>
      <div className="filters">
        <StateSelect
          value={state}
          onChange={(next) => {
            setState(next)
            setPage(1)
          }}
          meta={meta}
        />
        <select value={late} onChange={change(setLate)}>
          <option value="">On time and late</option>
          <option value="true">Late only</option>
          <option value="false">On time only</option>
        </select>
        <button className="page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ‹ Prev
        </button>
        <span className="note">
          Page {page} of {number(lastPage)}
        </span>
        <button
          className="page"
          disabled={page >= lastPage}
          onClick={() => setPage(page + 1)}
        >
          Next ›
        </button>
      </div>

      {loading && <Loading what="orders" />}
      {error && <Failed error={error} />}
      {data && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th>Category</th>
                <th className="num">Distance</th>
                <th className="num">Seller</th>
                <th className="num">Carrier</th>
                <th className="num">Total</th>
                <th className="num">Review</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.order_id}>
                  <td>{laneName(order.lane, meta)}</td>
                  <td>{order.category ?? '—'}</td>
                  <td className="num">
                    {order.distance_km == null
                      ? '—'
                      : `${number(Math.round(order.distance_km))} km`}
                  </td>
                  <td className="num">{(order.seller_leg_hrs / 24).toFixed(1)} d</td>
                  <td className="num">{(order.carrier_leg_hrs / 24).toFixed(1)} d</td>
                  <td className="num">{(order.total_tat_hrs / 24).toFixed(1)} d</td>
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
        </div>
      )}
    </Panel>
  )
}
