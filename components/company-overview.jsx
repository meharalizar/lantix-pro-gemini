'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Users, ClipboardCheck, Briefcase, ArrowUpRight, Plus, Clock3, Download, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'

const CompanyOverview = ({ api, company, jobs = [], onNavigate }) => {
  const [shows, setShows] = useState([])
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedShowSummary, setSelectedShowSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([api('/shows'), api('/timesheets')]).then(([a, b]) => {
      if (active) {
        setShows(a.shows || [])
        setSheets(b.timesheets || [])
      }
    }).catch((err) => {
      if (active) setError(err.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [api])

  const totalNeeded = shows.reduce((sum, s) =>
    sum + (s.staffing || []).reduce((rowSum, r) => rowSum + (r.headcountNeeded || 0), 0), 0
  )
  const assigned = shows.flatMap((show) =>
    (show.staffing || []).flatMap((row) => row.invitations || [])
  ).filter((invite) => invite.status === 'accepted').length

  const pending = sheets.filter((sheet) => sheet.status === 'submitted').length

  const stats = [
    { label: 'Staffing & Assigned Crew', value: `${assigned} / ${totalNeeded || assigned}`, icon: Users, key: 'shows', priority: true },
    { label: 'Active Shows', value: shows.filter((show) => ['draft', 'open', 'published'].includes(show.status)).length, icon: CalendarDays, key: 'shows' },
    { label: 'Timesheets to Review', value: pending, icon: ClipboardCheck, key: 'timesheet-approvals' },
    { label: 'Open Job Posts', value: jobs.filter((job) => job.status === 'open').length, icon: Briefcase, key: 'applicants' },
  ]

  const viewShowSummary = async (showId, e) => {
    e.stopPropagation()
    try {
      setSummaryLoading(true)
      const res = await fetch(`/api/shows/${showId}/summary`)
      if (!res.ok) throw new Error('Failed to load show summary')
      const data = await res.json()
      setSelectedShowSummary(data.summary)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSummaryLoading(false)
    }
  }

  const exportStaffingCsv = (showId, e) => {
    e.stopPropagation()
    window.location.href = `/api/company/export/staffing?showId=${showId}`
  }

  return (
    <div className="space-y-6" data-testid="company-overview">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Welcome back, {company?.name || 'Production Team'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Staffing-first command center for your event labor and shows.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onNavigate('crew')}>
            <Users className="mr-2 h-4 w-4" />Browse Crew Directory
          </Button>
          <Button onClick={() => onNavigate('new-show')} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="mr-2 h-4 w-4" />Create a Show
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, key, priority }) => (
          <button
            key={label}
            onClick={() => onNavigate(key)}
            className={`rounded-2xl border p-4 text-left shadow-soft sm:p-5 transition-colors ${
              priority ? 'border-violet-300 bg-violet-50/40 dark:bg-violet-950/20' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                <Icon className="h-4 w-4" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-4 text-2xl font-bold">{loading ? '—' : value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[1.7fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base">Current Show Staffing</h3>
              <p className="text-xs text-muted-foreground">Monitor department staffing fulfillment and export reports</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('shows')}>
              View all shows <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>

          {loading ? (
            <p className="py-8 text-sm text-muted-foreground">Loading shows…</p>
          ) : shows.length ? (
            <div className="divide-y divide-border">
              {shows.slice(0, 5).map((show) => {
                const showNeeded = (show.staffing || []).reduce((sum, r) => sum + (r.headcountNeeded || 0), 0)
                const showFilled = (show.staffing || []).flatMap((r) => r.invitations || []).filter((i) => i.status === 'accepted').length
                const pct = showNeeded > 0 ? Math.round((showFilled / showNeeded) * 100) : 0

                return (
                  <div key={show.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onNavigate('shows')}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm hover:text-violet-600 transition-colors">{show.title}</span>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {show.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {show.venueName} · {show.city}, {show.state} · {show.startDate} to {show.endDate}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="font-medium text-foreground">Staffing:</span>
                        <span className={pct >= 100 ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                          {showFilled} of {showNeeded} roles filled ({pct}%)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => viewShowSummary(show.id, e)}
                        className="h-8 text-xs"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1 text-violet-600" /> Show Summary
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => exportStaffingCsv(show.id, e)}
                        className="h-8 text-xs"
                        title="Download show staffing CSV"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onNavigate('shows')}
                        className="h-8 text-xs bg-violet-600 hover:bg-violet-700"
                      >
                        Staff Show
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-muted/50 p-7 text-center">
              <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 font-medium">No shows scheduled yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Create an event and configure departmental staffing needs.</p>
              <Button className="mt-4 bg-violet-600 hover:bg-violet-700" size="sm" onClick={() => onNavigate('new-show')}>
                Create your first show
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-violet-600" />
              <h3 className="font-semibold">Pending Timesheets</h3>
            </div>
            <p className="mt-3 text-2xl font-bold">{pending}</p>
            <p className="mt-1 text-xs text-muted-foreground">Timesheets awaiting approval or correction</p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => onNavigate('timesheet-approvals')}>
              Review Timesheets
            </Button>
          </div>

          <div className="rounded-2xl bg-secondary/50 border border-secondary p-5 space-y-2">
            <h3 className="font-semibold text-secondary-foreground text-sm">Need Crew for an Upcoming Event?</h3>
            <p className="text-xs text-muted-foreground">
              Search vetted technicians across all 50 states by skill category, city, or rate tier.
            </p>
            <Button className="mt-2 w-full bg-violet-600 hover:bg-violet-700 text-white" size="sm" onClick={() => onNavigate('crew')}>
              Browse Crew Directory
            </Button>
          </div>
        </section>
      </div>

      {/* Full Show Summary Dialog */}
      <Dialog open={!!selectedShowSummary} onOpenChange={(open) => !open && setSelectedShowSummary(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-violet-600" />
              Full Show Summary: {selectedShowSummary?.show?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedShowSummary?.show?.venueName} · {selectedShowSummary?.show?.city}, {selectedShowSummary?.show?.state}
            </DialogDescription>
          </DialogHeader>

          {selectedShowSummary && (
            <div className="space-y-6 pt-2">
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border bg-muted/20 text-center">
                  <div className="text-xs text-muted-foreground">Fulfillment</div>
                  <div className="text-lg font-bold text-violet-700">
                    {selectedShowSummary.metrics.percentFilled}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {selectedShowSummary.metrics.totalHeadcountFilled} of {selectedShowSummary.metrics.totalHeadcountNeeded}
                  </div>
                </div>

                <div className="p-3 rounded-lg border bg-muted/20 text-center">
                  <div className="text-xs text-muted-foreground">Regular Hours</div>
                  <div className="text-lg font-bold">
                    {selectedShowSummary.metrics.totalRegularHours} hrs
                  </div>
                  <div className="text-[10px] text-muted-foreground">Approved time</div>
                </div>

                <div className="p-3 rounded-lg border bg-muted/20 text-center">
                  <div className="text-xs text-muted-foreground">Overtime Hours</div>
                  <div className="text-lg font-bold text-amber-600">
                    {selectedShowSummary.metrics.totalOvertimeHours} hrs
                  </div>
                  <div className="text-[10px] text-muted-foreground">1.5x / premium</div>
                </div>

                <div className="p-3 rounded-lg border bg-muted/20 text-center">
                  <div className="text-xs text-muted-foreground">Estimated Labor</div>
                  <div className="text-lg font-bold text-emerald-600">
                    {selectedShowSummary.metrics.totalEstimatedPayFormatted}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Approved totals</div>
                </div>
              </div>

              {/* Department Staffing Breakdown */}
              <div className="space-y-3">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Department Staffing Breakdown
                </h4>
                <div className="divide-y rounded-lg border">
                  {(selectedShowSummary.departments || []).map((dept) => (
                    <div key={dept.name} className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{dept.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {dept.headcountFilled} / {dept.headcountNeeded} filled
                        </Badge>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                        {(dept.roles || []).map((r, i) => (
                          <div key={i} className="flex justify-between p-1.5 rounded bg-muted/10">
                            <span>{r.roleTitle}</span>
                            <span className="font-medium text-foreground">${r.regularRate}/hr · ${r.overtimeRate} OT</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assigned Crew List */}
              <div className="space-y-3">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Assigned Crew & Hours ({selectedShowSummary.crew.length})
                </h4>
                {selectedShowSummary.crew.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4 border rounded">
                    No crew members assigned yet.
                  </div>
                ) : (
                  <div className="divide-y rounded-lg border text-xs">
                    {selectedShowSummary.crew.map((c) => (
                      <div key={c.assignmentId} className="p-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-medium">{c.crewName}</div>
                          <div className="text-muted-foreground">{c.department} · {c.role}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">${c.regularRate}/hr</div>
                          <div className="text-[11px] text-muted-foreground">{c.timesheetsCount} timesheet(s)</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportStaffingCsv(selectedShowSummary.show.id, { stopPropagation: () => {} })}
                >
                  <Download className="h-4 w-4 mr-1.5" /> Export Staffing CSV
                </Button>
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700"
                  onClick={() => setSelectedShowSummary(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CompanyOverview
