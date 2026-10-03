'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Mail, CheckCircle2, XCircle, Clock, MapPin } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const DECLINE_REASONS = [
  { key: 'unavailable', label: 'Unavailable on these dates' },
  { key: 'rate_too_low', label: 'Rate too low for role/travel' },
  { key: 'location', label: 'Location / Venue too far' },
  { key: 'schedule_conflict', label: 'Schedule conflict with another show' },
  { key: 'other', label: 'Other personal / scheduling reason' },
]

const CrewInvitations = ({ api }) => {
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  // Decline dialog state
  const [declineOpen, setDeclineOpen] = useState(false)
  const [decliningInvite, setDecliningInvite] = useState(null)
  const [declineReason, setDeclineReason] = useState('unavailable')
  const [declineNote, setDeclineNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api('/invitations')
      setInvitations(data.invitations || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const accept = async (invitation) => {
    if (busy) return
    setBusy(invitation.id)
    try {
      const data = await api(`/invitations/${invitation.id}/respond`, {
        method: 'POST',
        body: { status: 'accepted' },
      })
      setInvitations((list) => list.map((item) => item.id === invitation.id ? data.invitation : item))
      toast.success('Accepted — you are now officially assigned to this show staffing row')
    } catch (err) {
      toast.error(err.message)
      await load()
    } finally {
      setBusy('')
    }
  }

  const promptDecline = (invitation) => {
    setDecliningInvite(invitation)
    setDeclineReason('unavailable')
    setDeclineNote('')
    setDeclineOpen(true)
  }

  const handleDeclineSubmit = async (e) => {
    e.preventDefault()
    if (!decliningInvite) return
    setBusy(decliningInvite.id)
    try {
      const data = await api(`/invitations/${decliningInvite.id}/respond`, {
        method: 'POST',
        body: {
          status: 'declined',
          declineReason,
          declineNote: declineNote.trim(),
        },
      })
      setInvitations((list) => list.map((item) => item.id === decliningInvite.id ? data.invitation : item))
      toast.success('Invitation declined with feedback')
      setDeclineOpen(false)
    } catch (err) {
      toast.error(err.message)
      await load()
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-5" data-testid="crew-invitations">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Mail className="h-5 w-5 text-violet-600" />Crew Invitations & Offers
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review show dates, call times, and rates before accepting or declining assignments.
          </p>
        </div>
        <Button variant="outline" disabled={loading || !!busy} onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {loading && <p role="status" className="text-sm text-muted-foreground">Loading invitations…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading && !error && !invitations.length && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No invitations yet. Invitations from production companies will appear here.
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-2">
          {invitations.map((invitation) => {
            const show = invitation.show || {}
            const row = invitation.staffing || {}
            const closed = ['completed', 'cancelled'].includes(show.status)

            return (
              <Card key={invitation.id} data-testid="crew-invitation-card" className="border shadow-soft">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="min-w-0 break-words text-lg">{show.title}</CardTitle>
                    <Badge
                      variant={invitation.status === 'accepted' ? 'default' : 'secondary'}
                      className={`capitalize ${invitation.status === 'accepted' ? 'bg-emerald-600' : ''}`}
                    >
                      {invitation.status === 'accepted' ? 'Accepted · Assigned' : invitation.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">From {invitation.companyName}</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="p-2.5 rounded-lg bg-muted/20 border space-y-1">
                    <p className="font-semibold text-violet-700 dark:text-violet-300">
                      {row.departmentName} — {row.roleTitle}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {show.venueName} · {show.city}, {show.state}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {show.startDate} to {show.endDate}
                    </p>
                  </div>

                  {show.description && <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">{show.description}</p>}

                  <div className="grid grid-cols-2 gap-2 text-xs border rounded p-2.5">
                    <div>
                      <span className="text-muted-foreground">Regular Rate:</span> <span className="font-semibold text-foreground">{money(row.regularRate)}/hr</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Overtime Rate:</span> <span className="font-semibold text-foreground">{money(row.overtimeRate)}/hr</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Call:</span> {row.callTime || 'TBD'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Wrap:</span> {row.wrapTime || 'TBD'}
                    </div>
                  </div>

                  {invitation.status === 'declined' && invitation.declineReason && (
                    <div className="text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/30 p-2 rounded border border-rose-200">
                      Declined reason: {DECLINE_REASONS.find((d) => d.key === invitation.declineReason)?.label || invitation.declineReason}
                    </div>
                  )}

                  {invitation.status === 'invited' && !closed && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        disabled={!!busy}
                        onClick={() => accept(invitation)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        {busy === invitation.id ? 'Accepting…' : 'Accept Assignment'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => promptDecline(invitation)}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <XCircle className="mr-1.5 h-4 w-4" />
                        Decline
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Decline Reason Dialog */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline Show Invitation</DialogTitle>
            <DialogDescription>
              Select your reason for declining so the production company can adjust staffing.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeclineSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Reason for Declining</Label>
              <Select value={declineReason} onValueChange={setDeclineReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECLINE_REASONS.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Additional Note (Optional)</Label>
              <Textarea
                placeholder="e.g. booked on another arena tour that week, available starting next Tuesday..."
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDeclineOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="destructive">
                Confirm Decline
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CrewInvitations
