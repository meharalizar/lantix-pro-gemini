const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const key = (value) => value.toISOString().slice(0, 10)
const daysBetween = (start, end, from, to) => {
  if (!validDate(start) || !validDate(end)) return []
  const first = start > from ? start : from
  const last = end < to ? end : to
  const result = []
  const endTime = new Date(`${last}T00:00:00Z`).getTime()
  for (let day = new Date(`${first}T00:00:00Z`); day.getTime() <= endTime; day.setUTCDate(day.getUTCDate() + 1)) result.push(key(day))
  return result
}

export async function showCalendarEvents(database, user, range = {}) {
  const now = new Date()
  const from = range.from || key(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  const to = range.to || key(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)))
  if (!validDate(from) || !validDate(to) || from > to || (new Date(to) - new Date(from)) / 86400000 > 365) return { error: 'Calendar range must be valid dates covering no more than 366 days' }
  if (!['company', 'crew'].includes(user.role)) return { events: [] }
  const company = user.role === 'company' ? await database.collection('companies').findOne({ userId: user.id }, { projection: { id: 1 } }) : null
  if (user.role === 'company' && !company) return { events: [] }
  const shows = await database.collection('shows').find(company ? { userId: user.id, companyId: company.id } : { 'staffing.invitations.crewUserId': user.id }).toArray()
  const events = []
  for (const show of shows) {
    const rows = show.staffing || []
    const ownsAssignment = rows.some((row) => (row.invitations || []).some((invite) => invite.crewUserId === user.id && invite.status === 'accepted'))
    const dates = daysBetween(show.startDate, show.endDate, from, to)
    const base = { showId: show.id, showTitle: show.title, venueName: show.venueName, city: show.city, state: show.state, startDate: show.startDate, endDate: show.endDate }
    if (company || ownsAssignment) for (const date of dates) events.push({ ...base, id: `show:${show.id}:${date}`, kind: 'show', date, role: show.title, status: show.status })
    for (const row of rows) for (const assignment of row.invitations || []) {
      if (!company && assignment.crewUserId !== user.id) continue
      if (assignment.status === 'accepted') for (const date of dates) events.push({ ...base, id: `assignment:${assignment.id}:${date}`, kind: 'assignment', date, assignmentId: assignment.id, staffingRowId: row.id, role: `${row.departmentName} / ${row.roleTitle}`, crewName: assignment.crewName, callTime: row.callTime, wrapTime: row.wrapTime, status: show.status === 'cancelled' ? 'cancelled' : 'accepted' })
      for (const sheet of assignment.timesheets || []) {
        if (!['submitted', 'approved'].includes(sheet.status) || !validDate(sheet.workDate) || sheet.workDate < from || sheet.workDate > to) continue
        events.push({ ...base, id: `timesheet:${sheet.id}`, kind: 'timesheet', timesheetId: sheet.id, assignmentId: assignment.id, staffingRowId: row.id, date: sheet.workDate, role: `${row.departmentName} / ${row.roleTitle}`, crewName: assignment.crewName, status: sheet.status, regularHours: sheet.regularHours, overtimeHours: sheet.overtimeHours, regularRate: sheet.regularRate, overtimeRate: sheet.overtimeRate, estimatedTotalPayCents: sheet.estimatedTotalPayCents })
      }
    }
  }
  return { events }
}
