'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Users, RefreshCw, Search } from 'lucide-react'

const StaffingInvitations = ({ api, show, onChanged }) => {
  const [rowId, setRowId] = useState(show?.staffing?.[0]?.id || '')
  const [invitations, setInvitations] = useState([])
  const [assigned, setAssigned] = useState(0)
  const [query, setQuery] = useState('')
  const [crew, setCrew] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState('')
  const [revision, setRevision] = useState(0)
  const rows = show?.staffing || []
  const row = rows.find((item) => item.id === rowId)
  const closed = ['completed', 'cancelled'].includes(show?.status)
  const base = rowId ? `/shows/${show.id}/staffing/${rowId}` : ''
  const applyRoster = (data) => { setInvitations(data.invitations || []); setAssigned(data.assignedCount || 0) }

  useEffect(() => {
    if (!rowId && rows[0]?.id) setRowId(rows[0].id)
  }, [rowId, rows])
  useEffect(() => {
    if (!base) return
    let active = true
    setLoading(true); setError(''); setInvitations([]); setAssigned(0)
    api(`${base}/invitations`).then((data) => { if (active) applyRoster(data) })
      .catch((err) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, base, revision])
  useEffect(() => {
    if (!base) return
    let active = true
    setSearching(true); setSearchError(''); setCrew([])
    const timer = setTimeout(() => {
      api(`${base}/crew?q=${encodeURIComponent(query)}`).then((data) => {
        if (active) { setCrew(data.crew || []); setHasMore(!!data.hasMore) }
      }).catch((err) => { if (active) setSearchError(err.message) }).finally(() => { if (active) setSearching(false) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [api, base, query, revision])

  const send = async (member) => {
    if (busy) return
    setBusy(member.id)
    try { const data = await api(`${base}/invitations`, { method: 'POST', body: { crewId: member.id } }); applyRoster(data); toast.success('Invitation sent in-app'); onChanged?.() }
    catch (err) { toast.error(err.message); setRevision((value) => value + 1) }
    finally { setBusy('') }
  }
  const cancel = async (invitation) => {
    if (busy || !window.confirm(`Cancel ${invitation.status === 'accepted' ? 'assignment' : 'invitation'} for ${invitation.crewName}?`)) return
    setBusy(invitation.id)
    try { const data = await api(`/invitations/${invitation.id}/cancel`, { method: 'POST' }); applyRoster(data); toast.success('Cancelled'); onChanged?.() }
    catch (err) { toast.error(err.message); setRevision((value) => value + 1) }
    finally { setBusy('') }
  }
  if (!rows.length) return null

  return <section className="space-y-4 rounded-lg border border-border p-4" data-testid="staffing-invitations">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" />Crew invitations & assignments</h4><Button type="button" size="sm" variant="outline" disabled={!!busy || loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Refresh statuses</Button></div>
    <div className="space-y-1.5"><Label htmlFor="invitation-staffing-row">Staffing row</Label><select id="invitation-staffing-row" value={rowId} disabled={!!busy} onChange={(event) => setRowId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{rows.map((item) => <option value={item.id} key={item.id}>{item.departmentName} — {item.roleTitle} ({item.headcountNeeded} needed)</option>)}</select></div>
    {row && <p className="text-sm text-muted-foreground">{assigned} / {row.headcountNeeded} assigned · Acceptance reserves a place; pending invitations do not.</p>}
    {closed && <p className="text-sm text-muted-foreground">This show is closed. Existing invitations or assignments can still be cancelled.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading invitation statuses…</p> : <div className="space-y-2" data-testid="invitation-roster">
      {!invitations.length && <p className="text-sm text-muted-foreground">No invitations for this staffing row yet.</p>}
      {invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"><span className="min-w-0 flex-1 break-words text-sm font-medium">{invitation.crewName}</span><Badge variant={invitation.status === 'accepted' ? 'default' : 'secondary'} className="capitalize">{invitation.status === 'accepted' ? 'Accepted · Assigned' : invitation.status}</Badge>{['invited', 'accepted'].includes(invitation.status) && <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => cancel(invitation)}>{busy === invitation.id ? 'Cancelling…' : invitation.status === 'accepted' ? 'Cancel assignment' : 'Cancel invitation'}</Button>}</div>)}
    </div>}
    <div className="space-y-2 border-t border-border pt-4"><Label htmlFor="invite-crew-search" className="flex items-center gap-2"><Search className="h-4 w-4" />Search existing crew</Label><Input id="invite-crew-search" placeholder="Name, skill, city, state, or certification" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} /><p className="text-xs text-muted-foreground">Only registered crew accounts can receive invitations. Review skills and availability before inviting. No SMS or email is sent.</p></div>
    {searchError && <p role="alert" className="text-sm text-destructive">{searchError}</p>}
    {searching ? <p role="status" className="text-sm text-muted-foreground">Searching crew…</p> : <div className="grid gap-2 md:grid-cols-2" data-testid="invite-crew-results">{crew.map((member) => {
      const active = invitations.find((invite) => invite.crewId === member.id && ['invited', 'accepted'].includes(invite.status))
      return <div key={member.id} className="space-y-2 rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-semibold">{member.fullName}</p><p className="text-xs text-muted-foreground">{member.city}, {member.state} · {member.available ? 'Available' : 'Unavailable'}</p></div><Button type="button" size="sm" variant="outline" disabled={!!busy || loading || !!error || !!active || closed || assigned >= (row?.headcountNeeded || 0)} onClick={() => send(member)}>{busy === member.id ? 'Sending…' : active ? active.status === 'accepted' ? 'Assigned' : 'Invited' : 'Invite'}</Button></div><p className="break-words text-xs text-muted-foreground">Skills: {(member.skills || []).join(', ') || 'Not specified'}</p><p className="break-words text-xs text-muted-foreground">Certs: {(member.certifications || []).join(', ') || 'Not specified'}</p></div>
    })}{!crew.length && !searchError && <p className="text-sm text-muted-foreground">No registered crew match this search.</p>}</div>}
    {hasMore && <p className="text-xs text-muted-foreground">Showing the first 30 matches. Refine your search to find more crew.</p>}
  </section>
}

export default StaffingInvitations
