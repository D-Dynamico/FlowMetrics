import { useState } from 'react'
import { Panel, Tabs } from './Panel'
import { Throughput } from './Throughput'
import { OrderTable } from './OrderTable'

const VIEWS = [
  { key: 'volume', label: 'Daily volume' },
  { key: 'orders', label: 'Order list' },
]

// The daily series and the raw order list are for checking, not for the story,
// so they share one panel at the bottom instead of taking two full blocks.
export function Explore({ orderType }) {
  const [view, setView] = useState('volume')
  const [state, setState] = useState('')

  return (
    <Panel actions={<Tabs options={VIEWS} value={view} onChange={setView} />}>
      {view === 'volume' ? (
        <Throughput orderType={orderType} state={state} onStateChange={setState} />
      ) : (
        <OrderTable orderType={orderType} state={state} onStateChange={setState} />
      )}
    </Panel>
  )
}
