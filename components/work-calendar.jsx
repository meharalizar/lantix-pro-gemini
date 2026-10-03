'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const labels = { job: 'Job', booking: 'Booking', show: 'Show', assignment: 'Assignment', timesheet: 'Timesheet' }
const color = (event) => event.status === 'cancelled' ? 'bg-destructive text-destructive-foreground' : event.kind === 'show' ? 'bg-primary text-primary-foreground' : event.kind === 'assignment' ? 'bg-chart-2 text-foreground' : event.kind === 'timesheet' ? 'bg-chart-4 text-foreground' : 'bg-chart-3 text-foreground'
const WorkCalendar = ({ api }) => {
  const [events, setEvents] = useState([])
  const [cursor, setCursor] = useState(new Date())
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const year = cursor.getFullYear(), month = cursor.getMonth()
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0)
  const dateKey = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const from = dateKey(1), to = dateKey(last.getDate())
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setEvents([]); setSelected(null)
    api(`/calendar?from=${from}&to=${to}`).then((data) => { if (active) setEvents(data.events || []) }).catch((err) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, from, to, revision])
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: last.getDate() }, (_, i) => i + 1)]
  const byDay = {}
  for (const event of events) (byDay[event.date] ||= []).push(event)
  return <div className="space-y-4" data-testid="work-calendar">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</h3><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹ Prev</Button><Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Today</Button><Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month + 1, 1))}>Next ›</Button><Button size="sm" variant="outline" disabled={loading} onClick={() => setRevision((n) => n + 1)}>Refresh calendar</Button></div></div>
    <div className="flex flex-wrap gap-3 text-xs">{['show', 'assignment', 'timesheet', 'job'].map((kind) => <span key={kind} className="flex items-center gap-1"><span className={`h-3 w-3 rounded ${color({ kind })}`} />{kind === 'job' ? 'Jobs / bookings' : labels[kind]}</span>)}</div>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading calendar…</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="overflow-x-auto"><div className="grid min-w-[640px] grid-cols-7 gap-1 rounded-lg border border-border bg-card p-2">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="py-1 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}{cells.map((day, index) => <div key={index} className={`min-h-[110px] rounded-lg p-1.5 ${day ? 'bg-muted/50' : ''}`}>{day && <div className="mb-1 text-xs text-muted-foreground">{day}</div>}{day && (byDay[dateKey(day)] || []).map((event, i) => <button type="button" key={`${event.kind}-${event.id}-${i}`} onClick={() => setSelected(event)} className={`mb-1 w-full break-words rounded px-1.5 py-1 text-left text-[11px] leading-tight ${color(event)}`}><span className="block font-semibold">{labels[event.kind] || event.kind}{event.kind === 'timesheet' ? ` · ${event.status}` : ''}</span>{event.kind === 'show' ? event.role : `${event.showTitle ? event.showTitle + ' · ' : ''}${event.role}`}{event.crewName && <span className="block">{event.crewName}</span>}</button>)}</div>)}</div></div>
    <p className="text-xs text-muted-foreground">Multi-day shows and accepted assignments appear on each show date. Timesheets appear on their work date. This is the in-app calendar; refresh to see changes.</p>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}><DialogContent><DialogHeader><DialogTitle>{labels[selected?.kind]} · {selected?.showTitle || selected?.role}</DialogTitle></DialogHeader>{selected && <div className="space-y-2 text-sm"><p>{selected.role}</p><p>{selected.date} · <span className="capitalize">{selected.status}</span></p><p>{[selected.venueName, selected.city, selected.state].filter(Boolean).join(', ')}</p>{selected.crewName && <p>Crew: {selected.crewName}</p>}{selected.callTime && <p>Call {selected.callTime}{selected.wrapTime ? ` · Wrap ${selected.wrapTime}${selected.wrapTime < selected.callTime ? ' (next day)' : ''}` : ''} · Venue-local</p>}{selected.kind === 'timesheet' && <><p>Regular: {selected.regularHours} hours × ${selected.regularRate}/hr</p><p>Overtime: {selected.overtimeHours} hours × ${selected.overtimeRate}/hr</p><p className="font-semibold">Estimated pay: {(Number(selected.estimatedTotalPayCents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p></>}</div>}</DialogContent></Dialog>
  </div>
}

export default WorkCalendar
