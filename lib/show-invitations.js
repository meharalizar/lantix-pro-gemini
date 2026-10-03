import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { createNotification } from './company-features'

const reply = (data, status = 200) => NextResponse.json(data, { status })
const error = (message, status) => reply({ error: message }, status)
const ACTIVE = ['invited', 'accepted']
const CLOSED_SHOW = ['completed', 'cancelled']
const inviteInput = z.object({ crewId: z.string().uuid() })
const responseInput = z.object({
  status: z.enum(['accepted', 'declined']),
  declineReason: z.string().trim().max(100).optional(),
  declineNote: z.string().trim().max(500).optional(),
})
const parseBody = async (request, schema) => {
  try { return schema.safeParse(await request.json()) } catch { return { success: false } }
}
const staffingRow = (show, rowId) => (show?.staffing || []).find((row) => row.id === rowId)
const roster = (row) => ({
  invitations: row?.invitations || [],
  assignedCount: (row?.invitations || []).filter((invite) => invite.status === 'accepted').length,
  headcountNeeded: row?.headcountNeeded || 0,
})
const invitationRow = (show, id) => (show?.staffing || []).find((row) => (row.invitations || []).some((invite) => invite.id === id))
const invitationFrom = (show, id) => invitationRow(show, id)?.invitations?.find((invite) => invite.id === id)

// Evaluated inside the same Mongo update as acceptance: concurrent accepts cannot overbook.
const capacityAvailable = (rowId) => ({
  $let: {
    vars: { row: { $ifNull: [{ $arrayElemAt: [{ $filter: { input: { $ifNull: ['$staffing', []] }, as: 'row', cond: { $eq: ['$$row.id', rowId] } } }, 0] }, { headcountNeeded: 0 }] } },
    in: { $lt: [
      { $size: { $filter: { input: { $ifNull: ['$$row.invitations', []] }, as: 'invite', cond: { $eq: ['$$invite.status', 'accepted'] } } } },
      '$$row.headcountNeeded',
    ] },
  },
})

// Crew responses contain only their own invitation, never the other invitees or roster.
const crewView = (show, row, invite) => ({
  ...invite,
  show: { id: show.id, title: show.title, venueName: show.venueName, city: show.city, state: show.state, startDate: show.startDate, endDate: show.endDate, description: show.description, status: show.status },
  staffing: { id: row.id, departmentName: row.departmentName, roleTitle: row.roleTitle, headcountNeeded: row.headcountNeeded, regularRate: row.regularRate, overtimeRate: row.overtimeRate, callTime: row.callTime, wrapTime: row.wrapTime, requiredSkills: row.requiredSkills || [], requiredCertifications: row.requiredCertifications || [] },
})
const ownedCompany = (database, user) => database.collection('companies').findOne({ userId: user.id }, { projection: { id: 1, name: 1 } })

