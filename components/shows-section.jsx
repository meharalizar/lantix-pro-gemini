'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import StaffingInvitations from '@/components/staffing-invitations'
import StateSelect from '@/components/state-select'
import { CalendarDays, MapPin, Plus, ArrowLeft, Trash2, Users, Loader2, Download, BarChart3, FileSpreadsheet } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STATUSES = ['draft', 'open', 'completed', 'cancelled']
const blankShow = () => ({ title: '', venueName: '', city: '', state: '', startDate: '', endDate: '', description: '', status: 'draft', staffing: [] })
const blankRow = () => ({ departmentName: '', roleTitle: '', headcountNeeded: '1', regularRate: '', overtimeRate: '', callTime: '', wrapTime: '', requiredSkills: '', requiredCertifications: '' })
const listFromText = (value) => [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))]
const rowPayload = (row) => ({ ...row, headcountNeeded: Number(row.headcountNeeded), regularRate: Number(row.regularRate), overtimeRate: Number(row.overtimeRate), requiredSkills: listFromText(row.requiredSkills), requiredCertifications: listFromText(row.requiredCertifications) })
const totalCrew = (show) => (show?.staffing || []).reduce((sum, row) => sum + (row?.headcountNeeded || 0), 0)
const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const shortDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const ShowField = ({ label, value, onChange, multiline, ...props }) => {
  const id = useId()
  const Control = multiline ? Textarea : Input
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Control id={id} value={value} onChange={(event) => onChange(event.target.value)} {...props} /></div>
}

const StaffingFields = ({ row, onChange }) => {
  const field = (key, label, props = {}) => <ShowField label={label} value={row?.[key] || ''} onChange={(value) => onChange({ ...row, [key]: value })} required {...props} />
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('departmentName', 'Department name', { placeholder: 'Audio', maxLength: 100 })}
      {field('roleTitle', 'Role / title', { placeholder: 'FOH Engineer', maxLength: 150 })}
      {field('headcountNeeded', 'Headcount needed', { type: 'number', min: 1, max: 10000, step: 1 })}
      {field('regularRate', 'Regular rate (USD / hour)', { type: 'number', min: 0, max: 1000000, step: '0.01' })}
      {field('overtimeRate', 'Overtime rate (USD / hour)', { type: 'number', min: 0, max: 1000000, step: '0.01' })}
      {field('callTime', 'Call time (venue local)', { type: 'time' })}
      {field('wrapTime', 'Wrap time (venue local)', { type: 'time' })}
      {field('requiredSkills', 'Required skills', { required: false, placeholder: 'Mixing, RF coordination', maxLength: 5000 })}
      {field('requiredCertifications', 'Required certifications', { required: false, placeholder: 'OSHA, ETCP', maxLength: 5000 })}
    </div>
  )
}

