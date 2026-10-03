import { v4 as uuidv4 } from 'uuid'

export const COMPANY_INTERNAL_ROLES = ['owner', 'event_manager', 'dept_head', 'finance']

export const DECLINE_REASONS = [
  { key: 'unavailable', label: 'Unavailable on these dates' },
  { key: 'rate_too_low', label: 'Rate too low for role/travel' },
  { key: 'location', label: 'Location / Venue too far' },
  { key: 'schedule_conflict', label: 'Schedule conflict with another show' },
  { key: 'other', label: 'Other personal / scheduling reason' },
]

export const DOCUMENT_CATEGORIES = [
  { key: 'certifications', label: 'Certifications', sensitive: false },
  { key: 'ids', label: 'Government IDs', sensitive: true },
  { key: 'insurance', label: 'Proof of Insurance / COI', sensitive: false },
  { key: 'tax_w9', label: 'W-9 / Tax Documents', sensitive: true },
  { key: 'contracts', label: 'Contracts & Agreements', sensitive: true },
  { key: 'invoices', label: 'Invoices', sensitive: false },
  { key: 'show_documents', label: 'Show & Venue Documents', sensitive: false },
]

// ---------------- In-App Notifications ----------------
export async function createNotification(database, { userId, title, message, type = 'general', link = '' }) {
  if (!database || !userId) return null
  const item = {
    id: uuidv4(),
    userId,
    title,
    message,
    type,
    link,
    read: false,
    createdAt: new Date(),
  }
  await database.collection('notifications').insertOne(item)
  return item
}

// ---------------- Company Internal Roles & Permissions ----------------
export async function getCompanyTeam(database, companyId) {
  return database.collection('company_team').find({ companyId }).toArray()
}

export async function checkCompanyPermission(database, user, company, requiredAction, context = {}) {
  // If user is direct owner of the company
  if (company.userId === user.id) return { allowed: true, role: 'owner' }

  // Check team membership
  const member = await database.collection('company_team').findOne({ companyId: company.id, userId: user.id })
  if (!member) return { allowed: false, error: 'Not a member of this company' }

  const role = member.role || 'event_manager'
  if (role === 'owner') return { allowed: true, role }

  if (requiredAction === 'timesheet_approval') {
    if (role === 'dept_head') {
      const allowedDepts = (member.departments || []).map((d) => d.toLowerCase().trim())
      const targetDept = String(context.departmentName || '').toLowerCase().trim()
      if (!allowedDepts.includes(targetDept)) {
        return {
          allowed: false,
          error: `Department Head can only approve timesheets for assigned departments: ${(member.departments || []).join(', ')}`,
        }
      }
      return { allowed: true, role }
    }
    if (role === 'event_manager' || role === 'finance') return { allowed: true, role }
  }

  if (requiredAction === 'billing') {
    if (role === 'finance' || role === 'owner') return { allowed: true, role }
    return { allowed: false, error: 'Only Owner and Finance roles can access billing' }
  }

  if (requiredAction === 'manage_shows' || requiredAction === 'manage_staffing') {
    if (role === 'finance') return { allowed: false, error: 'Finance role has read-only access to shows and staffing' }
    return { allowed: true, role }
  }

  return { allowed: true, role }
}

// ---------------- Previous Teams & Favourites ----------------
export async function getPreviousCrew(database, companyId) {
  const shows = await database.collection('shows').find({ companyId }).toArray()
  const map = new Map()

  for (const show of shows) {
    for (const row of (show.staffing || [])) {
      for (const inv of (row.invitations || [])) {
        if (inv.status === 'accepted' && inv.crewId) {
          if (!map.has(inv.crewId)) {
            map.set(inv.crewId, {
              crewId: inv.crewId,
              crewUserId: inv.crewUserId,
              crewName: inv.crewName,
              lastRole: row.roleTitle,
              lastDepartment: row.departmentName,
              lastShow: show.title,
              lastDate: show.endDate || show.startDate,
              showsWorked: 1,
            })
          } else {
            const existing = map.get(inv.crewId)
            existing.showsWorked += 1
          }
        }
      }
    }
  }

  const crewIds = Array.from(map.keys())
  if (!crewIds.length) return []

  const profiles = await database.collection('crew_profiles').find({ id: { $in: crewIds } }).toArray()
  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  return Array.from(map.values()).map((c) => ({
    ...c,
    profile: profileMap.get(c.crewId) || null,
  }))
}

