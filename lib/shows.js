import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { normalizeState } from './us-locations'

const text = (max) => z.string().trim().min(1, 'Required').max(max)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Invalid calendar date')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm')
const rate = z.number().finite().min(0).max(1000000).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
  'Rates must have at most two decimal places',
)
const requirements = z.array(text(100)).max(50).default([])
export const staffingSchema = z.object({
  departmentName: text(100),
  roleTitle: text(150),
  headcountNeeded: z.number().int().min(1).max(10000),
  regularRate: rate,
  overtimeRate: rate,
  callTime: time,
  wrapTime: time,
  requiredSkills: requirements,
  requiredCertifications: requirements,
}).refine((row) => row.callTime !== row.wrapTime, {
  message: 'Call and wrap times must differ', path: ['wrapTime'],
})
const showFields = {
  title: text(200),
  venueName: text(200),
  city: text(100),
  state: z.string().transform(normalizeState).refine(Boolean, 'Select one of the 50 US states'),
  startDate: date,
  endDate: date,
  description: z.string().trim().max(5000).default(''),
  status: z.enum(['draft', 'open', 'completed', 'cancelled']).default('draft'),
}
const dateOrder = (show) => show.endDate >= show.startDate
const dateError = { message: 'End date cannot be before start date', path: ['endDate'] }
export const showSchema = z.object({ ...showFields, staffing: z.array(staffingSchema).max(100).default([]) }).refine(dateOrder, dateError)
const editShowSchema = z.object(showFields).strict().refine(dateOrder, dateError)

const publicShow = ({ _id, ...show }) => show
const invalid = (result) => NextResponse.json({
  error: result.error.issues.map((issue) => `${issue.path.join('.') || 'show'}: ${issue.message}`).join('; '),
}, { status: 400 })

// Only these routes write shows. Existing jobs, RFPs, billing and profiles are independent.
export async function handleShowsRequest(request, { database, user, route }) {
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'company') return NextResponse.json({ error: 'Company account required' }, { status: 403 })
  const company = await database.collection('companies').findOne({ userId: user.id })
  if (!company) return NextResponse.json({ error: 'Create a company profile first' }, { status: 400 })
  const scope = { companyId: company.id, userId: user.id }
  const shows = database.collection('shows')
  const parts = route.split('/').filter(Boolean)
  const method = request.method

  if (parts.length === 1 && method === 'GET') {
    const list = await shows.find(scope, { projection: { _id: 0 } }).sort({ startDate: 1, createdAt: -1 }).toArray()
    return NextResponse.json({ shows: list })
  }
  if (parts.length === 1 && method === 'POST') {
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const result = showSchema.safeParse(body)
    if (!result.success) return invalid(result)
    const id = uuidv4()
    const now = new Date()
    const show = {
      _id: id, id, ...scope, ...result.data,
      staffing: result.data.staffing.map((row) => ({ ...row, id: uuidv4() })),
      createdAt: now, updatedAt: now,
    }
    await shows.insertOne(show)
    return NextResponse.json({ show: publicShow(show) }, { status: 201 })
  }
  if (parts.length === 2 && method === 'GET') {
    const show = await shows.findOne({ ...scope, id: parts[1] })
    return show ? NextResponse.json({ show: publicShow(show) }) : NextResponse.json({ error: 'Show not found' }, { status: 404 })
  }
  if (parts.length === 2 && method === 'PUT') {
    const ownerFilter = { ...scope, id: parts[1] }
    if (!await shows.findOne(ownerFilter, { projection: { id: 1 } })) return NextResponse.json({ error: 'Show not found' }, { status: 404 })
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const result = editShowSchema.safeParse(body)
    if (!result.success) return invalid(result)
    const { startDate, endDate } = result.data
    // Check every recorded work date atomically, including rejected timesheets.
    const saved = await shows.findOneAndUpdate({ ...ownerFilter, staffing: { $not: { $elemMatch: {
      invitations: { $elemMatch: { timesheets: { $elemMatch: { $or: [{ workDate: { $lt: startDate } }, { workDate: { $gt: endDate } }] } } } },
    } } } }, { $set: { ...result.data, updatedAt: new Date() } }, { returnDocument: 'after' })
    if (!saved) return NextResponse.json({ error: 'Show dates cannot exclude recorded timesheet work dates' }, { status: 409 })
    return NextResponse.json({ show: publicShow(saved) })
  }
  if (parts.length === 4 && parts[2] === 'staffing' && method === 'PUT') {
    const ownerFilter = { ...scope, id: parts[1], 'staffing.id': parts[3] }
    if (!await shows.findOne(ownerFilter, { projection: { id: 1 } })) return NextResponse.json({ error: 'Show or staffing row not found' }, { status: 404 })
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const result = staffingSchema.safeParse(body)
    if (!result.success) return invalid(result)
    const fields = Object.fromEntries(Object.entries(result.data).map(([key, value]) => [`staffing.$.${key}`, value]))
    const saved = await shows.findOneAndUpdate({ ...ownerFilter, $expr: { $let: {
      vars: { row: { $arrayElemAt: [{ $filter: { input: '$staffing', as: 'row', cond: { $eq: ['$$row.id', parts[3]] } } }, 0] } },
      in: { $lte: [{ $size: { $filter: { input: { $ifNull: ['$$row.invitations', []] }, as: 'invite', cond: { $eq: ['$$invite.status', 'accepted'] } } } }, result.data.headcountNeeded] },
    } } }, { $set: { ...fields, updatedAt: new Date() } }, { returnDocument: 'after' })
    if (!saved) return NextResponse.json({ error: 'Headcount cannot be lower than accepted assignments. Refresh and try again.' }, { status: 409 })
    return NextResponse.json({ show: publicShow(saved) })
  }
  if (parts.length === 3 && parts[2] === 'staffing' && method === 'POST') {
    const ownerFilter = { ...scope, id: parts[1] }
    if (!await shows.findOne(ownerFilter, { projection: { id: 1 } })) {
      return NextResponse.json({ error: 'Show not found' }, { status: 404 })
    }
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const result = staffingSchema.safeParse(body)
    if (!result.success) return invalid(result)
    // Atomic append prevents concurrent additions from overwriting other rows.
    const show = await shows.findOneAndUpdate(
      { ...ownerFilter, 'staffing.99': { $exists: false } },
      { $push: { staffing: { ...result.data, id: uuidv4() } }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!show) return NextResponse.json({ error: 'A show supports up to 100 staffing rows' }, { status: 409 })
    return NextResponse.json({ show: publicShow(show) }, { status: 201 })
  }
  return NextResponse.json({ error: 'Show route or method not supported' }, { status: 404 })
}
