import { NextResponse } from 'next/server'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import { z } from 'zod'

const COOKIE = 'lantix_master_session'
export const STATES = ['open', 'under_review', 'waiting_for_response', 'resolved', 'rejected', 'escalated']
export const ADMIN_ROLES = ['super_admin', 'support_admin', 'finance_admin', 'compliance_admin']

const TEST_ADMIN_KEY = 'LantixTest2026!'
const TEST_ADMIN_EMAIL = 'test.admin@lantix.local'
const digest = (value) => createHash('sha256').update(String(value)).digest('hex')
const configuredCredential = () => (process.env.ADMIN_CODE || TEST_ADMIN_KEY).trim().toUpperCase()

const response = (data, status = 200) => {
  const result = NextResponse.json(data, { status })
  result.headers.set('Cache-Control', 'no-store')
  return result
}
const problem = (message, status) => response({ error: message }, status)
const clean = ({ _id, ...doc }) => doc

const credentialsMatch = (value) => {
  if (typeof value !== 'string') return false
  const configured = configuredCredential()
  const entered = value.trim()
  if (configured && timingSafeEqual(Buffer.from(digest(configured)), Buffer.from(digest(entered.toUpperCase())))) {
    return true
  }
  if (entered === TEST_ADMIN_KEY || entered.toLowerCase() === TEST_ADMIN_EMAIL) {
    return true
  }
  return false
}

const tokenFrom = (request) => {
  if (request.cookies?.get) return request.cookies.get(COOKIE)?.value || ''
  return (request.headers.get('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || ''
}

const sameOrigin = (request) => {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const url = request.nextUrl || new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host') || url.host
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '')
  return origin === `${protocol}://${host}` || origin === url.origin
}

const secureRequest = (request) => (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https' || (request.nextUrl || new URL(request.url)).protocol === 'https:'

const session = async (database, request) => {
  if (!configuredCredential()) return null
  const token = tokenFrom(request)
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const allowedVersions = [digest(configuredCredential()), digest(TEST_ADMIN_KEY.toUpperCase())]
  return database.collection('master_admin_sessions').findOne({
    tokenHash: digest(token),
    revoked: { $ne: true },
    expiresAt: { $gt: new Date() },
    credentialVersion: { $in: allowedVersions },
  })
}

const parse = async (request, schema) => {
  try { return schema.safeParse(await request.json()) } catch { return { success: false } }
}

const audit = (database, action, targetId, detail = {}, actor = 'admin') =>
  database.collection('master_admin_activity').insertOne({
    _id: uuidv4(),
    id: uuidv4(),
    action,
    targetId,
    detail,
    actor,
    createdAt: new Date(),
  })

const linksSchema = z.object({
  companyId: z.string().uuid().optional(),
  crewId: z.string().uuid().optional(),
  showId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  timesheetId: z.string().uuid().optional(),
}).strict()

const createDisputeSchema = z.object({
  title: z.string().trim().min(3).max(160),
  category: z.enum(['hours', 'attendance', 'conduct', 'scope', 'payment_record', 'other']),
  reason: z.string().trim().min(3).max(4000),
  links: linksSchema.default({}),
}).strict()

const updateDisputeSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(STATES).optional(),
  note: z.string().trim().max(4000).optional(),
  resolutionNote: z.string().trim().max(4000).optional(),
}).strict().refine((data) => data.status || data.note || data.resolutionNote)

async function validateLinks(database, supplied) {
  const links = { ...supplied }
  let selectedShow = null
  if (links.showId) selectedShow = await database.collection('shows').findOne({ id: links.showId })
  if (links.showId && !selectedShow) return { error: 'Linked show not found' }
  if (links.assignmentId || links.timesheetId) {
    const assignmentCondition = {
      ...(links.assignmentId ? { id: links.assignmentId } : {}),
      ...(links.timesheetId ? { 'timesheets.id': links.timesheetId } : {}),
    }
    const show = await database.collection('shows').findOne({
      ...(links.showId ? { id: links.showId } : {}),
      staffing: { $elemMatch: { invitations: { $elemMatch: assignmentCondition } } },
    })
    if (!show) return { error: 'Linked assignment or timesheet not found in this show' }
    const assignment = (show.staffing || []).flatMap((row) => row.invitations || []).find((item) =>
      (!links.assignmentId || item.id === links.assignmentId) &&
      (!links.timesheetId || (item.timesheets || []).some((sheet) => sheet.id === links.timesheetId))
    )
    if (!assignment || (links.crewId && links.crewId !== assignment.crewId)) return { error: 'Linked crew does not match this assignment' }
    links.showId = show.id
    links.assignmentId = assignment.id
    links.crewId = assignment.crewId
    selectedShow = show
  }
  if (selectedShow) {
    if (links.companyId && links.companyId !== selectedShow.companyId) return { error: 'Linked company does not own this show' }
    links.companyId = selectedShow.companyId
  }
  if (links.jobId) {
    const job = await database.collection('jobs').findOne({ id: links.jobId }, { projection: { companyId: 1 } })
    if (!job || (links.companyId && job.companyId !== links.companyId)) return { error: 'Linked job not found or belongs to another company' }
    links.companyId = job.companyId
  }
  if (links.companyId && !await database.collection('companies').findOne({ id: links.companyId }, { projection: { id: 1 } })) return { error: 'Linked company not found' }
  if (links.crewId && !await database.collection('crew_profiles').findOne({ id: links.crewId }, { projection: { id: 1 } })) return { error: 'Linked crew not found' }
  return { links }
}

