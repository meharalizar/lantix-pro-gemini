'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Users, UserPlus, Trash2, Shield, Briefcase, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

const ROLES = [
  { key: 'owner', label: 'Owner', desc: 'Full company administration and team access' },
  { key: 'event_manager', label: 'Event Manager', desc: 'Manage shows, staffing, and invitations' },
  { key: 'dept_head', label: 'Department Head', desc: 'Approve timesheets for assigned departments only' },
  { key: 'finance', label: 'Finance', desc: 'View billing, timesheet payments, and reports' },
]

const STANDARD_DEPTS = ['Audio', 'Lighting', 'Video', 'Staging', 'Rigging', 'Production', 'Camera']

export default function CompanyTeam({ company }) {
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('event_manager')
  const [selectedDepts, setSelectedDepts] = useState(['Audio'])
  const [adding, setAdding] = useState(false)

  const loadTeam = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/company/team')
      if (res.ok) {
        const data = await res.json()
        setTeam(data.team || [])
      }
    } catch {
      // safe fallback
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTeam()
  }, [loadTeam])

  const toggleDept = (dept) => {
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    )
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }
    if (role === 'dept_head' && selectedDepts.length === 0) {
      toast.error('Department Heads must have at least one assigned department')
      return
    }

    try {
      setAdding(true)
      const res = await fetch('/api/company/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          role,
          departments: role === 'dept_head' ? selectedDepts : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add member')
      toast.success('Team member saved')
      setEmail('')
      setName('')
      setRole('event_manager')
      setSelectedDepts(['Audio'])
      loadTeam()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (memberId) => {
    if (!window.confirm('Remove this member from your company team?')) return
    try {
      const res = await fetch(`/api/company/team/${memberId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove member')
      toast.success('Member removed')
      setTeam((prev) => prev.filter((m) => m.id !== memberId))
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-600" />
            <CardTitle>Company Internal Roles (RBAC)</CardTitle>
          </div>
          <CardDescription>
            Grant role-based access for team members. Department Heads only review/approve timesheets for their assigned departments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAdd} className="rounded-lg border p-4 bg-muted/20 space-y-4">
            <div className="font-medium text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-violet-600" />
              Add Internal User
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mem-email">Work Email</Label>
                <Input
                  id="mem-email"
                  type="email"
                  placeholder="colleague@production.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-name">Full Name</Label>
                <Input
                  id="mem-name"
                  placeholder="e.g. Sarah Jenkins"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-role">Company Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="mem-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {role === 'dept_head' && (
              <div className="rounded-md border p-3 bg-card space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-violet-700">
                  <Layers className="h-3.5 w-3.5" />
                  Assigned Departments (Department Head can only approve timesheets for these):
                </Label>
                <div className="flex flex-wrap gap-3 pt-1">
                  {STANDARD_DEPTS.map((dept) => (
                    <label key={dept} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={selectedDepts.includes(dept)}
                        onCheckedChange={() => toggleDept(dept)}
                      />
                      <span>{dept}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={adding} size="sm" className="bg-violet-600 hover:bg-violet-700">
                {adding ? 'Saving...' : 'Add Team Member'}
              </Button>
            </div>
          </form>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current Team Members ({team.length})
            </h4>
            {loading ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Loading team...</div>
            ) : team.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                No secondary team members added yet. The account creator is the default Owner.
              </div>
            ) : (
              <div className="divide-y rounded-lg border bg-card">
                {team.map((member) => (
                  <div key={member.id} className="p-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{member.name || member.email}</span>
                        <Badge variant="outline" className="text-xs capitalize font-normal">
                          {member.role === 'dept_head' ? 'Department Head' : member.role.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{member.email}</div>
                      {member.role === 'dept_head' && (member.departments || []).length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-violet-700">
                          <Layers className="h-3 w-3" />
                          <span>Departments: {(member.departments || []).join(', ')}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(member.id)}
                      className="text-muted-foreground hover:text-destructive h-8 px-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
