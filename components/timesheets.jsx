'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardList, Plus, RefreshCw, AlertTriangle, Download, ShieldAlert, Scale, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const money = (cents) => (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const blank = () => ({ assignmentId: '', workDate: '', regularHours: '', overtimeHours: '0', notes: '' })
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const DISPUTE_CATEGORIES = [
  { key: 'hours', label: 'Discrepancy in Recorded Hours' },
  { key: 'attendance', label: 'Call Time / Attendance Issue' },
  { key: 'conduct', label: 'Workplace Conduct / Safety' },
  { key: 'scope', label: 'Scope of Role / Rate Dispute' },
  { key: 'payment_record', label: 'Pay Record Discrepancy' },
  { key: 'other', label: 'Other Contractual Issue' },
]

const Timesheets = ({ api, role }) => {
  const isCompany = role === 'company'
  const [records, setRecords] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState(isCompany ? 'submitted' : 'all')
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [reviewNotes, setReviewNotes] = useState({})

  // Dispute modal state
  const [disputeModalOpen, setDisputeModalOpen] = useState(false)
  const [disputingSheet, setDisputingSheet] = useState(null)
  const [disputeCategory, setDisputeCategory] = useState('hours')
  const [disputeReason, setDisputeReason] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)

  const formRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [data, assigned] = await Promise.all([
        api('/timesheets'),
        isCompany ? Promise.resolve({ assignments: [] }) : api('/timesheets/assignments'),
      ])
      setRecords(data.timesheets || [])
      setAssignments(assigned.assignments || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [api, isCompany])

  useEffect(() => { load() }, [load])

  const assignment = assignments.find((item) => item.id === form.assignmentId)
  const regularRate = editing?.regularRate ?? assignment?.regularRate ?? 0
  const overtimeRate = editing?.overtimeRate ?? assignment?.overtimeRate ?? 0
  const estimate = Math.round(Math.round(Number(form.regularHours || 0) * 100) * Math.round(regularRate * 100) / 100) +
    Math.round(Math.round(Number(form.overtimeHours || 0) * 100) * Math.round(overtimeRate * 100) / 100)
  const approvedTotal = records.filter((item) => item.status === 'approved').reduce((sum, item) => sum + (item.estimatedTotalPayCents || 0), 0)
  const visible = records.filter((item) => filter === 'all' || item.status === filter)

  const change = (field, value) => setForm((previous) => ({ ...previous, [field]: value }))

  const start = (record = null) => {
    setEditing(record)
    setForm(record ? {
      assignmentId: record.assignmentId,
      workDate: record.workDate,
      regularHours: String(record.regularHours),
      overtimeHours: String(record.overtimeHours),
      notes: record.notes || '',
    } : blank())
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    const hours = {
      workDate: form.workDate,
      regularHours: Number(form.regularHours),
      overtimeHours: Number(form.overtimeHours),
      notes: form.notes,
    }
    if (Math.round(hours.regularHours * 100) + Math.round(hours.overtimeHours * 100) <= 0 ||
        Math.round(hours.regularHours * 100) + Math.round(hours.overtimeHours * 100) > 2400) {
      return toast.error('Combined hours must be greater than 0 and no more than 24')
    }
    setBusy('submit')
    try {
      await api(editing ? `/timesheets/${editing.id}/resubmit` : '/timesheets', {
        method: 'POST',
        body: editing ? { ...hours, version: editing.version } : { ...hours, assignmentId: form.assignmentId },
      })
      toast.success(editing ? 'Timesheet resubmitted' : 'Timesheet submitted')
      setShowForm(false)
      setEditing(null)
      setForm(blank())
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy('')
    }
  }

  const review = async (record, status) => {
    if (busy) return
    setBusy(record.id + status)
    try {
      await api(`/timesheets/${record.id}/review`, {
        method: 'POST',
        body: { status, version: record.version, reviewNote: reviewNotes[record.id] || '' },
      })
      toast.success(status === 'approved' ? 'Timesheet approved & locked' : 'Timesheet marked for revision')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy('')
    }
  }

  const openDispute = (sheet) => {
    setDisputingSheet(sheet)
    setDisputeCategory('hours')
    setDisputeReason('')
    setDisputeModalOpen(true)
  }

  const handleDisputeSubmit = async (e) => {
    e.preventDefault()
    if (!disputeReason.trim()) {
      toast.error('Reason is required to open a dispute')
      return
    }
    try {
      setSubmittingDispute(true)
      const res = await api(`/timesheets/${disputingSheet.id}/dispute`, {
        method: 'POST',
        body: {
          category: disputeCategory,
          reason: disputeReason.trim(),
        },
      })
      toast.success('Dispute initiated. Timesheet is frozen pending administrative review.')
      setDisputeModalOpen(false)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmittingDispute(false)
    }
  }

  const exportCsv = () => {
    window.location.href = isCompany ? '/api/company/export/staffing' : '/api/crew/export/timesheets'
  }

  return (
    <div className="space-y-6" data-testid="timesheets-view">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Timesheets</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isCompany ? 'Review, approve, or correct submitted crew hours.' : 'Track hours, submit work time, and review approved earnings.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />Export Timesheets (CSV)
          </Button>
          {!isCompany && (
            <Button size="sm" onClick={() => start()} className="bg-violet-600 hover:bg-violet-700">
              <Plus className="mr-2 h-4 w-4" />New Timesheet
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">Approved labor value</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{money(approvedTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{records.filter((r) => r.status === 'approved').length} locked record(s)</p>
        </Card>
        <Card className="p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">Pending review</p>
          <p className="mt-2 text-2xl font-bold text-violet-600">{records.filter((r) => r.status === 'submitted').length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Awaiting review</p>
        </Card>
        <Card className="p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">Active disputes</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{records.filter((r) => r.status === 'disputed' || r.isDisputed).length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Frozen pending LANTIX mediation</p>
        </Card>
      </div>

      {showForm && (
        <Card ref={formRef} className="border-violet-300 shadow-soft">
          <CardHeader>
            <CardTitle>{editing ? 'Resubmit Corrected Timesheet' : 'New Timesheet Entry'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {!editing && (
                <div className="space-y-2">
                  <Label>Accepted Show Assignment</Label>
                  <select
                    className={selectClass}
                    value={form.assignmentId}
                    onChange={(e) => change('assignmentId', e.target.value)}
                    required
                  >
                    <option value="">Select an accepted show assignment</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.showTitle} · {a.departmentName} ({a.roleTitle}) — ${a.regularRate}/hr
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Work Date</Label>
                  <Input
                    type="date"
                    value={form.workDate}
                    onChange={(e) => change('workDate', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Regular Hours (up to 10)</Label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={form.regularHours}
                    onChange={(e) => change('regularHours', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Overtime Hours (1.5x)</Label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={form.overtimeHours}
                    onChange={(e) => change('overtimeHours', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Shift Notes</Label>
                <Textarea
                  placeholder="Details of call time, breaks, tasks, or equipment handled..."
                  value={form.notes}
                  onChange={(e) => change('notes', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-sm font-semibold text-violet-700">
                  Estimated Pay: {money(estimate)}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={busy === 'submit'} className="bg-violet-600 hover:bg-violet-700">
                    {busy === 'submit' ? 'Submitting...' : editing ? 'Resubmit Timesheet' : 'Submit Timesheet'}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {['all', 'submitted', 'approved', 'rejected', 'disputed'].map((st) => (
          <Button
            key={st}
            size="sm"
            variant={filter === st ? 'default' : 'outline'}
            className={filter === st ? 'bg-violet-600 hover:bg-violet-700 capitalize' : 'capitalize'}
            onClick={() => setFilter(st)}
          >
            {st} ({records.filter((r) => st === 'all' || r.status === st || (st === 'disputed' && r.isDisputed)).length})
          </Button>
        ))}
      </div>

      {/* Timesheet List */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Loading timesheets...</p>
        ) : visible.length === 0 ? (
          <div className="p-8 rounded-lg border border-dashed text-center text-xs text-muted-foreground space-y-1">
            <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <div>No timesheets found in this category.</div>
          </div>
        ) : (
          visible.map((sheet) => {
            const isDisputed = sheet.status === 'disputed' || sheet.isDisputed
            const isApproved = sheet.status === 'approved'

            return (
              <div
                key={sheet.id}
                className={`p-4 rounded-xl border bg-card shadow-soft transition-all space-y-3 ${
                  isDisputed ? 'border-amber-300 bg-amber-50/20 dark:bg-amber-950/10' : ''
                }`}
              >
                {/* Frozen Disputed Banner */}
                {isDisputed && (
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <span className="font-semibold">FROZEN UNDER DISPUTE:</span> Locked from modification pending LANTIX administrative mediation.
                        {sheet.disputeReason && <div className="text-[11px] opacity-90 mt-0.5">Reason: {sheet.disputeReason}</div>}
                      </div>
                    </div>
                    <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">
                      Under Mediation
                    </Badge>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base">{sheet.showTitle || 'Production Show'}</span>
                      <Badge
                        variant="secondary"
                        className={`text-xs capitalize ${
                          isApproved ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                          sheet.status === 'rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' :
                          isDisputed ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                          'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300'
                        }`}
                      >
                        {isApproved && <Lock className="h-2.5 w-2.5 mr-1 inline" />}
                        {isDisputed ? 'Disputed (Frozen)' : sheet.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {sheet.departmentName} · {sheet.roleTitle} · Work Date: <span className="font-medium text-foreground">{sheet.workDate}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Crew: <span className="font-medium text-foreground">{sheet.crewName}</span> · Company: {sheet.companyName}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold text-foreground">
                      {money(sheet.estimatedTotalPayCents)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {sheet.regularHours}h regular (${sheet.regularRate}/h) · {sheet.overtimeHours}h OT (${sheet.overtimeRate}/h)
                    </div>
                  </div>
                </div>

                {sheet.notes && (
                  <div className="text-xs bg-muted/20 p-2.5 rounded border text-muted-foreground">
                    <span className="font-medium text-foreground">Shift notes:</span> {sheet.notes}
                  </div>
                )}

                {sheet.reviewNote && (
                  <div className="text-xs bg-muted/20 p-2.5 rounded border text-muted-foreground">
                    <span className="font-medium text-foreground">Reviewer note:</span> {sheet.reviewNote}
                  </div>
                )}

                {/* Actions Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
                  <div className="text-muted-foreground">
                    Version: v{sheet.version || 1} · Submitted: {sheet.submittedAt ? new Date(sheet.submittedAt).toLocaleDateString() : '—'}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Company Review Controls */}
                    {isCompany && sheet.status === 'submitted' && !isDisputed && (
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Optional review note..."
                          className="h-8 text-xs w-48"
                          value={reviewNotes[sheet.id] || ''}
                          onChange={(e) => setReviewNotes({ ...reviewNotes, [sheet.id]: e.target.value })}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => review(sheet, 'rejected')}
                          disabled={!!busy}
                          className="h-8 text-xs text-rose-600 hover:text-rose-700"
                        >
                          Request Revision
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => review(sheet, 'approved')}
                          disabled={!!busy}
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Approve & Lock
                        </Button>
                      </div>
                    )}

                    {/* Crew Resubmit Control */}
                    {!isCompany && sheet.status === 'rejected' && !isDisputed && (
                      <Button size="sm" onClick={() => start(sheet)} className="h-8 text-xs bg-violet-600 hover:bg-violet-700">
                        Resubmit Corrections
                      </Button>
                    )}

                    {/* Dispute Button */}
                    {!isDisputed && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDispute(sheet)}
                        className="h-8 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                      >
                        <Scale className="h-3.5 w-3.5 mr-1" />
                        Dispute Timesheet
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Dispute Modal */}
      <Dialog open={disputeModalOpen} onOpenChange={setDisputeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Scale className="h-5 w-5" />
              Open Timesheet Dispute
            </DialogTitle>
            <DialogDescription>
              Disputing this timesheet will freeze it from further edits or approvals. LANTIX administration will mediate the record.
            </DialogDescription>
          </DialogHeader>

          {disputingSheet && (
            <form onSubmit={handleDisputeSubmit} className="space-y-4 pt-2">
              <div className="p-3 rounded-lg border bg-muted/20 text-xs space-y-1">
                <div className="font-semibold">{disputingSheet.showTitle}</div>
                <div className="text-muted-foreground">Work Date: {disputingSheet.workDate} · {disputingSheet.crewName}</div>
                <div className="font-medium text-foreground">{disputingSheet.regularHours}h regular · {disputingSheet.overtimeHours}h OT · {money(disputingSheet.estimatedTotalPayCents)}</div>
              </div>

              <div className="space-y-1.5">
                <Label>Dispute Category</Label>
                <Select value={disputeCategory} onValueChange={setDisputeCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPUTE_CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Explanation / Dispute Details</Label>
                <Textarea
                  placeholder="Explain the specific hours, attendance, or rate discrepancy in detail..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={() => setDisputeModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingDispute}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {submittingDispute ? 'Freezing...' : 'Submit Dispute & Freeze'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Timesheets
