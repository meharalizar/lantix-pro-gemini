import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { checkCompanyPermission, createNotification } from './company-features'

const reply = (data, status = 200) => NextResponse.json(data, { status })
const fail = (message, status) => reply({ error: message }, status)
const decimal = (max) => z.number().finite().min(0).max(max).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, 'Use at most two decimal places')
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Invalid work date')
const fields = { workDate: date, regularHours: decimal(24), overtimeHours: decimal(24), notes: z.string().trim().max(3000).default('') }
const validHours = (value) => {
  const hundredths = Math.round(value.regularHours * 100) + Math.round(value.overtimeHours * 100)
  return hundredths > 0 && hundredths <= 2400
}
const hoursMessage = { message: 'Combined hours must be greater than 0 and no more than 24' }
const createSchema = z.object({ ...fields, assignmentId: z.string().uuid() }).strict().refine(validHours, hoursMessage)
const resubmitSchema = z.object({ ...fields, version: z.number().int().positive() }).strict().refine(validHours, hoursMessage)
const reviewSchema = z.object({ status: z.enum(['approved', 'rejected']), version: z.number().int().positive(), reviewNote: z.string().trim().max(1000).default('') }).strict()
const disputeSchema = z.object({ reason: z.string().trim().min(3).max(4000), category: z.enum(['hours', 'attendance', 'conduct', 'scope', 'payment_record', 'other']).default('hours'), title: z.string().trim().max(160).optional() }).strict()
const body = async (request, schema) => {
  try { return schema.safeParse(await request.json()) } catch { return { success: false } }
}
const invalid = (result) => fail(result.error?.issues?.map((issue) => `${issue.path.join('.') || 'timesheet'}: ${issue.message}`).join('; ') || 'Invalid JSON body', 400)
const owner = (database, user) => database.collection('companies').findOne({ userId: user.id }, { projection: { id: 1 } })
const assignmentInfo = (show, row, assignment) => ({
  id: assignment.id, crewId: assignment.crewId, companyId: show.companyId, companyName: assignment.companyName,
  showId: show.id, showTitle: show.title, venueName: show.venueName, city: show.city, state: show.state,
  startDate: show.startDate, endDate: show.endDate, staffingRowId: row.id,
  departmentName: row.departmentName, roleTitle: row.roleTitle, regularRate: row.regularRate, overtimeRate: row.overtimeRate,
})
const entries = (show) => (show.staffing || []).flatMap((row) => (row.invitations || []).map((assignment) => ({ show, row, assignment })))
const locate = (show, id) => {
  if (!show) return null
  for (const entry of entries(show)) {
    const timesheet = (entry.assignment.timesheets || []).find((item) => item.id === id)
    if (timesheet) return { ...entry, timesheet }
  }
  return null
}
const pay = (regularHours, overtimeHours, regularRate, overtimeRate) => {
  const regularPayCents = Math.round(Math.round(regularHours * 100) * Math.round(regularRate * 100) / 100)
  const overtimePayCents = Math.round(Math.round(overtimeHours * 100) * Math.round(overtimeRate * 100) / 100)
  return { regularPayCents, overtimePayCents, estimatedTotalPayCents: regularPayCents + overtimePayCents }
}
const inDates = (workDate, show) => workDate >= show.startDate && workDate <= show.endDate
const arrayPath = 'staffing.$[row].invitations.$[assignment].timesheets.$[sheet]'
const atPath = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [`${arrayPath}.${key}`, value]))