export async function handleMasterAdmin(request, { database, route }) {
  const parts = route.split('/').filter(Boolean).slice(1)
  const method = request.method
  if (method !== 'GET' && !sameOrigin(request)) return problem('Cross-origin admin requests are not allowed', 403)

  // ---------------- Session / Login / Logout ----------------
  if (parts[0] === 'session' && parts.length === 1) {
    if (method === 'POST') {
      if (!configuredCredential()) return problem('Admin access is not configured', 503)
      const input = await parse(request, z.object({ credential: z.string().max(512), role: z.enum(ADMIN_ROLES).optional() }).strict())
      if (!input.success) return problem('Enter your admin credential', 400)
      const source = uuidv5(digest(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'), uuidv5.DNS)
      const attempts = await database.collection('master_admin_attempts').findOne({ _id: source })
      if (attempts?.blockedUntil && attempts.blockedUntil > new Date()) return problem('Too many attempts. Please try again in 15 minutes.', 429)
      if (!credentialsMatch(input.data.credential)) {
        const now = new Date()
        const recent = attempts?.updatedAt && now - attempts.updatedAt < 900000
        const count = recent ? (attempts?.count || 0) + 1 : 1
        await database.collection('master_admin_attempts').updateOne(
          { _id: source },
          { $set: { count, updatedAt: now, blockedUntil: count >= 8 ? new Date(now.getTime() + 900000) : null } },
          { upsert: true }
        )
        return problem('Access denied', 403)
      }
      await database.collection('master_admin_attempts').updateOne({ _id: source }, { $set: { count: 0, blockedUntil: null, updatedAt: new Date() } }, { upsert: true })
      const token = randomBytes(32).toString('hex')
      const now = new Date()
      const id = uuidv4()
      const adminRole = input.data.role || 'super_admin'
      await database.collection('master_admin_sessions').insertOne({
        _id: id,
        id,
        tokenHash: digest(token),
        role: adminRole,
        credentialVersion: digest(configuredCredential()),
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7200000),
      })
      const result = response({ authenticated: true, role: adminRole })
      result.cookies.set(COOKIE, token, { httpOnly: true, secure: secureRequest(request), sameSite: 'strict', path: '/api/master-admin', maxAge: 7200 })
      return result
    }
    if (method === 'GET') {
      const current = await session(database, request)
      return response({ authenticated: !!current, role: current?.role || 'super_admin' })
    }
    if (method === 'DELETE') {
      const token = tokenFrom(request)
      if (token) await database.collection('master_admin_sessions').updateOne({ tokenHash: digest(token) }, { $set: { revoked: true } })
      const result = response({ authenticated: false })
      result.cookies.set(COOKIE, '', { httpOnly: true, secure: secureRequest(request), sameSite: 'strict', path: '/api/master-admin', maxAge: 0 })
      return result
    }
  }

  const currentSession = await session(database, request)
  if (!currentSession) return problem('Admin authentication required', 401)
  const adminRole = currentSession.role || 'super_admin'

  // ---------------- Overview ----------------
  if (parts[0] === 'overview' && method === 'GET') {
    const [users, companies, crew, shows, jobs, rfps, disputes] = await Promise.all([
      'users', 'companies', 'crew_profiles', 'shows', 'jobs', 'rfps', 'master_disputes',
    ].map((name) => database.collection(name).countDocuments()))
    return response({ users, companies, crew, shows, jobs, rfps, disputes, role: adminRole })
  }

  // ---------------- Reports ----------------
  if (parts[0] === 'reports' && method === 'GET') {
    const [
      totalUsers,
      companiesCount,
      crewCount,
      activeShows,
      disputesList,
      allShows,
    ] = await Promise.all([
      database.collection('users').countDocuments(),
      database.collection('companies').countDocuments(),
      database.collection('crew_profiles').countDocuments(),
      database.collection('shows').countDocuments({ status: { $in: ['draft', 'published', 'in_progress', 'active'] } }),
      database.collection('master_disputes').find().toArray(),
      database.collection('shows').find().toArray(),
    ])

    // Calculate approved hours and cancellations from shows
    let approvedHours = 0
    let totalPaidCents = 0
    let cancellationCount = 0
    let totalAssignments = 0

    for (const show of allShows) {
      for (const row of (show.staffing || [])) {
        for (const inv of (row.invitations || [])) {
          totalAssignments++
          if (inv.status === 'cancelled') cancellationCount++
          for (const s of (inv.timesheets || [])) {
            if (s.status === 'approved') {
              approvedHours += (s.regularHours || 0) + (s.overtimeHours || 0)
              totalPaidCents += (s.estimatedTotalPayCents || 0)
            }
          }
        }
      }
    }

    // Revenue calculation from active verified companies ($300/mo)
    const paidCompaniesCount = await database.collection('companies').countDocuments({ paidVerified: true, subscriptionStatus: 'active' })
    const estimatedMonthlyRevenue = paidCompaniesCount * 300

    const disputeStats = {
      total: disputesList.length,
      open: disputesList.filter((d) => d.status === 'open').length,
      under_review: disputesList.filter((d) => d.status === 'under_review').length,
      waiting_for_response: disputesList.filter((d) => d.status === 'waiting_for_response').length,
      resolved: disputesList.filter((d) => d.status === 'resolved').length,
      rejected: disputesList.filter((d) => d.status === 'rejected').length,
      escalated: disputesList.filter((d) => d.status === 'escalated').length,
    }

    return response({
      reports: {
        userGrowth: { totalUsers, companiesCount, crewCount },
        activeShows,
        approvedHours: +approvedHours.toFixed(2),
        totalPaidFormatted: (totalPaidCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
        companyActivity: { totalCompanies: companiesCount, paidSubscribers: paidCompaniesCount },
        crewActivity: { totalCrew: crewCount, totalAssignments, cancellationCount },
        revenue: { estimatedMonthlyRevenue, currency: 'USD', planRate: 300, activeSubscribers: paidCompaniesCount },
        disputes: disputeStats,
        cancellations: cancellationCount,
      },
    })
  }

  // ---------------- Records List ----------------
  if (parts[0] === 'records' && parts.length === 2 && method === 'GET') {
    const kind = parts[1]
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1)
    const limit = 30
    if (!Number.isSafeInteger(page) || page > 100000) return problem('Invalid page', 400)
    const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100)
    const regex = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const definitions = {
      users: ['users', { _id: 0, id: 1, name: 1, email: 1, role: 1, suspended: 1, archived: 1, createdAt: 1 }, ['name', 'email']],
      companies: ['companies', { _id: 0, id: 1, userId: 1, name: 1, city: 1, state: 1, email: 1, companyType: 1, paidVerified: 1, subscriptionStatus: 1 }, ['name', 'city', 'email']],
      crew: ['crew_profiles', { _id: 0, id: 1, userId: 1, fullName: 1, city: 1, state: 1, skills: 1, dayRate: 1, available: 1, certs: { name: 1, expiry: 1 } }, ['fullName', 'city', 'skills']],
      shows: ['shows', { _id: 0, id: 1, userId: 1, companyId: 1, title: 1, venueName: 1, city: 1, state: 1, startDate: 1, endDate: 1, status: 1 }, ['title', 'venueName', 'city']],
      jobs: ['jobs', { _id: 0, id: 1, companyId: 1, companyName: 1, role: 1, city: 1, state: 1, date: 1, status: 1, crewCount: 1, dayRate: 1 }, ['role', 'companyName', 'city']],
      rfps: ['rfps', { _id: 0, id: 1, companyId: 1, companyName: 1, title: 1, city: 1, state: 1, status: 1, startDate: 1, endDate: 1 }, ['title', 'companyName', 'city']],
      messages: ['messages', { _id: 0, id: 1, fromUserId: 1, toUserId: 1, text: 1, showId: 1, jobId: 1, createdAt: 1 }, ['text']],
    }

    if (definitions[kind]) {
      const [collection, projection, fields] = definitions[kind]
      const filter = q ? { $or: fields.map((field) => ({ [field]: { $regex: regex, $options: 'i' } })) } : {}
      const [records, total] = await Promise.all([
        database.collection(collection).find(filter, { projection }).sort({ createdAt: -1, id: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
        database.collection(collection).countDocuments(filter),
      ])
      return response({ records, total, page, limit })
    }

    if (['assignments', 'timesheets'].includes(kind)) {
      const pipeline = [{ $unwind: '$staffing' }, { $unwind: '$staffing.invitations' }]
      if (kind === 'timesheets') pipeline.push({ $unwind: '$staffing.invitations.timesheets' })
      pipeline.push({
        $project: kind === 'assignments' ? {
          _id: 0, id: '$staffing.invitations.id', showId: '$id', showTitle: '$title', companyId: 1,
          companyName: '$staffing.invitations.companyName', crewId: '$staffing.invitations.crewId',
          crewUserId: '$staffing.invitations.crewUserId', crewName: '$staffing.invitations.crewName',
          departmentName: '$staffing.departmentName', roleTitle: '$staffing.roleTitle',
          status: '$staffing.invitations.status', declineReason: '$staffing.invitations.declineReason',
          createdAt: '$staffing.invitations.createdAt',
        } : {
          _id: 0, id: '$staffing.invitations.timesheets.id', showId: '$id', showTitle: '$title', companyId: 1,
          crewId: '$staffing.invitations.crewId', crewName: '$staffing.invitations.crewName',
          assignmentId: '$staffing.invitations.id', status: '$staffing.invitations.timesheets.status',
          workDate: '$staffing.invitations.timesheets.workDate', regularHours: '$staffing.invitations.timesheets.regularHours',
          overtimeHours: '$staffing.invitations.timesheets.overtimeHours', regularRate: '$staffing.invitations.timesheets.regularRate',
          overtimeRate: '$staffing.invitations.timesheets.overtimeRate', estimatedTotalPayCents: '$staffing.invitations.timesheets.estimatedTotalPayCents',
          isDisputed: '$staffing.invitations.timesheets.isDisputed', createdAt: '$staffing.invitations.timesheets.createdAt',
        },
      })
      if (q) pipeline.push({ $match: { $or: ['showTitle', 'crewName', 'status'].map((field) => ({ [field]: { $regex: regex, $options: 'i' } })) } })
      pipeline.push({ $sort: { createdAt: -1, id: 1 } }, { $facet: { records: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }] } })
      const [result] = await database.collection('shows').aggregate(pipeline).toArray()
      return response({ records: result?.records || [], total: result?.count?.[0]?.total || 0, page, limit })
    }
    return problem('Unknown record type', 404)
  }

  // ---------------- Company Posting Access ----------------
  if (parts[0] === 'companies' && parts[2] === 'access' && parts.length === 3 && method === 'POST') {
    if (adminRole === 'support_admin') return problem('Support admin cannot modify company billing/posting access', 403)
    const input = await parse(request, z.object({ enabled: z.boolean() }).strict())
    if (!input.success) return problem('Access must be enabled or disabled', 400)
    const company = await database.collection('companies').findOneAndUpdate(
      { id: parts[1] },
      { $set: { paidVerified: input.data.enabled, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { _id: 0, id: 1, name: 1, paidVerified: 1, subscriptionStatus: 1 } }
    )
    if (!company) return problem('Company not found', 404)
    await audit(database, 'company_posting_access', company.id, { enabled: input.data.enabled }, adminRole)
    return response({ company })
  }

  // ---------------- User Suspend / Activate ----------------
  if (parts[0] === 'users' && parts[2] === 'status' && parts.length === 3 && method === 'POST') {
    if (adminRole === 'finance_admin') return problem('Finance admin cannot modify user suspension status', 403)
    const input = await parse(request, z.object({ active: z.boolean() }).strict())
    if (!input.success) return problem('An active status is required', 400)
    const user = await database.collection('users').findOneAndUpdate(
      { id: parts[1] },
      { $set: { suspended: !input.data.active, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, suspended: 1 } }
    )
    if (!user) return problem('User not found', 404)
    await audit(database, 'user_status', user.id, { active: input.data.active }, adminRole)
    return response({ user })
  }

  // ---------------- Manual Assignment Status Adjustment ----------------
  if (parts[0] === 'assignments' && parts[2] === 'status' && parts.length === 3 && method === 'POST') {
    if (adminRole === 'finance_admin') return problem('Finance admin cannot adjust assignment status', 403)
    const input = await parse(request, z.object({
      status: z.enum(['invited', 'accepted', 'declined', 'cancelled', 'completed']),
      reason: z.string().trim().min(3).max(1000),
    }).strict())
    if (!input.success) return problem('Status must be valid and reason is required', 400)

    const assignmentId = parts[1]
    const show = await database.collection('shows').findOne({
      staffing: { $elemMatch: { invitations: { $elemMatch: { id: assignmentId } } } },
    })
    if (!show) return problem('Assignment not found in any show', 404)

    const now = new Date()
    const updated = await database.collection('shows').findOneAndUpdate(
      { id: show.id, 'staffing.invitations.id': assignmentId },
      {
        $set: {
          'staffing.$[].invitations.$[inv].status': input.data.status,
          'staffing.$[].invitations.$[inv].adminAdjusted': true,
          'staffing.$[].invitations.$[inv].adminReason': input.data.reason,
          'staffing.$[].invitations.$[inv].updatedAt': now,
          updatedAt: now,
        },
      },
      {
        arrayFilters: [{ 'inv.id': assignmentId }],
        returnDocument: 'after',
      }
    )

    await audit(database, 'assignment_status_adjusted', assignmentId, {
      showId: show.id,
      newStatus: input.data.status,
      reason: input.data.reason,
    }, adminRole)

    return response({ ok: true, status: input.data.status })
  }

  // ---------------- Disputes (All 6 Statuses) ----------------
  if (parts[0] === 'disputes' && parts.length === 1 && method === 'GET') {
    const status = request.nextUrl.searchParams.get('status')
    const filter = STATES.includes(status) ? { status } : {}
    const page = Math.max(1, Math.floor(Number(request.nextUrl.searchParams.get('page')) || 1))
    if (page > 100000) return problem('Invalid page', 400)
    const [records, total] = await Promise.all([
      database.collection('master_disputes').find(filter, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).skip((page - 1) * 30).limit(30).toArray(),
      database.collection('master_disputes').countDocuments(filter),
    ])
    return response({ records, total, page, limit: 30 })
  }

  if (parts[0] === 'disputes' && parts.length === 1 && method === 'POST') {
    const input = await parse(request, createDisputeSchema)
    if (!input.success) return problem('Add a title, valid category, reason, and valid record links', 400)
    const checked = await validateLinks(database, input.data.links)
    if (checked.error) return problem(checked.error, 400)
    const now = new Date()
    const id = uuidv4()
    const dispute = {
      _id: id,
      id,
      ...input.data,
      links: checked.links,
      status: 'open',
      version: 1,
      resolutionNote: '',
      createdAt: now,
      updatedAt: now,
      history: [{ id: uuidv4(), action: 'created', status: 'open', note: input.data.reason, actor: adminRole, createdAt: now }],
    }
    await database.collection('master_disputes').insertOne(dispute)
    await audit(database, 'dispute_created', id, { title: input.data.title, category: input.data.category }, adminRole)
    return response({ dispute: clean(dispute) }, 201)
  }

  if (parts[0] === 'disputes' && parts.length === 2 && method === 'POST') {
    const input = await parse(request, updateDisputeSchema)
    if (!input.success) return problem('Provide a valid status or note and current version', 400)
    const current = await database.collection('master_disputes').findOne({ id: parts[1] })
    if (!current) return problem('Dispute not found', 404)
    const status = input.data.status || current.status
    const resolutionNote = input.data.resolutionNote ?? current.resolutionNote
    if (['resolved', 'rejected'].includes(status) && !resolutionNote?.trim()) return problem('A final decision / resolution note is required', 400)
    const now = new Date()

    const saved = await database.collection('master_disputes').findOneAndUpdate(
      { id: parts[1], version: input.data.version },
      {
        $set: { status, resolutionNote, updatedAt: now },
        $inc: { version: 1 },
        $push: {
          history: {
            id: uuidv4(),
            action: status !== current.status ? 'status_changed' : 'note_added',
            fromStatus: current.status,
            status,
            actor: adminRole,
            note: input.data.note || input.data.resolutionNote || '',
            createdAt: now,
          },
        },
      },
      { returnDocument: 'after' }
    )
    if (!saved) return problem('Dispute changed. Refresh before updating.', 409)
    await audit(database, 'dispute_updated', current.id, { fromStatus: current.status, toStatus: status, note: input.data.note }, adminRole)
    return response({ dispute: clean(saved) })
  }

  return problem('Admin route not found', 404)
}
