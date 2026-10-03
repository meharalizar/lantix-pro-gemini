'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ShieldCheck, LayoutDashboard, Users, Building2, CalendarDays, Briefcase, FileText,
  ClipboardList, UserCheck, Scale, Plus, Search, RefreshCw, LockKeyhole, BarChart3,
  MessageSquare, AlertTriangle, CheckCircle2, XCircle, ArrowUpRight, DollarSign,
} from 'lucide-react'
import AppShell, { Brand } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const NAV = [
  { k: 'overview', label: 'Overview', icon: LayoutDashboard },
  { k: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
  { k: 'companies', label: 'Companies', icon: Building2 },
  { k: 'users', label: 'Users & access', icon: Users },
  { k: 'crew', label: 'Crew master list', icon: ClipboardList },
  { k: 'shows', label: 'Shows / events', icon: CalendarDays },
  { k: 'jobs', label: 'Jobs', icon: Briefcase },
  { k: 'rfps', label: 'RFPs', icon: FileText },
  { k: 'assignments', label: 'Invitations / assignments', icon: UserCheck },
  { k: 'timesheets', label: 'Timesheets', icon: ClipboardList },
  { k: 'disputes', label: 'Disputes (6 States)', icon: Scale },
  { k: 'messages', label: 'Platform Messages', icon: MessageSquare },
]

const labels = {
  open: 'Open',
  under_review: 'Under Review',
  waiting_for_response: 'Waiting for Response',
  resolved: 'Resolved',
  rejected: 'Rejected',
  escalated: 'Escalated',
}

const selectClass = 'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:ring-2 focus:ring-ring'
const blank = () => ({ title: '', category: 'hours', reason: '', links: {} })
const fieldLabel = { companyId: 'Company', crewId: 'Crew', showId: 'Show', jobId: 'Job', assignmentId: 'Assignment', timesheetId: 'Timesheet' }
const name = (record) => record.name || record.fullName || record.title || record.showTitle || record.role || record.email || record.id
const date = (value) => value ? new Date(value).toLocaleString() : '—'

const MasterAdmin = () => {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [credential, setCredential] = useState('')
  const [adminRole, setAdminRole] = useState('super_admin')
  const [authError, setAuthError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState('overview')
  const [data, setData] = useState({})
  const [reportsData, setReportsData] = useState(null)
  const [query, setQuery] = useState('')
  const [number, setNumber] = useState(1)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState(blank)
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [resolution, setResolution] = useState('')
  const [status, setStatus] = useState('open')
  const [lookups, setLookups] = useState({})

  // Assignment adjust dialog
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustStatus, setAdjustStatus] = useState('completed')
  const [adjustReason, setAdjustReason] = useState('')

  const api = useCallback(async (path, opts = {}) => {
    const res = await fetch(`/api/master-admin${path}`, {
      ...opts,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    const payload = await res.json().catch(() => ({}))
    if (res.status === 401) { setAuthenticated(false); setData({}); setSelected(null) }
    if (!res.ok) throw new Error(payload.error || 'Request failed')
    return payload
  }, [])

  useEffect(() => {
    try { localStorage.removeItem('lantix_admin_code') } catch {}
    api('/session').then((value) => {
      setAuthenticated(!!value.authenticated)
      if (value.role) setAdminRole(value.role)
    }).catch(() => {}).finally(() => setChecking(false))
  }, [api])

  const load = useCallback(async () => {
    if (!authenticated) return
    setLoading(true)
    setError('')
    try {
      if (page === 'overview') {
        const result = await api('/overview')
        setData({ ...result, pageKey: page })
      } else if (page === 'reports') {
        const result = await api('/reports')
        setReportsData(result.reports || null)
        setData({ pageKey: page })
      } else if (page === 'disputes') {
        const result = await api(`/disputes?page=${number}&status=${filter}`)
        setData({ ...result, pageKey: page })
      } else {
        const result = await api(`/records/${page}?page=${number}&q=${encodeURIComponent(query)}`)
        setData({ ...result, pageKey: page })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [api, authenticated, page, number, query, filter])

  useEffect(() => {
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [load])

  const login = async (event) => {
    event.preventDefault()
    setBusy(true)
    setAuthError('')
    const entered = credential
    setCredential('')
    try {
      const res = await api('/session', { method: 'POST', body: { credential: entered, role: adminRole } })
      setAuthenticated(true)
      if (res.role) setAdminRole(res.role)
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    try {
      await api('/session', { method: 'DELETE' })
      setAuthenticated(false)
      setData({})
      setCredential('')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const change = async (path, body, confirmation) => {
    if (busy || !window.confirm(confirmation)) return
    setBusy(true)
    try {
      await api(path, { method: 'POST', body })
      toast.success('Updated')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleAdjustAssignment = async (e) => {
    e.preventDefault()
    if (!adjustReason.trim()) {
      toast.error('Reason for manual status change is required for audit trail')
      return
    }
    setBusy(true)
    try {
      await api(`/assignments/${adjustTarget.id}/status`, {
        method: 'POST',
        body: { status: adjustStatus, reason: adjustReason.trim() },
      })
      toast.success('Assignment status manually adjusted and audit logged')
      setAdjustOpen(false)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const startDispute = async (record, type) => {
    const links = {}
    if (record) {
      if (type === 'companies') links.companyId = record.id
      if (type === 'crew') links.crewId = record.id
      if (type === 'shows') links.showId = record.id
      if (type === 'jobs') links.jobId = record.id
      if (type === 'assignments') links.assignmentId = record.id
      if (type === 'timesheets') links.timesheetId = record.id
    }
    setDraft({ ...blank(), links })
    setCreateOpen(true)
    try {
      const [companies, crew, shows] = await Promise.all(['companies', 'crew', 'shows'].map((kind) => api(`/records/${kind}`)))
      setLookups({ companies: companies.records || [], crew: crew.records || [], shows: shows.records || [] })
    } catch {
      // safe fallback
    }
  }

  const createDispute = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = { ...draft, links: Object.fromEntries(Object.entries(draft.links).filter(([, v]) => !!v)) }
      await api('/disputes', { method: 'POST', body: payload })
      toast.success('Dispute created')
      setCreateOpen(false)
      setDraft(blank())
      if (page === 'disputes') await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const updateDispute = async (event) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    try {
      const payload = { version: selected.version }
      if (status !== selected.status) payload.status = status
      if (note.trim()) payload.note = note.trim()
      if (resolution.trim()) payload.resolutionNote = resolution.trim()
      const result = await api(`/disputes/${selected.id}`, { method: 'POST', body: payload })
      toast.success('Dispute updated')
      setSelected(result.dispute)
      setNote('')
      setResolution('')
      if (page === 'disputes') await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell
      admin={true}
      title="Master Administration"
      navItems={NAV}
      page={page}
      onNavigate={(key) => { setPage(key); setNumber(1); setQuery('') }}
      user={authenticated ? { name: `Master Admin (${adminRole.replace('_', ' ')})`, role: 'admin' } : null}
      onLogout={logout}
    >
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
        {checking ? (
          <p className="text-muted-foreground text-center py-12">Verifying administrator session…</p>
        ) : !authenticated ? (
          <div className="mx-auto max-w-md py-12">
            <Card className="border-border shadow-soft">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                    <LockKeyhole className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">LANTIX Pro Master Admin</h2>
                    <p className="text-xs text-muted-foreground">Authorised operations and dispute resolution only.</p>
                  </div>
                </div>
                <form onSubmit={login} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="master-key">Master Secret Key / Admin Code</Label>
                    <Input
                      id="master-key"
                      type="password"
                      autoComplete="off"
                      placeholder="Enter administrator credential"
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-role">Admin RBAC Role</Label>
                    <Select value={adminRole} onValueChange={setAdminRole}>
                      <SelectTrigger id="admin-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">Super Admin (Full Access)</SelectItem>
                        <SelectItem value="support_admin">Support Admin (Operations / Shows)</SelectItem>
                        <SelectItem value="finance_admin">Finance Admin (Billing / Revenue)</SelectItem>
                        <SelectItem value="compliance_admin">Compliance Admin (Disputes / Audits)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {authError && <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{authError}</p>}
                  <Button type="submit" disabled={busy} className="w-full bg-violet-600 hover:bg-violet-700">
                    {busy ? 'Authenticating…' : 'Enter Master Console'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight capitalize">{NAV.find((n) => n.k === page)?.label || page}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Logged in as <Badge variant="outline" className="font-semibold capitalize text-violet-700 border-violet-300">{adminRole.replace('_', ' ')}</Badge> · LANTIX Pro Central Administration
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
                </Button>
                <Button size="sm" onClick={() => startDispute(null, 'other')} className="bg-violet-600 hover:bg-violet-700">
                  <Plus className="h-4 w-4 mr-1.5" /> Open Dispute
                </Button>
              </div>
            </div>

            {error && <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-sm border border-rose-200">{error}</div>}

            {/* OVERVIEW TAB */}
            {page === 'overview' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Registered Users', val: data.users, icon: Users },
                  { label: 'Production Companies', val: data.companies, icon: Building2 },
                  { label: 'Active Crew Technicians', val: data.crew, icon: ClipboardList },
                  { label: 'Shows & Events', val: data.shows, icon: CalendarDays },
                  { label: 'Job Postings', val: data.jobs, icon: Briefcase },
                  { label: 'RFPs Published', val: data.rfps, icon: FileText },
                  { label: 'Active Disputes', val: data.disputes, icon: Scale },
                ].map((stat) => (
                  <Card key={stat.label} className="p-4 shadow-soft">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs">{stat.label}</span>
                      <stat.icon className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="text-2xl font-bold mt-2">{stat.val ?? '—'}</div>
                  </Card>
                ))}
              </div>
            )}

            {/* REPORTS TAB */}
            {page === 'reports' && reportsData && (
              <div className="space-y-6">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-4 shadow-soft">
                    <div className="text-xs text-muted-foreground">Estimated Monthly Revenue</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">
                      ${reportsData.revenue.estimatedMonthlyRevenue.toLocaleString()} / mo
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {reportsData.revenue.activeSubscribers} active paying companies (${reportsData.revenue.planRate}/mo)
                    </div>
                  </Card>

                  <Card className="p-4 shadow-soft">
                    <div className="text-xs text-muted-foreground">Total Approved Labor Hours</div>
                    <div className="text-2xl font-bold text-violet-600 mt-1">
                      {reportsData.approvedHours} hrs
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Total value: {reportsData.totalPaidFormatted}
                    </div>
                  </Card>

                  <Card className="p-4 shadow-soft">
                    <div className="text-xs text-muted-foreground">Active Shows Operating</div>
                    <div className="text-2xl font-bold mt-1">
                      {reportsData.activeShows}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">Currently in progress or scheduled</div>
                  </Card>

                  <Card className="p-4 shadow-soft">
                    <div className="text-xs text-muted-foreground">Crew Cancellations</div>
                    <div className="text-2xl font-bold text-rose-600 mt-1">
                      {reportsData.cancellations}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">Tracked across all staffing rows</div>
                  </Card>
                </div>

                {/* Dispute Breakdown Matrix */}
                <Card className="p-5 shadow-soft space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Scale className="h-4 w-4 text-violet-600" />
                    Dispute Status Matrix (All 6 States)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {Object.entries(reportsData.disputes).filter(([k]) => k !== 'total').map(([st, cnt]) => (
                      <div key={st} className="p-3 rounded-lg border bg-muted/20 text-center">
                        <div className="text-xs text-muted-foreground capitalize">{st.replace(/_/g, ' ')}</div>
                        <div className="text-xl font-bold mt-1">{cnt}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* DISPUTES TAB */}
            {page === 'disputes' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {['all', ...Object.keys(labels)].map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant={filter === st ? 'default' : 'outline'}
                      className={filter === st ? 'bg-violet-600 hover:bg-violet-700 capitalize text-xs' : 'capitalize text-xs'}
                      onClick={() => setFilter(st)}
                    >
                      {st === 'all' ? 'All Disputes' : labels[st] || st}
                    </Button>
                  ))}
                </div>

                <div className="divide-y rounded-xl border bg-card shadow-soft">
                  {(data.records || []).length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">No disputes found in this filter.</div>
                  ) : (
                    (data.records || []).map((disp) => (
                      <div key={disp.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{disp.title}</span>
                            <Badge variant="outline" className="text-xs capitalize font-normal">
                              {labels[disp.status] || disp.status}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                              {disp.category}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">{disp.reason}</p>
                          <div className="text-[11px] text-muted-foreground">
                            Version: v{disp.version || 1} · Created: {date(disp.createdAt)}
                          </div>
                        </div>

                        <Button size="sm" variant="outline" onClick={() => { setSelected(disp); setStatus(disp.status) }}>
                          Review & Mediate
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ASSIGNMENTS TAB (with manual adjustment) */}
            {page === 'assignments' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search by show title, crew name, or status..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="max-w-md h-9 text-xs"
                  />
                </div>

                <div className="divide-y rounded-xl border bg-card shadow-soft">
                  {(data.records || []).map((asgn) => (
                    <div key={asgn.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-sm">{asgn.showTitle}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Crew: <span className="font-medium text-foreground">{asgn.crewName}</span> · {asgn.departmentName} ({asgn.roleTitle})
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Status: <Badge variant="outline" className="text-[10px] capitalize ml-1">{asgn.status}</Badge>
                          {asgn.declineReason && <span className="ml-2 text-rose-600">Decline reason: {asgn.declineReason}</span>}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setAdjustTarget(asgn); setAdjustStatus(asgn.status); setAdjustReason(''); setAdjustOpen(true) }}
                        className="text-xs h-8"
                      >
                        Adjust Status
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GENERIC RECORDS LIST (Users, Companies, Crew, Shows, Jobs, RFPs, Timesheets, Messages) */}
            {!['overview', 'reports', 'disputes', 'assignments'].includes(page) && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={`Search ${page}...`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="max-w-md h-9 text-xs"
                  />
                </div>

                <div className="divide-y rounded-xl border bg-card shadow-soft">
                  {(data.records || []).length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">No records found.</div>
                  ) : (
                    (data.records || []).map((rec, i) => (
                      <div key={rec.id || i} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{name(rec)}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {rec.email || rec.city ? `${rec.city || ''}, ${rec.state || ''} ${rec.email ? '· ' + rec.email : ''}` : ''}
                            {rec.departmentName ? `${rec.departmentName} · ${rec.roleTitle || ''}` : ''}
                            {rec.workDate ? `Work Date: ${rec.workDate} · ${rec.regularHours}h regular · ${rec.overtimeHours}h OT` : ''}
                            {rec.text ? `Message: "${rec.text}"` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {page === 'companies' && (
                            <Button
                              size="sm"
                              variant={rec.paidVerified ? 'outline' : 'default'}
                              onClick={() => change(`/companies/${rec.id}/access`, { enabled: !rec.paidVerified }, `${rec.paidVerified ? 'Revoke' : 'Grant'} posting access for ${rec.name}?`)}
                              className="text-xs h-8"
                            >
                              {rec.paidVerified ? 'Revoke Posting Access' : 'Grant Posting Access'}
                            </Button>
                          )}

                          {page === 'users' && (
                            <Button
                              size="sm"
                              variant={rec.suspended ? 'default' : 'outline'}
                              onClick={() => change(`/users/${rec.id}/status`, { active: !!rec.suspended }, `${rec.suspended ? 'Activate' : 'Suspend'} account for ${rec.name || rec.email}?`)}
                              className="text-xs h-8"
                            >
                              {rec.suspended ? 'Activate Account' : 'Suspend Account'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Assignment Adjustment Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Admin Assignment Status Adjustment</DialogTitle>
            <DialogDescription>
              Authorised administrators may manually adjust show assignment statuses. An audit log entry is permanently recorded.
            </DialogDescription>
          </DialogHeader>
          {adjustTarget && (
            <form onSubmit={handleAdjustAssignment} className="space-y-4 pt-2">
              <div className="p-3 bg-muted/20 border rounded-lg text-xs space-y-1">
                <div className="font-semibold">{adjustTarget.showTitle}</div>
                <div className="text-muted-foreground">{adjustTarget.crewName} · {adjustTarget.departmentName}</div>
                <div>Current status: <Badge variant="outline" className="text-[10px] capitalize">{adjustTarget.status}</Badge></div>
              </div>

              <div className="space-y-1.5">
                <Label>New Status</Label>
                <Select value={adjustStatus} onValueChange={setAdjustStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="accepted">Accepted (Assigned)</SelectItem>
                    <SelectItem value="declined">Declined</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Audit Log Reason</Label>
                <Textarea
                  placeholder="Explain why this status is being manually altered by administration..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows={3}
                  required
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={() => setAdjustOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy} className="bg-violet-600 hover:bg-violet-700">
                  {busy ? 'Saving…' : 'Record Adjustment'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Review / Mediate Dispute Modal */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-violet-600" />
              Mediate Dispute: {selected?.title}
            </DialogTitle>
            <DialogDescription>
              LANTIX Administration has final platform resolution authority.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <form onSubmit={updateDispute} className="space-y-4 pt-2">
              <div className="p-3 bg-muted/20 border rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Category: {selected.category}</span>
                  <Badge variant="outline" className="capitalize">{labels[selected.status] || selected.status}</Badge>
                </div>
                <div className="text-muted-foreground mt-1 font-medium text-foreground">{selected.reason}</div>
              </div>

              <div className="space-y-1.5">
                <Label>Update Dispute Status (6 States)</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(labels).map(([k, lbl]) => (
                      <SelectItem key={k} value={k}>
                        {lbl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Internal Administrative Note</Label>
                <Textarea
                  placeholder="Add mediation progress, interview findings, or notes..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </div>

              {['resolved', 'rejected'].includes(status) && (
                <div className="space-y-1.5 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <Label className="text-amber-800 dark:text-amber-200 font-semibold">
                    Final Resolution Determination (Required for close)
                  </Label>
                  <Textarea
                    placeholder="Enter final formal determination and binding resolution terms..."
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    rows={3}
                    required
                  />
                </div>
              )}

              {/* History / Audit trail */}
              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Mediation Audit History</h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
                  {(selected.history || []).map((h, i) => (
                    <div key={h.id || i} className="p-2 rounded bg-muted/10 border text-[11px] space-y-0.5">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="font-medium text-foreground capitalize">{h.action?.replace(/_/g, ' ')}</span>
                        <span>{date(h.createdAt)}</span>
                      </div>
                      {h.note && <div>Note: {h.note}</div>}
                      {h.status && <div>Status: <span className="capitalize">{labels[h.status] || h.status}</span></div>}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)}>
                  Close
                </Button>
                <Button type="submit" size="sm" disabled={busy} className="bg-violet-600 hover:bg-violet-700">
                  {busy ? 'Saving…' : 'Save Mediation Action'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default MasterAdmin