export async function handleTimesheets(request, { database, user, route }) {
  if (!user) return fail('Unauthorized', 401)
  if (!['company', 'crew'].includes(user.role)) return fail('Company or crew account required', 403)
  const company = user.role === 'company' ? await owner(database, user) : null
  if (user.role === 'company' && !company) return fail('Create a company profile first', 400)
  const scope = company ? { companyId: company.id, userId: user.id } : {}
  const shows = database.collection('shows')
  const parts = route.split('/').filter(Boolean)
  const method = request.method

  if (route === '/timesheets/assignments' && method === 'GET') {
    if (user.role !== 'crew') return fail('Crew account required', 403)
    const records = await shows.find({ staffing: { $elemMatch: { invitations: { $elemMatch: { crewUserId: user.id, status: 'accepted' } } } } }).toArray()
    return reply({ assignments: records.flatMap((show) => entries(show).filter(({ assignment }) => assignment.crewUserId === user.id && assignment.status === 'accepted').map(({ row, assignment }) => assignmentInfo(show, row, assignment))) })
  }
  if (route === '/timesheets' && method === 'GET') {
    const records = await shows.find(company ? scope : { 'staffing.invitations.crewUserId': user.id }).toArray()
    const timesheets = records.flatMap((show) => entries(show).filter(({ assignment }) => company || assignment.crewUserId === user.id)
      .flatMap(({ assignment }) => (assignment.timesheets || []).map((sheet) => ({ ...sheet, assignmentStatus: assignment.status }))))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return reply({ timesheets })
  }
  if (route === '/timesheets' && method === 'POST') {
    if (user.role !== 'crew') return fail('Crew account required', 403)
    const input = await body(request, createSchema)
    if (!input.success) return invalid(input)
    const { assignmentId, ...hours } = input.data
    const assignmentMatch = { id: assignmentId, crewUserId: user.id, status: 'accepted' }
    const show = await shows.findOne({ staffing: { $elemMatch: { invitations: { $elemMatch: assignmentMatch } } } })
    const entry = show && entries(show).find(({ assignment }) => assignment.id === assignmentId && assignment.crewUserId === user.id)
    if (!entry) return fail('Accepted assignment not found', 404)
    if (!inDates(hours.workDate, show)) return fail('Work date must be within the show dates', 400)
    const { row, assignment } = entry
    if (!decimal(1000000).safeParse(row.regularRate).success || !decimal(1000000).safeParse(row.overtimeRate).success) return fail('Staffing rates are invalid; contact the company', 409)
    const now = new Date()
    const timesheet = {
      ...assignmentInfo(show, row, assignment), id: uuidv4(), assignmentId, crewUserId: user.id,
      crewName: assignment.crewName, companyUserId: show.userId, ...hours,
      ...pay(hours.regularHours, hours.overtimeHours, row.regularRate, row.overtimeRate), currency: 'USD',
      status: 'submitted', version: 1, createdAt: now, submittedAt: now, updatedAt: now,
      reviewedAt: null, reviewedBy: null, reviewNote: '',
    }
    const updated = await shows.findOneAndUpdate({ id: show.id, companyId: show.companyId, userId: show.userId,
      startDate: { $lte: hours.workDate }, endDate: { $gte: hours.workDate },
      staffing: { $elemMatch: { id: row.id, regularRate: row.regularRate, overtimeRate: row.overtimeRate,
        invitations: { $elemMatch: { ...assignmentMatch, timesheets: { $not: { $elemMatch: { workDate: hours.workDate } } } } },
      } },
    }, { $push: { 'staffing.$[row].invitations.$[assignment].timesheets': timesheet }, $set: { updatedAt: now } }, {
      arrayFilters: [{ 'row.id': row.id }, { 'assignment.id': assignmentId, 'assignment.status': 'accepted' }], returnDocument: 'after',
    })
    if (!updated) return fail('A timesheet already exists for this assignment/date, or the assignment changed. Refresh and try again.', 409)
    return reply({ timesheet }, 201)
  }

  const resubmitting = parts.length === 3 && parts[2] === 'resubmit'
  const reviewing = parts.length === 3 && parts[2] === 'review'
  const disputing = parts.length === 3 && parts[2] === 'dispute'

  if (parts[0] === 'timesheets' && disputing && method === 'POST') {
    const input = await body(request, disputeSchema)
    if (!input.success) return invalid(input)
    const show = await shows.findOne(company ? scope : { staffing: { $elemMatch: { invitations: { $elemMatch: { crewUserId: user.id, timesheets: { $elemMatch: { id: parts[1] } } } } } } })
    const entry = locate(show, parts[1])
    if (!entry) return fail('Timesheet not found', 404)
    const { row, assignment, timesheet } = entry
    if (timesheet.status === 'disputed' || timesheet.isDisputed) return fail('This timesheet is already disputed', 409)

    const now = new Date()
    const disputeId = uuidv4()
    const disputeRecord = {
      _id: disputeId,
      id: disputeId,
      title: input.data.title || `Timesheet dispute: ${timesheet.crewName} (${timesheet.workDate})`,
      category: input.data.category || 'hours',
      reason: input.data.reason,
      status: 'open',
      version: 1,
      openedByUserId: user.id,
      openedByRole: user.role,
      links: {
        timesheetId: timesheet.id,
        assignmentId: assignment.id,
        showId: show.id,
        companyId: show.companyId,
        crewId: timesheet.crewId,
      },
      evidence: {
        workDate: timesheet.workDate,
        regularHours: timesheet.regularHours,
        overtimeHours: timesheet.overtimeHours,
        regularRate: timesheet.regularRate,
        overtimeRate: timesheet.overtimeRate,
        estimatedTotalPayCents: timesheet.estimatedTotalPayCents,
        notes: timesheet.notes || '',
        submittedAt: timesheet.submittedAt,
        previousStatus: timesheet.status,
      },
      resolutionNote: '',
      history: [{ id: uuidv4(), action: 'created_from_timesheet', status: 'open', note: input.data.reason, createdAt: now }],
      createdAt: now,
      updatedAt: now,
    }
    await database.collection('master_disputes').insertOne(disputeRecord)

    // Freeze timesheet and link dispute
    const updated = await shows.findOneAndUpdate(
      { id: show.id, staffing: { $elemMatch: { id: row.id, invitations: { $elemMatch: { id: assignment.id, timesheets: { $elemMatch: { id: timesheet.id } } } } } } },
      {
        $set: {
          ...atPath({ status: 'disputed', isDisputed: true, disputeId, disputeReason: input.data.reason, updatedAt: now }),
          updatedAt: now,
        },
      },
      {
        arrayFilters: [{ 'row.id': row.id }, { 'assignment.id': assignment.id }, { 'sheet.id': timesheet.id }],
        returnDocument: 'after',
      }
    )

    // Send notifications to both parties
    await createNotification(database, {
      userId: user.role === 'company' ? assignment.crewUserId : show.userId,
      title: 'Timesheet Disputed',
      message: `A dispute has been opened for ${timesheet.workDate} (${timesheet.showTitle || show.title}). The record is frozen pending admin mediation.`,
      type: 'dispute',
      link: '/timesheets',
    })

    return reply({ dispute: disputeRecord, timesheet: locate(updated, timesheet.id).timesheet }, 201)
  }

  if (parts[0] === 'timesheets' && (resubmitting || reviewing) && method === 'POST') {
    if (user.role !== (resubmitting ? 'crew' : 'company')) return fail(resubmitting ? 'Crew account required' : 'Company account required', 403)
    const input = await body(request, resubmitting ? resubmitSchema : reviewSchema)
    if (!input.success) return invalid(input)
    const inviteScope = resubmitting ? { crewUserId: user.id } : {}
    const show = await shows.findOne({ ...scope, staffing: { $elemMatch: { invitations: { $elemMatch: { ...inviteScope, timesheets: { $elemMatch: { id: parts[1] } } } } } } })
    const entry = locate(show, parts[1])
    if (!entry) return fail('Timesheet not found', 404)
    const { row, assignment, timesheet } = entry

    // Freeze disputed records
    if (timesheet.status === 'disputed' || timesheet.isDisputed) {
      return fail('This timesheet is in an active dispute and locked from modification pending admin resolution', 409)
    }

    // Role-based Department Head permission check
    if (reviewing && company) {
      const perm = await checkCompanyPermission(database, user, company, 'timesheet_approval', { departmentName: row.departmentName })
      if (!perm.allowed) return fail(perm.error, 403)
    }

    const expectedStatus = resubmitting ? 'rejected' : 'submitted'
    if (timesheet.status !== expectedStatus || timesheet.version !== input.data.version) return fail('This timesheet changed or is locked. Refresh before continuing.', 409)
    if (resubmitting && assignment.status !== 'accepted') return fail('Only currently accepted assignments can be resubmitted', 409)
    if (resubmitting && !inDates(input.data.workDate, show)) return fail('Work date must be within the show dates', 400)
    const now = new Date()
    const changes = resubmitting ? {
      workDate: input.data.workDate, regularHours: input.data.regularHours, overtimeHours: input.data.overtimeHours, notes: input.data.notes,
      ...pay(input.data.regularHours, input.data.overtimeHours, timesheet.regularRate, timesheet.overtimeRate),
      status: 'submitted', submittedAt: now, reviewedAt: null, reviewedBy: null, reviewNote: '',
    } : { status: input.data.status, reviewNote: input.data.reviewNote, reviewedAt: now, reviewedBy: user.id }
    const assignmentCondition = { id: assignment.id, ...inviteScope,
      ...(resubmitting ? { status: 'accepted' } : {}),
      timesheets: { $elemMatch: { id: timesheet.id, status: expectedStatus, version: input.data.version },
        ...(resubmitting ? { $not: { $elemMatch: { workDate: input.data.workDate, id: { $ne: timesheet.id } } } } : {}),
      },
    }
    const updated = await shows.findOneAndUpdate({ ...scope, id: show.id,
      ...(resubmitting ? { startDate: { $lte: input.data.workDate }, endDate: { $gte: input.data.workDate } } : {}),
      staffing: { $elemMatch: { id: row.id, invitations: { $elemMatch: assignmentCondition } } } }, {
      $set: { ...atPath({ ...changes, updatedAt: now }), updatedAt: now },
      $inc: { [`${arrayPath}.version`]: 1 },
    }, {
      arrayFilters: [{ 'row.id': row.id }, { 'assignment.id': assignment.id }, { 'sheet.id': timesheet.id, 'sheet.status': expectedStatus, 'sheet.version': input.data.version }],
      returnDocument: 'after',
    })
    if (!updated) return fail('Timesheet changed, date is already used, or assignment is no longer accepted. Refresh and try again.', 409)
    return reply({ timesheet: locate(updated, timesheet.id).timesheet })
  }
  return fail('Timesheet route or method not supported', 404)
}
