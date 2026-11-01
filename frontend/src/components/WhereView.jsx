import { useState } from 'react'
import { useApi, scopedPath, percent, number, days, laneName, stateName } from '../api'
import { Panel, Skeleton, Failed, ViewTitle } from './Panel'

// Brazil's 27 states on a grid that keeps each one roughly where it sits on a
// real map. Equal tiles on purpose: on a true map São Paulo's weight and the
// Amazon's size would swamp the small north-eastern states this finding is about.
const TILES = {
  RR: [2, 0], AP: [3, 0],
  AM: [2, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [1, 2], RO: [2, 2], MT: [3, 2], TO: [4, 2], PI: [5, 2], PB: [6, 2],
  GO: [3, 3], DF: [4, 3], BA: [5, 3], PE: [6, 3], AL: [7, 3],
  MS: [3, 4], MG: [4, 4], ES: [5, 4], SE: [6, 4],
  PR: [3, 5], SP: [4, 5], RJ: [5, 5],
  SC: [3, 6],
  RS: [3, 7],
}

const RAMP = [
  { from: 2.5, label: '2.5× or more', className: 'step-4' },
  { from: 2, label: '2–2.5×', className: 'step-3' },
  { from: 1.5, label: '1.5–2×', className: 'step-2' },
  { from: 1, label: '1–1.5×', className: 'step-1' },
  { from: 0, label: 'Under its share', className: 'step-0' },
]

const stepFor = (lift) => RAMP.find((step) => lift >= step.from)?.className ?? 'step-0'

function TileMap({ rows, selected, onSelect, meta, stageLabel }) {
  return (
    <>
      <div className="tiles" role="group" aria-label="Brazilian states">
        {Object.entries(TILES).map(([code, [column, row]]) => {
          const state = rows[code]
          const thin = !state?.enough_orders
          return (
            <button
              key={code}
              className={thin ? 'tile thin-tile' : `tile ${stepFor(state.lift ?? 0)}`}
              style={{ gridColumn: column + 1, gridRow: row + 1 }}
              aria-pressed={selected === code}
              aria-label={`${stateName(code, meta)}, ${state?.lift?.toFixed(2) ?? 'no'} times its share`}
              title={stateName(code, meta)}
              onClick={() => onSelect(code)}
            >
              <b>{code}</b>
              <span>{thin || state.lift == null ? '—' : `${state.lift.toFixed(1)}×`}</span>
            </button>
          )
        })}

        <div className="map-key">
          <p>
            Share of {stageLabel} late orders, against share of all orders
          </p>
          <ul>
            {RAMP.map((step) => (
              <li key={step.className}>
                <i className={step.className} />
                {step.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

function RoutesInto({ code, orderType, meta }) {
  const path = scopedPath(`/api/lanes?sort_by=adherence&limit=4&customer_state=${code}`, orderType)
  const { data, loading } = useApi(path)

  if (loading) return <p className="note">Loading routes…</p>
  const lanes = data?.lanes ?? []
  if (lanes.length === 0) {
    return (
      <p className="note">
        No route into this state reaches {data?.min_orders_per_lane} orders.
      </p>
    )
  }

  return (
    <ul className="rows">
      {lanes.map((lane) => (
        <li key={lane.lane}>
          <span>{laneName(lane.lane, meta)}</span>
          <span className="muted">{number(lane.orders)} orders</span>
          <b>{percent(lane.adherence, 0)}</b>
        </li>
      ))}
    </ul>
  )
}

function StateFile({ code, state, lift, orderType, meta, stageLabel }) {
  return (
    <Panel>
      <h2 className="file-title">{stateName(code, meta)}</h2>
      <p className="note">
        {meta?.states?.find((item) => item.code === code)?.region} region
      </p>

      <p className="file-figure">
        {lift?.lift != null ? `${lift.lift.toFixed(2)}×` : '—'}
        <small>its share of orders</small>
      </p>

      <dl className="facts">
        <dt>Orders</dt>
        <dd>{number(state?.orders)}</dd>
        <dt>Late orders</dt>
        <dd>{number(state?.late_orders)}</dd>
        <dt>Delivered on time</dt>
        <dd>{percent(state?.adherence)}</dd>
        <dt>Typical carrier transit</dt>
        <dd>{days(state?.median_carrier_hrs)}</dd>
        <dt>Typical distance</dt>
        <dd>{state?.median_distance_km != null ? `${number(Math.round(state.median_distance_km))} km` : '—'}</dd>
        <dt>Share of {stageLabel} late orders</dt>
        <dd>{percent(lift?.miss_share)}</dd>
        <dt>Share of all orders</dt>
        <dd>{percent(lift?.order_share)}</dd>
      </dl>

      <h3 className="subhead">Worst routes into {stateName(code, meta)}</h3>
      <RoutesInto code={code} orderType={orderType} meta={meta} />
    </Panel>
  )
}

function DistanceTable({ distance }) {
  if (!distance) return null
  return (
    <Panel title="On-time rate by delivery distance" note="Falls with distance, but distance travels with region">
      <table className="data">
        <thead>
          <tr>
            <th>Distance</th>
            <th className="num">Orders</th>
            <th className="num">On time</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(distance.bands).map(([band, stats]) => (
            <tr key={band}>
              <td>{band} km</td>
              <td className="num">{number(stats.orders)}</td>
              <td className="num sorted">{percent(stats.adherence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function RegionTable({ regions }) {
  return (
    <Panel title="On-time rate by region" note="Worst first, with typical carrier transit">
      <table className="data">
        <thead>
          <tr>
            <th>Region</th>
            <th className="num">Orders</th>
            <th className="num">Transit</th>
            <th className="num">On time</th>
          </tr>
        </thead>
        <tbody>
          {regions.map((region) => (
            <tr key={region.customer_region}>
              <td>{region.customer_region}</td>
              <td className="num">{number(region.orders)}</td>
              <td className="num">{days(region.median_carrier_hrs)}</td>
              <td className="num sorted">{percent(region.adherence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

export function WhereView({ orderType, meta }) {
  const rca = useApi(scopedPath('/api/rca', orderType))
  const states = useApi(scopedPath('/api/states', orderType))
  const [picked, setPicked] = useState(null)

  const title = (
    <ViewTitle
      title="Where the late orders concentrate"
      note="Pick a state to open its file. Darker states carry more late orders than their volume explains."
    />
  )

  if (rca.loading || states.loading) {
    return (
      <>
        {title}
        <Skeleton height={900} phone={1690} />
      </>
    )
  }
  if (rca.error || states.error) return <Failed error={rca.error || states.error} />

  const overall = rca.data.overall
  const lifts = overall.state_lift
  const stageLabel = {
    approval: 'payment approval',
    seller: 'seller handover',
    carrier: 'carrier transit',
  }[overall.dominant_leg]

  const rows = {}
  for (const row of states.data.states) {
    rows[row.customer_state] = { ...row, lift: lifts[row.customer_state]?.lift ?? null }
  }

  // Opens on the state the finding names, so the file is never empty.
  const worst = Object.values(rows)
    .filter((row) => row.enough_orders && row.lift != null)
    .sort((a, b) => b.lift - a.lift)[0]?.customer_state
  const code = picked && rows[picked] ? picked : worst

  return (
    <>
      {title}
      <div className="where-grid">
        <Panel title="Late orders against order volume, by state">
          <TileMap
            rows={rows}
            selected={code}
            onSelect={setPicked}
            meta={meta}
            stageLabel={stageLabel}
          />
        </Panel>
        <StateFile
          code={code}
          state={rows[code]}
          lift={lifts[code]}
          orderType={orderType}
          meta={meta}
          stageLabel={stageLabel}
        />
      </div>

      <div className="pair-grid">
        <DistanceTable distance={overall.drivers?.distance} />
        <RegionTable regions={overall.region_summary} />
      </div>

      {/* Beside the geography, not in a README footnote. The predictors are
          confounded, and a reader who quotes this view should meet that here. */}
      <p className="caveat">{rca.data.causal_caveat}</p>
    </>
  )
}