export async function handleShowInvitations(request, { database, user, route }) {
  if (!user) return error('Unauthorized', 401)
  const shows = database.collection('shows')
  const method = request.method
  const parts = route.split('/').filter(Boolean)

  if (route === '/invitations' && method === 'GET') {
    if (user.role !== 'crew') return error('Crew account required', 403)
    const records = await shows.find({ 'staffing.invitations.crewUserId': user.id }, { projection: { _id: 0 } }).toArray()
    const invitations = records.flatMap((show) => (show.staffing || []).flatMap((row) => (row.invitations || [])
      .filter((invite) => invite.crewUserId === user.id).map((invite) => crewView(show, row, invite))))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return reply({ invitations })
  }

  if (parts[0] === 'shows' && parts[2] === 'staffing' && parts.length === 5 && ['invitations', 'crew'].includes(parts[4])) {
    if (user.role !== 'company') return error('Company account required', 403)
    const company = await ownedCompany(database, user)
    if (!company) return error('Create a company profile first', 400)
    const scope = { id: parts[1], companyId: company.id, userId: user.id }
    const show = await shows.findOne(scope)
    const row = staffingRow(show, parts[3])
    if (!show || !row) return error('Show or staffing row not found', 404)
    if (parts[4] === 'invitations' && method === 'GET') return reply(roster(row))

    if (parts[4] === 'crew' && method === 'GET') {
      const query = request.nextUrl.searchParams.get('q')?.trim() || ''
      if (query.length > 100) return error('Search must be 100 characters or fewer', 400)
      const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const filter = query ? { $or: ['fullName', 'city', 'state', 'skills', 'certs.name'].map((field) => ({ [field]: { $regex: literal, $options: 'i' } })) } : {}
      const crew = await database.collection('crew_profiles').aggregate([
        { $match: filter },
        { $lookup: { from: 'users', let: { uid: '$userId' }, pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$id', '$$uid'] }, { $eq: ['$role', 'crew'] }] } } },
          { $project: { _id: 0, id: 1 } },
        ], as: 'account' } },
        { $match: { 'account.0': { $exists: true } } },
        { $sort: { fullName: 1, id: 1 } }, { $limit: 31 },
        { $project: { _id: 0, id: 1, fullName: 1, city: 1, state: 1, skills: 1, available: 1, dayRate: 1, certifications: { $map: { input: { $ifNull: ['$certs', []] }, as: 'cert', in: '$$cert.name' } } } },
      ]).toArray()
      return reply({ crew: crew.slice(0, 30), hasMore: crew.length > 30 })
    }

    if (parts[4] === 'invitations' && method === 'POST') {
      const input = await parseBody(request, inviteInput)
      if (!input.success) return error('A valid crewId is required', 400)
      if (CLOSED_SHOW.includes(show.status)) return error('This show is closed to invitations', 409)
      const crew = await database.collection('crew_profiles').findOne({ id: input.data.crewId }, { projection: { id: 1, userId: 1, fullName: 1 } })
      const account = crew?.userId && await database.collection('users').findOne({ id: crew.userId, role: 'crew' }, { projection: { id: 1 } })
      if (!crew || !account) return error('Crew must have a registered crew account', 400)
      const invitation = { id: uuidv4(), crewId: crew.id, crewUserId: crew.userId, crewName: crew.fullName || 'Crew member', companyName: company.name || 'Company', status: 'invited', createdAt: new Date(), updatedAt: new Date() }
      const updated = await shows.findOneAndUpdate({
        ...scope, status: { $nin: CLOSED_SHOW },
        staffing: { $elemMatch: { id: row.id, 'invitations.499': { $exists: false }, invitations: { $not: { $elemMatch: { crewUserId: crew.userId, status: { $in: ACTIVE } } } } } },
        $expr: capacityAvailable(row.id),
      }, {
        $push: { 'staffing.$.invitations': invitation }, $set: { updatedAt: new Date() },
      }, { returnDocument: 'after' })
      if (!updated) return error('Crew already invited/assigned, staffing is full, or this row reached its 500-invitation history limit. Refresh to see current status.', 409)
      return reply({ invitation, ...roster(staffingRow(updated, row.id)) }, 201)
    }
    return error('Invitation route or method not supported', 404)
  }

  if (parts[0] === 'invitations' && parts.length === 3 && method === 'POST' && ['respond', 'cancel'].includes(parts[2])) {
    const cancelling = parts[2] === 'cancel'
    if (user.role !== (cancelling ? 'company' : 'crew')) return error(cancelling ? 'Company account required' : 'Crew account required', 403)
    let scope = {}
    if (cancelling) {
      const company = await ownedCompany(database, user)
      if (!company) return error('Create a company profile first', 400)
      scope = { userId: user.id, companyId: company.id }
    }
    const inviteFilter = { id: parts[1], ...(cancelling ? {} : { crewUserId: user.id }) }
    const show = await shows.findOne({ ...scope, staffing: { $elemMatch: { invitations: { $elemMatch: inviteFilter } } } })
    const row = invitationRow(show, parts[1])
    const invitation = invitationFrom(show, parts[1])
    if (!show || !row || !invitation) return error('Invitation not found', 404)
    let status = 'cancelled'
    let inputData = null
    if (!cancelling) {
      const input = await parseBody(request, responseInput)
      if (!input.success) return error('Status must be accepted or declined', 400)
      status = input.data.status
      inputData = input.data
    }
    if (invitation.status === status) return reply({ invitation: cancelling ? invitation : crewView(show, row, invitation), ...(!cancelling ? {} : roster(row)) })
    if (!(cancelling ? ACTIVE : ['invited']).includes(invitation.status)) return error('This invitation can no longer be changed', 409)
    if (status === 'accepted' && CLOSED_SHOW.includes(show.status)) return error('This show is closed to assignments', 409)
    const allowedStatuses = cancelling ? ACTIVE : ['invited']
    const now = new Date()
    const updateFields = {
      'staffing.$[row].invitations.$[invite].status': status,
      'staffing.$[row].invitations.$[invite].updatedAt': now,
      [`staffing.$[row].invitations.$[invite].${cancelling ? 'cancelledAt' : 'respondedAt'}`]: now,
      updatedAt: now,
    }
    if (inputData?.declineReason) {
      updateFields['staffing.$[row].invitations.$[invite].declineReason'] = inputData.declineReason
    }
    if (inputData?.declineNote) {
      updateFields['staffing.$[row].invitations.$[invite].declineNote'] = inputData.declineNote
    }

    const updated = await shows.findOneAndUpdate({
      ...scope, id: show.id,
      staffing: { $elemMatch: { id: row.id, invitations: { $elemMatch: { ...inviteFilter, status: { $in: allowedStatuses } } } } },
      ...(status === 'accepted' ? { status: { $nin: CLOSED_SHOW }, $expr: capacityAvailable(row.id) } : {}),
    }, { $set: updateFields }, {
      arrayFilters: [{ 'row.id': row.id }, { 'invite.id': invitation.id, 'invite.status': { $in: allowedStatuses } }],
      returnDocument: 'after',
    })
    if (!updated) return error('Status changed or the staffing row is full. Refresh and try again.', 409)

    // Trigger notification
    if (cancelling && invitation.crewUserId) {
      await createNotification(database, {
        userId: invitation.crewUserId,
        title: 'Assignment Cancelled',
        message: `Your invitation/assignment for ${show.title} (${row.roleTitle}) was cancelled by ${company.name || 'the production company'}.`,
        type: 'cancellation',
        link: '/invitations',
      })
    } else if (!cancelling && show.userId) {
      await createNotification(database, {
        userId: show.userId,
        title: `Crew ${status === 'accepted' ? 'Accepted' : 'Declined'}`,
        message: `${invitation.crewName || 'A crew member'} ${status} ${row.roleTitle} on ${show.title}${inputData?.declineReason ? ' (' + inputData.declineReason + ')' : ''}.`,
        type: 'invitation_update',
        link: '/shows',
      })
    }

    const saved = invitationFrom(updated, invitation.id)
    return reply({ invitation: cancelling ? saved : crewView(updated, staffingRow(updated, row.id), saved), ...(cancelling ? roster(staffingRow(updated, row.id)) : {}) })
  }
  return error('Invitation route or method not supported', 404)
}