// ---------------- Full Show Summary ----------------
export async function generateShowSummary(database, showId, companyId) {
  const show = await database.collection('shows').findOne({ id: showId, companyId })
  if (!show) return null

  const departments = {}
  let totalHeadcountNeeded = 0
  let totalHeadcountFilled = 0
  let totalRegularHours = 0
  let totalOvertimeHours = 0
  let totalEstimatedPayCents = 0
  const acceptedCrew = []

  for (const row of (show.staffing || [])) {
    const dept = row.departmentName || 'General'
    if (!departments[dept]) {
      departments[dept] = {
        name: dept,
        headcountNeeded: 0,
        headcountFilled: 0,
        roles: [],
      }
    }

    const needed = row.headcountNeeded || 0
    const accepted = (row.invitations || []).filter((i) => i.status === 'accepted')
    departments[dept].headcountNeeded += needed
    departments[dept].headcountFilled += accepted.length
    totalHeadcountNeeded += needed
    totalHeadcountFilled += accepted.length

    for (const invite of accepted) {
      acceptedCrew.push({
        assignmentId: invite.id,
        crewId: invite.crewId,
        crewName: invite.crewName,
        department: dept,
        role: row.roleTitle,
        regularRate: row.regularRate,
        overtimeRate: row.overtimeRate,
        timesheetsCount: (invite.timesheets || []).length,
      })

      for (const sheet of (invite.timesheets || [])) {
        if (sheet.status === 'approved') {
          totalRegularHours += sheet.regularHours || 0
          totalOvertimeHours += sheet.overtimeHours || 0
          totalEstimatedPayCents += sheet.estimatedTotalPayCents || 0
        }
      }
    }

    departments[dept].roles.push({
      roleTitle: row.roleTitle,
      needed,
      filled: accepted.length,
      regularRate: row.regularRate,
      overtimeRate: row.overtimeRate,
      callTime: row.callTime,
      wrapTime: row.wrapTime,
    })
  }

  return {
    show: {
      id: show.id,
      title: show.title,
      venueName: show.venueName,
      city: show.city,
      state: show.state,
      startDate: show.startDate,
      endDate: show.endDate,
      status: show.status,
    },
    metrics: {
      totalHeadcountNeeded,
      totalHeadcountFilled,
      percentFilled: totalHeadcountNeeded > 0 ? Math.round((totalHeadcountFilled / totalHeadcountNeeded) * 100) : 0,
      totalRegularHours: +totalRegularHours.toFixed(2),
      totalOvertimeHours: +totalOvertimeHours.toFixed(2),
      totalHours: +(totalRegularHours + totalOvertimeHours).toFixed(2),
      totalEstimatedPayCents,
      totalEstimatedPayFormatted: (totalEstimatedPayCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    },
    departments: Object.values(departments),
    crew: acceptedCrew,
  }
}

// ---------------- CSV Exporters ----------------
export function exportShowStaffingCsv(show) {
  const rows = [
    ['Show Title', 'Venue', 'City', 'State', 'Start Date', 'End Date', 'Department', 'Role Title', 'Call Time', 'Wrap Time', 'Regular Rate ($/hr)', 'OT Rate ($/hr)', 'Crew Name', 'Assignment Status', 'Timesheet Date', 'Regular Hours', 'OT Hours', 'Total Pay ($)'],
  ]

  for (const row of (show.staffing || [])) {
    const invites = row.invitations || []
    if (!invites.length) {
      rows.push([
        show.title, show.venueName, show.city, show.state, show.startDate, show.endDate,
        row.departmentName, row.roleTitle, row.callTime, row.wrapTime,
        row.regularRate, row.overtimeRate, 'Unassigned', 'Open Need',
        '', '', '', '',
      ])
    } else {
      for (const inv of invites) {
        const sheets = inv.timesheets || []
        if (!sheets.length) {
          rows.push([
            show.title, show.venueName, show.city, show.state, show.startDate, show.endDate,
            row.departmentName, row.roleTitle, row.callTime, row.wrapTime,
            row.regularRate, row.overtimeRate, inv.crewName || 'Assigned Crew', inv.status,
            '', '', '', '',
          ])
        } else {
          for (const s of sheets) {
            rows.push([
              show.title, show.venueName, show.city, show.state, show.startDate, show.endDate,
              row.departmentName, row.roleTitle, row.callTime, row.wrapTime,
              row.regularRate, row.overtimeRate, inv.crewName || 'Assigned Crew', inv.status,
              s.workDate, s.regularHours, s.overtimeHours, ((s.estimatedTotalPayCents || 0) / 100).toFixed(2),
            ])
          }
        }
      }
    }
  }

  return rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export function exportCrewTimesheetsCsv(timesheets, crewName) {
  const rows = [
    ['Crew Member', 'Show Title', 'Company', 'Venue', 'City', 'State', 'Department', 'Role', 'Work Date', 'Regular Hours', 'OT Hours', 'Regular Rate ($)', 'OT Rate ($)', 'Total Pay ($)', 'Status', 'Submitted At'],
  ]

  for (const s of timesheets) {
    rows.push([
      crewName || s.crewName || 'Crew',
      s.showTitle || '',
      s.companyName || '',
      s.venueName || '',
      s.city || '',
      s.state || '',
      s.departmentName || '',
      s.roleTitle || '',
      s.workDate || '',
      s.regularHours || 0,
      s.overtimeHours || 0,
      s.regularRate || 0,
      s.overtimeRate || 0,
      ((s.estimatedTotalPayCents || 0) / 100).toFixed(2),
      s.status || '',
      s.submittedAt ? new Date(s.submittedAt).toISOString().slice(0, 10) : '',
    ])
  }

  return rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

// ---------------- Legit Reviews System ----------------
export async function canReviewCrew(database, companyId, crewId) {
  const show = await database.collection('shows').findOne({
    companyId,
    staffing: {
      $elemMatch: {
        invitations: {
          $elemMatch: {
            crewId,
            status: 'accepted',
            timesheets: { $elemMatch: { status: 'approved' } },
          },
        },
      },
    },
  })
  return !!show
}

export async function addCrewReview(database, { companyId, companyName, crewId, rating, comment }) {
  const can = await canReviewCrew(database, companyId, crewId)
  if (!can) {
    return { error: 'You can only review crew members who have completed and had timesheets approved on your shows' }
  }

  const existing = await database.collection('reviews').findOne({ companyId, crewId })
  if (existing) {
    return { error: 'You have already submitted a review for this crew member' }
  }

  const validRating = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)))
  const review = {
    id: uuidv4(),
    companyId,
    companyName,
    crewId,
    rating: validRating,
    comment: String(comment || '').trim().slice(0, 2000),
    createdAt: new Date(),
  }

  await database.collection('reviews').insertOne(review)

  // Recalculate average
  const allReviews = await database.collection('reviews').find({ crewId }).toArray()
  const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / (allReviews.length || 1)
  await database.collection('crew_profiles').updateOne(
    { id: crewId },
    { $set: { ratingAvg: +avg.toFixed(1), ratingCount: allReviews.length } }
  )

  return { review }
}
