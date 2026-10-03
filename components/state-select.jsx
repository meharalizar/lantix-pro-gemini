'use client'

import { US_STATES, normalizeState } from '@/lib/us-locations'

const StateSelect = ({ value, onChange, allowAll = false, ...props }) => (
  <select aria-label="State" className="flex h-10 w-full min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={allowAll && value === 'all' ? 'all' : normalizeState(value)} onChange={(event) => onChange(event.target.value)} {...props}>
    {allowAll ? <option value="all">All states</option> : <option value="">Select state</option>}
    {US_STATES.map((state) => <option key={state.code} value={state.code}>{state.name} ({state.code})</option>)}
  </select>
)

export default StateSelect