const ShowsSection = ({ api, initialCreate = false }) => {
  const [shows, setShows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState(initialCreate ? 'create' : 'list')
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(blankShow)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState(blankRow)
  const [editingRow, setEditingRow] = useState(null)
  const [departmentTab, setDepartmentTab] = useState('all')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryData, setSummaryData] = useState(null)

  const openSummary = async () => {
    if (!selected?.id) return
    setSummaryLoading(true)
    setSummaryOpen(true)
    try {
      const data = await api(`/shows/${selected.id}/summary`)
      setSummaryData(data)
    } catch (err) {
      toast.error(err.message)
      setSummaryOpen(false)
    } finally {
      setSummaryLoading(false)
    }
  }

  const exportCsv = () => {
    if (!selected?.id) return
    window.location.href = `/api/shows/${selected.id}/export`
    toast.success('Downloading show staffing CSV…')
  }
  const beginShowEdit = () => {
    setDraft(Object.fromEntries(Object.keys(blankShow()).map((key) => [key, key === 'staffing' ? [] : selected?.[key] || ''])))
    setView('edit')
  }
  const beginRowEdit = (row) => {
    setEditingRow(row.id)
    setNewRow(Object.fromEntries(Object.keys(blankRow()).map((key) => [key, ['requiredSkills', 'requiredCertifications'].includes(key) ? (row[key] || []).join(', ') : String(row[key] ?? '')])))
    setAdding(true)
  }
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const data = await api('/shows'); setShows(data.shows || []) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [api])
  useEffect(() => { load() }, [load])

  const remember = (show) => {
    setShows((list) => [show, ...list.filter((item) => item.id !== show.id)].sort((a, b) => a.startDate.localeCompare(b.startDate)))
    setSelected(show)
  }
  const openShow = async (id) => {
    setOpening(id)
    try { const data = await api(`/shows/${id}`); setSelected(data.show); setAdding(false); setView('detail') }
    catch (err) { toast.error(err.message) }
    finally { setOpening(null) }
  }
  const create = async (event) => {
    event.preventDefault()
    if (busy) return
    if (draft.endDate < draft.startDate) return toast.error('End date cannot be before start date')
    setBusy(true)
    try {
      const editing = view === 'edit'
      const { staffing, ...details } = draft
      const data = await api(editing ? `/shows/${selected.id}` : '/shows', { method: editing ? 'PUT' : 'POST', body: editing ? details : { ...details, staffing: staffing.map(rowPayload) } })
      remember(data.show); setView('detail'); setAdding(false); setDraft(blankShow()); toast.success(editing ? 'Show updated' : 'Show created')
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }
  const addStaffing = async (event) => {
    event.preventDefault()
    if (busy || !selected?.id) return
    setBusy(true)
    try {
      const data = await api(`/shows/${selected.id}/staffing${editingRow ? `/${editingRow}` : ''}`, { method: editingRow ? 'PUT' : 'POST', body: rowPayload(newRow) })
      remember(data.show); setAdding(false); setEditingRow(null); setNewRow(blankRow()); toast.success(editingRow ? 'Staffing updated; saved timesheet rates preserved' : 'Staffing need added')
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }
  const update = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }))
  const back = () => { setView('list'); setAdding(false) }

  return (
    <Card data-testid="shows-section" className="bg-card text-card-foreground border-border">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Shows / Events</CardTitle><p className="mt-1 text-sm text-muted-foreground">Plan your event and the people each department needs.</p></div>
        {view === 'list' ? <Button onClick={() => { setDraft(blankShow()); setView('create') }} data-testid="new-show"><Plus className="mr-2 h-4 w-4" />New show</Button> : <Button variant="outline" onClick={back} disabled={busy}><ArrowLeft className="mr-2 h-4 w-4" />All shows</Button>}
      </CardHeader>
      <CardContent className="space-y-5">
        {view === 'list' && (
          loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading shows…</p> : error ? <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" onClick={load}>Retry shows</Button></div> : shows.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center"><CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h3 className="font-semibold">Your first show starts here</h3><p className="mt-1 text-sm text-muted-foreground">Create an event, then add your audio, lighting, stage, and other staffing needs.</p></div> : <div className="grid gap-3 md:grid-cols-2">{shows.map((show) => <div key={show.id} className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="show-list-item"><div className="flex items-start justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{show.title}</h3><Badge variant="secondary" className="capitalize shrink-0">{show.status}</Badge></div><p className="text-sm text-muted-foreground break-words">{show.venueName} · {show.city}, {show.state}</p><p className="text-sm">{shortDate(show.startDate)} – {shortDate(show.endDate)}</p><div className="mt-auto flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{(show.staffing || []).length} staffing rows · {totalCrew(show)} people needed</span><Button size="sm" variant="outline" disabled={!!opening} onClick={() => openShow(show.id)} aria-label={`View show ${show.title}`}>{opening === show.id ? 'Loading…' : 'View details'}</Button></div></div>)}</div>
        )}

        {(view === 'create' || view === 'edit') && <form onSubmit={create} className="space-y-5" data-testid="create-show-form">
          <fieldset disabled={busy} className="space-y-5">
            <h3 className="font-semibold">{view === 'edit' ? 'Edit show / event' : 'Create a show / event'}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ShowField label="Show title" value={draft.title} onChange={(value) => update('title', value)} required maxLength={200} placeholder="Summer Festival" />
              <ShowField label="Venue name" value={draft.venueName} onChange={(value) => update('venueName', value)} required maxLength={200} />
              <ShowField label="City" value={draft.city} onChange={(value) => update('city', value)} required maxLength={100} />
              <div className="space-y-1.5"><Label htmlFor="show-state">State</Label><StateSelect id="show-state" value={draft.state} onChange={(value) => update('state', value)} required /></div>
              <ShowField label="Start date" value={draft.startDate} onChange={(value) => update('startDate', value)} required type="date" />
              <ShowField label="End date" value={draft.endDate} onChange={(value) => update('endDate', value)} required type="date" min={draft.startDate || undefined} />
              <div className="space-y-1.5"><Label htmlFor="show-status">Status</Label><Select value={draft.status} onValueChange={(value) => update('status', value)} disabled={busy}><SelectTrigger id="show-status" className="capitalize"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((status) => <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <ShowField label="Description (optional)" value={draft.description} onChange={(value) => update('description', value)} multiline rows={3} maxLength={5000} />
            {view === 'create' && <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Department staffing needs</h4><Button type="button" variant="outline" disabled={draft.staffing.length >= 100} onClick={() => update('staffing', [...draft.staffing, blankRow()])}><Plus className="mr-1 h-4 w-4" />Add staffing row</Button></div>
              <p className="text-xs text-muted-foreground">Add needs now or after saving. Enter skills and certifications separated by commas. A wrap time earlier than call time means the next day.</p>
              {draft.staffing.map((row, index) => <div key={index} className="space-y-3 rounded-lg border border-border bg-muted/20 p-4" data-testid="staffing-draft-row"><div className="flex items-center justify-between"><h5 className="text-sm font-semibold">Staffing row {index + 1}</h5><Button type="button" variant="ghost" size="sm" aria-label={`Remove staffing row ${index + 1}`} onClick={() => update('staffing', draft.staffing.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div><StaffingFields row={row} onChange={(value) => update('staffing', draft.staffing.map((item, i) => i === index ? value : item))} /></div>)}
            </div>}
            {view === 'edit' && <p className="text-xs text-muted-foreground">Date changes cannot exclude any recorded timesheet work dates. Existing assignments and timesheets are preserved.</p>}
            <div className="flex gap-2"><Button type="submit">{busy ? 'Saving…' : view === 'edit' ? 'Save show changes' : 'Create show'}</Button><Button type="button" variant="outline" onClick={back}>Cancel</Button></div>
          </fieldset>
        </form>}

        {view === 'detail' && selected && <div className="space-y-5" data-testid="show-detail">
          <div className="rounded-lg border border-border bg-muted/20 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-semibold break-words min-w-0">{selected.title}</h3>
                <Badge variant="secondary" className="capitalize">{selected.status}</Badge>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={beginShowEdit}>Edit show</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={openSummary}><BarChart3 className="mr-1.5 h-4 w-4" />Show summary</Button>
                <Button type="button" variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Export CSV</Button>
              </div>
            </div>
            <p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-words min-w-0">{selected.venueName} · {selected.city}, {selected.state}</span></p>
            <p className="text-sm">{shortDate(selected.startDate)} – {shortDate(selected.endDate)}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{selected.description || 'No description provided.'}</p>
            <p className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4" />{totalCrew(selected)} people needed across {(selected.staffing || []).length} staffing rows</p>
          </div>

          {/* Department Tabs */}
          {(() => {
            const depts = ['all', ...new Set((selected.staffing || []).map((r) => r.departmentName).filter(Boolean))]
            if (depts.length <= 1) return null
            return (
              <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase mr-1">Departments:</span>
                {depts.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={departmentTab === d ? 'default' : 'outline'}
                    className="capitalize text-xs h-8"
                    onClick={() => setDepartmentTab(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            )
          })()}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">Department staffing needs {departmentTab !== 'all' ? `(${departmentTab})` : ''}</h4>
            <Button variant="outline" disabled={adding || (selected.staffing || []).length >= 100} onClick={() => { setEditingRow(null); setNewRow(departmentTab !== 'all' ? { ...blankRow(), departmentName: departmentTab } : blankRow()); setAdding(true) }}>
              <Plus className="mr-1 h-4 w-4" />Add staffing need
            </Button>
          </div>
          {adding && <form onSubmit={addStaffing} className="rounded-lg border border-border bg-muted/20 p-4" data-testid="add-staffing-form"><fieldset disabled={busy} className="space-y-4"><h5 className="font-semibold">{editingRow ? 'Edit staffing row' : 'Add staffing need'}</h5><StaffingFields row={newRow} onChange={setNewRow} /><p className="text-xs text-muted-foreground">Separate requirements with commas. Earlier wrap times mean next day.</p><div className="flex gap-2"><Button type="submit">{busy ? 'Saving…' : editingRow ? 'Save staffing changes' : 'Save staffing need'}</Button><Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button></div></fieldset></form>}
          {(selected.staffing || []).length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No staffing needs yet. Add your first department role above.</p> : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm" data-testid="staffing-table">
                <thead className="bg-muted text-muted-foreground">
                  <tr>{['Department / role', 'Headcount', 'Regular / OT (USD/hr)', 'Call / wrap', 'Requirements'].map((heading) => <th key={heading} scope="col" className="p-3 font-medium whitespace-nowrap">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {(selected.staffing || [])
                    .filter((row) => departmentTab === 'all' || row.departmentName === departmentTab)
                    .map((row) => (
                      <tr key={row.id} className="border-t border-border align-top">
                        <td className="p-3 min-w-40 max-w-xs break-words">
                          <p className="font-medium">{row.departmentName}</p>
                          <p className="text-muted-foreground">{row.roleTitle}</p>
                          <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy} aria-label={`Edit staffing ${row.departmentName} ${row.roleTitle}`} onClick={() => beginRowEdit(row)}>Edit row</Button>
                        </td>
                        <td className="p-3">{row.headcountNeeded}</td>
                        <td className="p-3 whitespace-nowrap">{money(row.regularRate)} / {money(row.overtimeRate)}</td>
                        <td className="p-3 whitespace-nowrap">{row.callTime} – {row.wrapTime}{row.wrapTime < row.callTime && <span className="block text-xs text-muted-foreground">Wraps next day</span>}</td>
                        <td className="p-3 min-w-48 max-w-xs break-words">
                          <p>Skills: {(row.requiredSkills || []).join(', ') || 'None specified'}</p>
                          <p className="mt-1 text-muted-foreground">Certs: {(row.requiredCertifications || []).join(', ') || 'None specified'}</p>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <StaffingInvitations key={selected.id} api={api} show={selected} onChanged={async () => {
            try { const data = await api(`/shows/${selected.id}`); remember(data.show) }
            catch (err) { toast.error(err.message) }
          }} />
          <p className="text-xs text-muted-foreground">Rates are hourly USD; times are venue-local. Accepted invitations assign crew to the staffing row. Accepted assignments and submitted/approved timesheets appear in the in-app calendar. Saved timesheet rates are not changed by staffing edits.</p>
        </div>}

        {/* Show Summary Modal Dialog */}
        <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Full Show Summary — {selected?.title}
              </DialogTitle>
            </DialogHeader>
            {summaryLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading show metrics…</p>
            ) : summaryData ? (
              <div className="space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Headcount Filled</p>
                    <p className="mt-1 text-2xl font-bold">{summaryData.metrics.totalHeadcountFilled} / {summaryData.metrics.totalHeadcountNeeded}</p>
                    <p className="text-[11px] text-muted-foreground">{summaryData.metrics.percentFilled}% filled</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Total Hours</p>
                    <p className="mt-1 text-2xl font-bold">{summaryData.metrics.totalHours} hrs</p>
                    <p className="text-[11px] text-muted-foreground">{summaryData.metrics.totalRegularHours} reg / {summaryData.metrics.totalOvertimeHours} OT</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Approved Payroll</p>
                    <p className="mt-1 text-2xl font-bold text-primary">{summaryData.metrics.totalEstimatedPayFormatted}</p>
                    <p className="text-[11px] text-muted-foreground">From approved timesheets</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Departments</p>
                    <p className="mt-1 text-2xl font-bold">{summaryData.departments.length}</p>
                    <p className="text-[11px] text-muted-foreground">Active in show</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Department Breakdown</h4>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {summaryData.departments.map((dept) => (
                      <div key={dept.name} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{dept.name}</p>
                          <p className="text-xs text-muted-foreground">{dept.roles.length} roles: {dept.roles.map((r) => r.roleTitle).join(', ')}</p>
                        </div>
                        <Badge variant={dept.headcountFilled >= dept.headcountNeeded ? 'default' : 'secondary'}>
                          {dept.headcountFilled} / {dept.headcountNeeded} staffed
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Assigned Crew ({summaryData.crew.length})</h4>
                  {summaryData.crew.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No crew assigned to this show yet.</p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border max-h-48 overflow-y-auto">
                      {summaryData.crew.map((c) => (
                        <div key={c.assignmentId} className="p-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-medium text-foreground">{c.crewName}</span>
                            <span className="text-muted-foreground ml-2">· {c.department} ({c.role})</span>
                          </div>
                          <span className="text-muted-foreground">${c.regularRate}/hr · {c.timesheetsCount} timesheets</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button type="button" variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-3.5 w-3.5" />Export full staffing CSV</Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export default ShowsSection
