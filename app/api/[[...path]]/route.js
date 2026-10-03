import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import twilio from 'twilio'
import { Resend } from 'resend'
import bcrypt from 'bcryptjs'
import { handleShowsRequest } from '@/lib/shows'
import { handleShowInvitations } from '@/lib/show-invitations'
import { handleTimesheets } from '@/lib/timesheets'
import { handleMasterAdmin } from '@/lib/master-admin'
import { showCalendarEvents } from '@/lib/show-calendar'
import { readLocation, normalizeState } from '@/lib/us-locations'
import { getInMemoryDatabase } from '@/lib/in-memory-db'
import { ensureTestAccountsSeeded } from '@/lib/test-fixtures'
import {
  getCompanyTeam,
  checkCompanyPermission,
  getPreviousCrew,
  generateShowSummary,
  exportShowStaffingCsv,
  exportCrewTimesheetsCsv,
  canReviewCrew,
  addCrewReview,
  createNotification,
  DOCUMENT_CATEGORIES,
} from '@/lib/company-features'

// ---------------- MongoDB ----------------
let clientPromise
let isMemoryFallback = false
let memorySeedPromise = null

async function initMemoryDb(memDb) {
  if (!memorySeedPromise) {
    memorySeedPromise = (async () => {
      try {
        await seedIfEmpty(memDb)
        await seedServices(memDb)
        await ensureSeedCerts(memDb)
        await ensureTestAccountsSeeded(memDb)
      } catch (e) {
        console.warn('[AI Studio] Initial memory seed note:', e?.message)
      }
    })()
  }
  await memorySeedPromise
  return memDb
}

async function connectToMongo() {
  if (isMemoryFallback || !process.env.MONGO_URL) {
    const memDb = getInMemoryDatabase(process.env.DB_NAME || 'lantix')
    return await initMemoryDb(memDb)
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const c = new MongoClient(process.env.MONGO_URL, {
          serverSelectionTimeoutMS: 2000,
          connectTimeoutMS: 2000,
        })
        await c.connect()
        return c
      } catch (err) {
        console.warn('[AI Studio] MongoDB connection failed — falling back to in-memory store:', err?.message)
        isMemoryFallback = true
        return null
      }
    })()
  }

  const c = await clientPromise
  if (!c || isMemoryFallback) {
    const memDb = getInMemoryDatabase(process.env.DB_NAME || 'lantix')
    return await initMemoryDb(memDb)
  }
  const realDb = c.db(process.env.DB_NAME || 'lantix')
  await ensureTestAccountsSeeded(realDb).catch(() => {})
  return realDb
}

// ---------------- Integration flags ----------------
// Stripe key resolution:
//   STRIPE_SECRET_KEY (your own sk_test_/sk_live_ key)  -> DIRECT mode via official SDK
//   STRIPE_API_KEY containing 'sk_test_emergent'         -> Emergent-managed claimable SANDBOX (routed via Emergent Stripe proxy)
//   nothing                                              -> DEMO mode (no real checkout)
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || ''
const STRIPE_SANDBOX = STRIPE_KEY.includes('sk_test_emergent')
// Accepts standard secret keys (sk_) and restricted keys (rk_)
const STRIPE_DIRECT = !STRIPE_SANDBOX && /^(sk|rk)_(live|test)_/.test(STRIPE_KEY) && STRIPE_KEY.length > 20
const STRIPE_LIVE = STRIPE_DIRECT || STRIPE_SANDBOX
const STRIPE_MODE = STRIPE_DIRECT ? (/^(sk|rk)_live_/.test(STRIPE_KEY) ? 'live' : 'test') : (STRIPE_SANDBOX ? 'sandbox' : 'demo')
const stripe = STRIPE_DIRECT ? new Stripe(STRIPE_KEY) : null
const STRIPE_PROXY_BASE = `${(process.env.INTEGRATION_PROXY_URL || 'https://integrations.emergentagent.com').replace(/\/$/, '')}/stripe/v1`
const SUBSCRIPTION_PRICE_CENTS = 30000
const TRIAL_DAYS = 14

// Encode nested params the way Stripe's form API expects (a[b][0][c]=v)
function encodeForm(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') encodeForm(item, `${key}[${i}]`, out)
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(item)}`)
      })
    } else if (typeof v === 'object') encodeForm(v, key, out)
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
  }
  return out
}

// Minimal Stripe REST client for the Emergent-managed sandbox proxy
async function stripeProxy(method, path, params) {
  const qs = method === 'GET' && params ? `?${encodeForm(params).join('&')}` : ''
  const res = await fetch(`${STRIPE_PROXY_BASE}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${STRIPE_KEY}:`).toString('base64')}`,
      ...(method !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method !== 'GET' && params ? encodeForm(params).join('&') : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { error: { message: text.slice(0, 200) } } }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe proxy error ${res.status}`)
    err.code = data?.error?.code || ''
    err.status = res.status
    throw err
  }
  return data
}

// The managed sandbox proxy is load-balanced across several sandbox accounts, so a
// freshly created session may not be found on the first read. Retry on resource_missing.
async function stripeProxyRetrieveSession(sessionId, attempts = 15) {
  let last
  for (let i = 0; i < attempts; i++) {
    try { return await stripeProxy('GET', `/checkout/sessions/${sessionId}`) }
    catch (e) {
      last = e
      if (e.status !== 404 && e.code !== 'resource_missing') throw e
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  throw last
}

const TW_SID = process.env.TWILIO_ACCOUNT_SID || ''
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''
const TW_API_KEY = process.env.TWILIO_API_KEY_SID || ''
const TW_API_SECRET = process.env.TWILIO_API_KEY_SECRET || ''
const TW_FROM = process.env.TWILIO_FROM_PHONE || ''
const TW_MSG_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || ''
const TW_HAS_APIKEY = TW_API_KEY.startsWith('SK') && TW_API_SECRET.length > 10
const TW_HAS_TOKEN = TW_TOKEN.length > 10
const TW_HAS_SENDER = TW_FROM.startsWith('+') || TW_MSG_SID.startsWith('MG')
const TWILIO_LIVE = TW_SID.startsWith('AC') && (TW_HAS_APIKEY || TW_HAS_TOKEN) && TW_HAS_SENDER
const twClient = TWILIO_LIVE
  ? (TW_HAS_APIKEY ? twilio(TW_API_KEY, TW_API_SECRET, { accountSid: TW_SID }) : twilio(TW_SID, TW_TOKEN))
  : null

const EMERGENT_AUTH_BASE = process.env.EMERGENT_AUTH_BASE || 'https://demobackend.emergentagent.com'
const APP_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

// ---------------- Email (Resend) ----------------
const RESEND_KEY = process.env.RESEND_API_KEY || ''
const EMAIL_FROM = process.env.EMAIL_FROM || 'LANTIX Pro <onboarding@resend.dev>'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''
const CRON_SECRET = process.env.CRON_SECRET || ''
const EMAIL_LIVE = RESEND_KEY.startsWith('re_') && !!ADMIN_EMAIL
const resend = EMAIL_LIVE ? new Resend(RESEND_KEY) : null
const ADMIN_CODE = process.env.ADMIN_CODE || ''
const normCode = (c) => String(c || '').trim().toLowerCase()
const ADMIN_CODE_N = normCode(ADMIN_CODE)

function esc(v = '') { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function digestHtml(crew, expiring, today) {
  const rows = crew.map((c) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #eee">${esc(c.fullName)}</td>
      <td style="padding:6px 8px;border:1px solid #eee">${esc(c.primaryCategory || '')}</td>
      <td style="padding:6px 8px;border:1px solid #eee">${esc((c.skills || []).join(', '))}</td>
      <td style="padding:6px 8px;border:1px solid #eee">${esc(c.city || '')}, MA</td>
      <td style="padding:6px 8px;border:1px solid #eee">$${c.dayRate || 0}</td>
      <td style="padding:6px 8px;border:1px solid #eee">${c.available ? 'Yes' : 'No'}</td>
      <td style="padding:6px 8px;border:1px solid #eee">${c.unionMember ? 'Union' : '—'}</td>
      <td style="padding:6px 8px;border:1px solid #eee">${esc((c.certs || []).map((x) => x.name).join(', '))}</td>
    </tr>`).join('')
  const expBlock = expiring.length ? `
    <div style="margin:16px 0;padding:12px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
      <strong style="color:#b45309">⚠ ${expiring.length} certification(s) expiring within 30 days</strong>
      <ul style="margin:8px 0 0 0;padding-left:18px;color:#92400e">
        ${expiring.map((e) => `<li>${esc(e.name)} — ${esc(e.cert)} expires ${esc(e.expiry)}</li>`).join('')}
      </ul>
    </div>` : ''
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <div style="max-width:760px;margin:0 auto">
      <h2 style="color:#6d28d9">LANTIX Pro — Daily Crew Master List</h2>
      <p style="color:#71717a">${today} · ${crew.length} crew on file</p>
      ${expBlock}
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr style="background:#f4f4f5">
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Name</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Category</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Skills</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left">City</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left">10hr</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Avail</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Union</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Certs</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#a1a1aa;font-size:12px;margin-top:16px">Sent by LANTIX Pro · Massachusetts</p>
    </div>
  </body></html>`
}

async function sendEmail({ to, subject, html }) {
  const recipient = to || ADMIN_EMAIL
  if (!EMAIL_LIVE) return { demo: true }
  const { data, error } = await resend.emails.send({ from: EMAIL_FROM, to: [recipient], subject, html })
  if (error) throw new Error(error.message || JSON.stringify(error))
  return { id: data?.id }
}

async function runEmailJob(database, { force = false } = {}) {
  const crew = await database.collection('crew_profiles').find({}).sort({ fullName: 1 }).limit(1000).toArray()
  const today = new Date().toISOString().slice(0, 10)
  const log = database.collection('email_job_log')
  const key = `digest:${today}`
  if (!force) { const done = await log.findOne({ key }); if (done) return { skipped: true, reason: 'Digest already sent today', to: ADMIN_EMAIL } }
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const expiring = []
  for (const c of crew) { for (const ct of (c.certs || [])) { if (ct.expiry && ct.expiry >= today && ct.expiry <= soon) expiring.push({ name: c.fullName, cert: ct.name, expiry: ct.expiry }) } }
  const subject = `LANTIX Pro — Daily Crew Master List (${crew.length} crew) · ${today}`
  const html = digestHtml(crew, expiring, today)
  const settings = await database.collection('settings').findOne({ key: 'digest' })
  const recipients = Array.from(new Set([ADMIN_EMAIL, ...((settings?.recipients) || [])].filter(Boolean)))
  let sentTo = []
  let demo = false
  for (const r of recipients) {
    const res = await sendEmail({ to: r, subject, html })
    if (res?.demo) demo = true
    sentTo.push(r)
  }
  await log.insertOne({ id: uuidv4(), key: force ? `${key}:${Date.now()}` : key, type: 'daily_digest', crewCount: crew.length, expiringCount: expiring.length, recipients: sentTo, demo, sentAt: new Date() })
  return { sent: true, crewCount: crew.length, expiringCount: expiring.length, demo, recipients: sentTo }
}

// ---------------- CORS ----------------
function handleCORS(response, request) {
  const origin = request.headers.get('origin')
  const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',')
    .map((value) => value.trim())
    .filter((value) => value && value !== '*' && value !== 'null')

  response.headers.append('Vary', 'Origin')
  // Same-origin requests need no CORS headers. Only explicit origins may use credentials.
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Code')
  }
  return response
}
export async function OPTIONS(request) {
  return handleCORS(new NextResponse(null, { status: 200 }), request)
}

function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

const clean = (doc) => {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return rest
}

// ---------------- Auth helpers ----------------
async function getUser(request) {
  const token = request.cookies.get('lantix_session')?.value
  if (!token) return null
  const database = await connectToMongo()
  const session = await database.collection('sessions').findOne({ session_token: token })
  if (!session) return null
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) return null
  const user = await database.collection('users').findOne({ id: session.userId })
  return user && !user.suspended ? user : null
}

function setSessionCookie(response, token) {
  response.cookies.set('lantix_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}

async function createSession(database, userId) {
  const token = uuidv4() + uuidv4()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await database.collection('sessions').insertOne({ session_token: token, userId, expiresAt, createdAt: new Date() })
  return token
}

async function companyForUser(database, userId) {
  const co = await database.collection('companies').findOne({ userId })
  return applyBillingExpiry(database, co)
}

// If a plan was scheduled to cancel and its paid period has ended, downgrade lazily
// (no cron needed). Applies in all Stripe modes.
async function applyBillingExpiry(database, co) {
  if (!co) return co
  const end = co.currentPeriodEnd || co.trialEndsAt
  if (co.cancelAtPeriodEnd && co.paidVerified && end && new Date(end) < new Date()) {
    const set = { paidVerified: false, subscriptionStatus: 'canceled', canceledAt: co.canceledAt || new Date(), updatedAt: new Date() }
    await database.collection('companies').updateOne({ id: co.id }, { $set: set })
    return { ...co, ...set }
  }
  return co
}
async function crewForUser(database, userId) {
  return database.collection('crew_profiles').findOne({ userId })
}

// ---------------- SMS ----------------
// Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns '' if it cannot be normalized.
function normalizePhone(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (s.startsWith('+')) {
    const d = s.replace(/[^\d]/g, '')
    return d.length >= 11 ? `+${d}` : ''
  }
  const d = s.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return ''
}

// A2P consent gate: crew members must have opted in (smsConsent=true) on their profile
// before we text them. Company phone numbers (transactional booking alerts) and explicit
// admin test sends (opts.skipConsent) are not gated.
async function crewConsentFor(database, to, meta) {
  let crew = null
  if (meta.crewId) crew = await database.collection('crew_profiles').findOne({ id: meta.crewId })
  if (!crew) {
    const digits = String(to || '').replace(/\D/g, '').slice(-10)
    if (digits.length === 10) crew = await database.collection('crew_profiles').findOne({ cell: { $regex: `${digits}$` } })
  }
  if (!crew) return { isCrew: false, consent: true }
  return { isCrew: true, consent: crew.smsConsent === true, crewId: crew.id }
}

async function sendSms(database, rawTo, body, meta = {}, opts = {}) {
  const to = normalizePhone(rawTo)
  let status = 'demo'
  let sid = null
  let error = null
  if (!to) {
    status = 'skipped'
    error = 'Invalid or missing phone number'
  } else if (!opts.skipConsent) {
    const gate = await crewConsentFor(database, to, meta)
    if (gate.isCrew && !gate.consent) {
      status = 'skipped_no_consent'
      error = 'Crew member has not opted in to SMS'
      if (gate.crewId && !meta.crewId) meta = { ...meta, crewId: gate.crewId }
    }
  }
  if (status !== 'skipped' && status !== 'skipped_no_consent' && TWILIO_LIVE) {
    try {
      const params = { body, to }
      if (TW_MSG_SID.startsWith('MG')) params.messagingServiceSid = TW_MSG_SID
      else params.from = TW_FROM
      const msg = await twClient.messages.create(params)
      status = 'sent'
      sid = msg.sid
    } catch (e) {
      status = 'failed'
      error = e.message
    }
  }
  await database.collection('sms_log').insertOne({
    id: uuidv4(), to: to || String(rawTo || ''), body, status, sid, error, ...meta, createdAt: new Date(),
  })
  return { status, sid, error }
}

// ---------------- Matching ----------------
async function matchCrew(database, job) {
  const query = { available: true, city: job.city, ...(normalizeState(job.state) ? { state: normalizeState(job.state) } : {}) }
  const wanted = (job.skills && job.skills.length) ? job.skills : (job.role ? [job.role] : [])
  if (wanted.length) query.skills = { $in: wanted }
  if (job.union === true) query.unionMember = true
  return database.collection('crew_profiles').find(query).limit(200).toArray()
}

// ---------------- Seed ----------------
async function seedIfEmpty(database) {
  const count = await database.collection('crew_profiles').countDocuments({ seed: true })
  if (count > 0) return
  const cities = ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell', 'Somerville', 'Framingham', 'Quincy']
  const allSkills = {
    Audio: ['FOH Engineer', 'Monitor Engineer', 'A1', 'A2', 'RF Tech', 'System Tech'],
    Lighting: ['Lighting Designer', 'Lighting Board Op', 'Electrician', 'Follow Spot'],
    Video: ['Video Engineer', 'Camera Op', 'Media Server Op', 'LED Tech'],
    Rigging: ['Head Rigger', 'Ground Rigger', 'Rigger'],
    Stage: ['Stagehand', 'Deck Hand', 'Loader', 'Carpenter'],
    Backline: ['Backline Tech', 'Guitar Tech', 'Drum Tech'],
  }
  const names = [
    ['Marcus Reilly', 'men', 32], ['Diana Chen', 'women', 44], ['Tyrell Jackson', 'men', 12],
    ['Sofia Alvarez', 'women', 68], ['Liam OConnor', 'men', 45], ['Priya Nair', 'women', 21],
    ['Andre Dubois', 'men', 51], ['Rachel Kim', 'women', 33], ['Devon Brooks', 'men', 76],
    ['Elena Rossi', 'women', 9], ['Jamal Carter', 'men', 3], ['Nora Sullivan', 'women', 52],
    ['Victor Popov', 'men', 61], ['Amara Okafor', 'women', 12], ['Wyatt Hughes', 'men', 22],
  ]
  const skillsPools = Object.values(allSkills)
  const catKeys = Object.keys(allSkills)
  const crewDocs = names.map((n, i) => {
    const pool = skillsPools[i % skillsPools.length]
    const skills = pool.slice(0, 2 + (i % 3))
    const cat = catKeys[i % 6]
    return {
      id: uuidv4(),
      userId: 'seed-' + i,
      seed: true,
      fullName: n[0],
      photo: `https://randomuser.me/api/portraits/${n[1]}/${n[2]}.jpg`,
      cell: `+1617555${String(1000 + i).slice(-4)}`,
      email: n[0].toLowerCase().replace(/[^a-z]/g, '.') + '@crew.io',
      skills,
      primaryCategory: cat,
      dayRate: 350 + (i % 7) * 50,
      city: cities[i % cities.length],
      state: 'MA',
      available: i % 4 !== 0,
      unionMember: i % 3 === 0,
      bio: `Experienced ${skills[0]} with 8+ years on tours, festivals and corporate events across New England.`,
      ratingAvg: +(4 + (i % 10) / 10).toFixed(1),
      ratingCount: 3 + (i % 12),
      createdAt: new Date(),
    }
  })
  await database.collection('crew_profiles').insertMany(crewDocs)

  const companyNames = [
    ['Bay State Live', 'Production House'], ['Harbor Sound & Stage', 'Production House'],
    ['Worcester Palladium', 'Venue'], ['Emerald City Lights', 'Production House'],
    ['Charles River Events', 'Promoter'], ['Granite State AV', 'Production House'],
    ['The Roxy Boston', 'Venue'], ['North Shore Rigging', 'Production House'],
    ['Fenway Concerts', 'Promoter'], ['MassPro Staging', 'Production House'],
  ]
  const companyDocs = companyNames.map((c, i) => ({
    id: uuidv4(),
    userId: 'seed-co-' + i,
    seed: true,
    name: c[0],
    companyType: c[1],
    logo: `https://ui-avatars.com/api/?name=${encodeURIComponent(c[0])}&background=6d28d9&color=fff&bold=true`,
    phone: `+1617555${String(2000 + i).slice(-4)}`,
    email: 'booking@' + c[0].toLowerCase().replace(/[^a-z]/g, '') + '.com',
    website: 'https://' + c[0].toLowerCase().replace(/[^a-z]/g, '') + '.com',
    city: cities[i % cities.length],
    state: 'MA',
    description: `${c[1]} serving Massachusetts live events. Concerts, festivals, corporate and theatrical.`,
    paidVerified: i % 2 === 0,
    subscriptionStatus: i % 2 === 0 ? 'active' : 'none',
    createdAt: new Date(),
  }))
  await database.collection('companies').insertMany(companyDocs)

  const jobRoles = ['FOH Engineer', 'Monitor Engineer', 'Stagehand', 'LED Tech', 'Rigger', 'Lighting Board Op']
  const jobDocs = jobRoles.map((r, i) => ({
    id: uuidv4(),
    userId: 'seed-co-' + i,
    seed: true,
    companyName: companyNames[i][0],
    companyType: companyNames[i][1],
    role: r,
    skills: [r],
    crewCount: 1 + (i % 4),
    date: new Date(Date.now() + (3 + i) * 86400000).toISOString().slice(0, 10),
    city: cities[i % cities.length],
    state: 'MA',
    callTime: ['08:00', '10:00', '14:00', '16:00'][i % 4],
    dayRate: 400 + (i % 5) * 50,
    union: i % 2 === 0,
    description: `${r} needed for a ${['concert', 'festival', 'corporate gala', 'theater run'][i % 4]}. 10hr call.`,
    status: 'open',
    createdAt: new Date(),
  }))
  await database.collection('jobs').insertMany(jobDocs)

  await database.collection('rfps').insertMany([
    {
      id: uuidv4(), userId: 'seed-co-0', seed: true, companyName: 'Bay State Live',
      title: 'Full audio crew + stagehands for 3-day festival',
      description: 'Need full audio crew + stagehands for 3-day festival in Worcester (Aug 15-17). Send quote including labor + basic PA.',
      city: 'Worcester', date: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
      budget: 45000, status: 'open', createdAt: new Date(),
    },
    {
      id: uuidv4(), userId: 'seed-co-4', seed: true, companyName: 'Charles River Events',
      title: 'Corporate gala lighting + video package',
      description: 'Seeking a production house to provide lighting design, LED wall and video crew for a 600-person corporate gala in Boston.',
      city: 'Boston', date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      budget: 28000, status: 'open', createdAt: new Date(),
    },
  ])
}

// ---------------- Seed services ----------------
async function seedServices(database) {
  const count = await database.collection('services').countDocuments({ seed: true })
  if (count > 0) return
  const rows = [
    ['Encore Catering Co.', 'Catering', 'Boston', 'Full-service crew catering & green room hospitality for events of any size.'],
    ['Green Room Eats', 'Catering', 'Worcester', 'Hot meals & craft services delivered to load-in. Dietary options available.'],
    ['BlackCar Boston', 'Transportation (Car Service)', 'Boston', '24/7 black car & sprinter van service for talent and crew transport.'],
    ['Bay State Shuttle', 'Transportation (Car Service)', 'Cambridge', 'Crew shuttles, cargo vans and box trucks for gear moves.'],
    ['Backstage Travel', 'Travel', 'Boston', 'Tour & event travel booking: flights, hotels, per diem management.'],
    ['Marquee Legal Group', 'Legal (Entertainment Law)', 'Boston', 'Entertainment lawyers: contracts, riders, licensing, union compliance.'],
    ['Spotlight Talent Agency', 'Talent Agency (Actors)', 'Boston', 'Actors, hosts, dancers and specialty performers for live productions.'],
    ['Glam On Call', 'Makeup Artist', 'Boston', 'On-site makeup & hair for talent, hosts and camera-ready crew. Fast booking.'],
    ['Bright Faces MUA', 'Makeup Artist', 'Somerville', 'HD/stage makeup artists available same-day across Greater Boston.'],
    ['Hands That Speak', 'ADA — Signers (ASL)', 'Boston', 'Certified ASL interpreters for concerts, conferences and theater.'],
    ['SignAccess MA', 'ADA — Signers (ASL)', 'Worcester', 'Stage-side and platform ASL interpreting teams, statewide coverage.'],
    ['GlobalVoice Translators', 'ADA — Translators', 'Boston', 'Live translation & captioning in 20+ languages for events.'],
  ]
  await database.collection('services').insertMany(rows.map((r) => ({
    id: uuidv4(), seed: true, userId: 'seed-svc', name: r[0], category: r[1], city: r[2],
    state: 'MA', phone: '+16175559' + String(100 + Math.floor(Math.random() * 800)),
    email: 'hello@' + r[0].toLowerCase().replace(/[^a-z]/g, '') + '.com',
    website: 'https://' + r[0].toLowerCase().replace(/[^a-z]/g, '') + '.com',
    description: r[3], createdAt: new Date(),
  })))
}

// ---------------- Ensure seed certs (for demo badges) ----------------
async function ensureSeedCerts(database) {
  const missing = await database.collection('crew_profiles').find({ seed: true, certs: { $exists: false } }).limit(200).toArray()
  if (!missing.length) return
  const soon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)
  const map = { Rigging: ['Rigger Cert', 'ETCP'], Stage: ['OSHA', 'Forklift'], Audio: ['OSHA'], Lighting: ['OSHA'], Video: ['OSHA'], Backline: ['OSHA'] }
  for (let i = 0; i < missing.length; i++) {
    const c = missing[i]
    const names = map[c.primaryCategory] || ['OSHA']
    const certs = names.map((n, idx) => ({ name: n, expiry: (i % 3 === 0 && idx === 0) ? soon : '', file: '', fileType: '', fileName: '' }))
    await database.collection('crew_profiles').updateOne({ id: c.id }, { $set: { certs } })
  }
}

// ---------------- Stripe sync ----------------
async function syncSubscription(database, subscription, userId) {
  const status = subscription.status
  const filter = userId ? { userId } : { stripeSubscriptionId: subscription.id }
  await database.collection('companies').updateOne(filter, {
    $set: {
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      paidVerified: status === 'active' || status === 'trialing',
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
      updatedAt: new Date(),
    },
  })
}

// ---------------- Router ----------------
async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method
  if (route === '/auth/dev-login' && process.env.NODE_ENV === 'production') {
    return json({ error: 'Not found' }, 404)
  }
  const database = await connectToMongo()

  try {
    if (route === '/master-admin' || route.startsWith('/master-admin/')) return await handleMasterAdmin(request, { database, route })
    if (route === '/' && method === 'GET') return json({ ok: true, service: 'LANTIX Pro', stripeLive: STRIPE_LIVE, stripeMode: STRIPE_MODE, twilioLive: TWILIO_LIVE })

    if (route === '/seed' && method === 'POST') {
      await seedIfEmpty(database)
      await seedServices(database)
      await ensureSeedCerts(database)
      await ensureTestAccountsSeeded(database)
      return json({ ok: true })
    }

    // ================= EMAIL DIGEST =================
    if (route === '/cron/email' && (method === 'POST' || method === 'GET')) {
      const auth = request.headers.get('authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : (request.headers.get('x-cron-secret') || '')
      if (!CRON_SECRET || token !== CRON_SECRET) return json({ error: 'Unauthorized' }, 401)
      const body = method === 'POST' ? await request.json().catch(() => ({})) : {}
      const result = await runEmailJob(database, { force: !!body.force })
      return json({ ok: true, result })
    }

    if (route === '/email/send-now' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const result = await runEmailJob(database, { force: true })
      return json({ ok: true, result })
    }

    if (route === '/email/status' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const last = await database.collection('email_job_log').find({}).sort({ sentAt: -1 }).limit(1).toArray()
      return json({ emailLive: EMAIL_LIVE, adminEmail: ADMIN_EMAIL, from: EMAIL_FROM, last: last[0] ? clean(last[0]) : null })
    }

    // ================= ADMIN (special code) =================
    if (route === '/admin/verify' && method === 'POST') {
      const { code } = await request.json()
      return json({ ok: !!ADMIN_CODE_N && !!code && normCode(code) === ADMIN_CODE_N })
    }

    const adminCode = request.headers.get('x-admin-code') || ''
    const isAdmin = !!ADMIN_CODE_N && !!adminCode && normCode(adminCode) === ADMIN_CODE_N

    if (route === '/admin/master' && method === 'GET') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const crew = await database.collection('crew_profiles').find({}).sort({ fullName: 1 }).limit(1000).toArray()
      const registeredUsers = await database.collection('users').countDocuments({})
      const active = crew.filter((c) => c.available).length
      const bookedOff = crew.filter((c) => !c.available).length
      const settings = await database.collection('settings').findOne({ key: 'digest' })
      const last = await database.collection('email_job_log').find({}).sort({ sentAt: -1 }).limit(1).toArray()
      return json({
        crew: crew.map(clean),
        stats: { registered: registeredUsers, crewCount: crew.length, active, bookedOff },
        recipients: settings?.recipients || [],
        lastDigest: last[0] ? clean(last[0]) : null,
        emailLive: EMAIL_LIVE,
      })
    }

    // Full user directory (crew + companies) with complete contact details — owner only
    if (route === '/admin/users' && method === 'GET') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const q = (request.nextUrl.searchParams.get('q') || '').toLowerCase().trim()
      const typeFilter = request.nextUrl.searchParams.get('type') || 'all'
      const accounts = await database.collection('users').find({}).toArray()
      const acctByUserId = {}
      accounts.forEach((a) => { acctByUserId[a.id] = a })
      const crew = await database.collection('crew_profiles').find({}).sort({ fullName: 1 }).limit(2000).toArray()
      const companies = await database.collection('companies').find({}).sort({ name: 1 }).limit(2000).toArray()
      const crewUsers = crew.map((c) => {
        const acct = acctByUserId[c.userId]
        return {
          type: 'crew', id: c.id, userId: c.userId,
          name: c.fullName, photo: c.photo,
          email: c.email || acct?.email || '', phone: c.cell || '',
          city: c.city, state: c.state,
          role: c.primaryCategory, skills: c.skills || [],
          dayRate: c.dayRate, available: c.available, unionMember: c.unionMember, bio: c.bio || '',
          certs: (c.certs || []).map((x) => x.name),
          hasAccount: !!acct, accountEmail: acct?.email || '', authProvider: acct?.provider || (acct ? 'email' : ''),
          seed: !!c.seed, createdAt: c.createdAt,
        }
      })
      const companyUsers = companies.map((co) => {
        const acct = acctByUserId[co.userId]
        return {
          type: 'company', id: co.id, userId: co.userId,
          name: co.name, photo: co.logo,
          email: co.email || acct?.email || '', phone: co.phone || '',
          city: co.city, state: co.state,
          role: co.companyType, website: co.website || '', description: co.description || '',
          subscriptionStatus: co.subscriptionStatus || 'none', paidVerified: !!co.paidVerified,
          hasAccount: !!acct, accountEmail: acct?.email || '', authProvider: acct?.provider || (acct ? 'email' : ''),
          seed: !!co.seed, createdAt: co.createdAt,
        }
      })
      let all = [...crewUsers, ...companyUsers]
      if (typeFilter === 'crew') all = crewUsers
      else if (typeFilter === 'company') all = companyUsers
      if (q) all = all.filter((u) => [u.name, u.email, u.phone, u.city, u.role, ...(u.skills || [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      all.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      return json({
        users: all,
        stats: {
          total: crewUsers.length + companyUsers.length,
          crew: crewUsers.length,
          companies: companyUsers.length,
          accounts: accounts.length,
          subscribed: companyUsers.filter((c) => c.subscriptionStatus === 'active').length,
        },
      })
    }

    if (route.match(/^\/admin\/member\/[^/]+$/) && method === 'POST') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const id = route.split('/')[3]
      const b = await request.json()
      const set = {}
      if (b.fullName !== undefined) set.fullName = b.fullName
      if (b.dayRate !== undefined) set.dayRate = Number(b.dayRate) || 0
      if (b.city !== undefined) set.city = b.city
      if (b.available !== undefined) set.available = !!b.available
      if (b.unionMember !== undefined) set.unionMember = !!b.unionMember
      if (b.skills !== undefined) set.skills = b.skills
      await database.collection('crew_profiles').updateOne({ id }, { $set: set })
      const saved = await database.collection('crew_profiles').findOne({ id })
      return json({ ok: true, crew: clean(saved) })
    }

    if (route.match(/^\/admin\/member\/[^/]+$/) && method === 'DELETE') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const id = route.split('/')[3]
      const crew = await database.collection('crew_profiles').findOne({ id })
      await database.collection('crew_profiles').deleteOne({ id })
      if (crew?.userId) {
        await database.collection('applications').deleteMany({ crewUserId: crew.userId })
        await database.collection('proposals').deleteMany({ userId: crew.userId })
        await database.collection('sessions').deleteMany({ userId: crew.userId })
        await database.collection('users').deleteOne({ id: crew.userId })
      }
      return json({ ok: true })
    }

    // Admin edit a company
    if (route.match(/^\/admin\/company\/[^/]+$/) && method === 'POST') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const id = route.split('/')[3]
      const b = await request.json()
      const set = {}
      if (b.name !== undefined) set.name = b.name
      if (b.companyType !== undefined) set.companyType = b.companyType
      if (b.email !== undefined) set.email = b.email
      if (b.phone !== undefined) set.phone = b.phone
      if (b.city !== undefined) set.city = b.city
      if (b.website !== undefined) set.website = b.website
      if (b.subscriptionStatus !== undefined) set.subscriptionStatus = b.subscriptionStatus
      if (b.paidVerified !== undefined) set.paidVerified = !!b.paidVerified
      await database.collection('companies').updateOne({ id }, { $set: set })
      const saved = await database.collection('companies').findOne({ id })
      return json({ ok: true, company: clean(saved) })
    }

    // Admin delete a company (cascades jobs, applications, rfps, account)
    if (route.match(/^\/admin\/company\/[^/]+$/) && method === 'DELETE') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const id = route.split('/')[3]
      const co = await database.collection('companies').findOne({ id })
      await database.collection('companies').deleteOne({ id })
      if (co?.userId) {
        const jobs = await database.collection('jobs').find({ userId: co.userId }).toArray()
        const jobIds = jobs.map((j) => j.id)
        if (jobIds.length) await database.collection('applications').deleteMany({ jobId: { $in: jobIds } })
        await database.collection('jobs').deleteMany({ userId: co.userId })
        await database.collection('rfps').deleteMany({ userId: co.userId })
        await database.collection('sessions').deleteMany({ userId: co.userId })
        await database.collection('users').updateOne(
          { id: co.userId },
          { $set: { archived: true, active: false, suspended: true, archivedAt: new Date() } }
        )
      }
      return json({ ok: true })
    }

    // Self-service account archival (preserves timesheets, disputes, history for 3-year retention)
    if (route === '/account' && method === 'DELETE') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const uid = user.id
      const now = new Date()
      await database.collection('users').updateOne(
        { id: uid },
        { $set: { archived: true, active: false, suspended: true, archivedAt: now } }
      )
      await database.collection('companies').updateMany({ userId: uid }, { $set: { archived: true, archivedAt: now } })
      await database.collection('crew_profiles').updateMany({ userId: uid }, { $set: { archived: true, available: false, archivedAt: now } })
      await database.collection('jobs').updateMany({ userId: uid, status: 'open' }, { $set: { status: 'closed', closedAt: now } })
      await database.collection('sessions').deleteMany({ userId: uid })
      const res = json({ ok: true, deleted: true, archived: true })
      res.cookies.set('lantix_session', '', { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 0 })
      return res
    }

    if (route === '/admin/recipients' && method === 'POST') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const { emails } = await request.json()
      const list = Array.isArray(emails) ? emails.map((e) => String(e).toLowerCase().trim()).filter(Boolean) : []
      await database.collection('settings').updateOne({ key: 'digest' }, { $set: { key: 'digest', recipients: list, updatedAt: new Date() } }, { upsert: true })
      return json({ ok: true, recipients: list })
    }

    if (route === '/admin/send-digest' && method === 'POST') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const result = await runEmailJob(database, { force: true })
      return json({ ok: true, result })
    }

    // Admin: SMS integration status + recent log
    if (route === '/admin/sms/status' && method === 'GET') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const recent = await database.collection('sms_log').find({}).sort({ createdAt: -1 }).limit(25).toArray()
      const consented = await database.collection('crew_profiles').countDocuments({ smsConsent: true })
      const totalCrew = await database.collection('crew_profiles').countDocuments({})
      return json({
        twilioLive: TWILIO_LIVE,
        from: TW_MSG_SID.startsWith('MG') ? `Messaging Service ${TW_MSG_SID.slice(0, 6)}…` : (TW_FROM ? TW_FROM.replace(/\d(?=\d{4})/g, '*') : ''),
        usingMessagingService: TW_MSG_SID.startsWith('MG'),
        consentedCrew: consented, totalCrew,
        recent: recent.map(clean),
      })
    }

    // Admin: send a live test SMS (bypasses crew consent gate — admin-initiated test only)
    if (route === '/admin/sms/test' && method === 'POST') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const { to, message } = await request.json()
      if (!normalizePhone(to)) return json({ error: 'A valid US phone number is required' }, 400)
      const body = message || 'LANTIX Pro test: your SMS alerts are live. Reply STOP to opt out.'
      const r = await sendSms(database, to, body, { type: 'admin_test' }, { skipConsent: true })
      return json({ ok: r.status === 'sent' || r.status === 'demo', live: TWILIO_LIVE, ...r })
    }

    if (route === '/admin/broadcast' && method === 'POST') {
      if (!isAdmin) return json({ error: 'Admin code required' }, 401)
      const { subject, message } = await request.json()
      if (!message) return json({ error: 'Message is required' }, 400)
      const crew = await database.collection('crew_profiles').find({}).limit(1000).toArray()
      let emailed = 0, texted = 0
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#18181b"><h2 style="color:#6d28d9">LANTIX Pro</h2><p>${esc(message).replace(/\n/g, '<br>')}</p></div>`
      // one email to admin + recipients as the record; individual crew emails
      for (const c of crew) {
        if (c.email) { try { await sendEmail({ to: c.email, subject: subject || 'LANTIX Pro announcement', html }); emailed++ } catch (e) {} }
        if (c.cell) { const r = await sendSms(database, c.cell, `LANTIX: ${message}`, { type: 'broadcast', crewId: c.id }); if (r.status !== 'skipped_no_consent' && r.status !== 'skipped') texted++ }
      }
      await database.collection('broadcasts').insertOne({ id: uuidv4(), subject: subject || '', message, emailed, texted, createdAt: new Date() })
      return json({ ok: true, emailed, texted, demo: !EMAIL_LIVE })
    }

    // ================= MESSAGES =================
    if (route === '/messages' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const { toUserId, body } = await request.json()
      if (!toUserId || !body) return json({ error: 'Recipient and message required' }, 400)
      const msg = { id: uuidv4(), fromUserId: user.id, fromName: user.name, fromPicture: user.picture, toUserId, body, read: false, createdAt: new Date() }
      await database.collection('messages').insertOne(msg)
      const recipient = await database.collection('users').findOne({ id: toUserId })
      const crew = await database.collection('crew_profiles').findOne({ userId: toUserId })
      if (crew?.cell) await sendSms(database, crew.cell, `LANTIX message from ${user.name}: ${body}`, { type: 'dm' })
      if (recipient?.email) { try { await sendEmail({ to: recipient.email, subject: `New message from ${user.name} on LANTIX Pro`, html: `<p><b>${esc(user.name)}</b> sent you a message:</p><p>${esc(body)}</p>` }) } catch (e) {} }
      return json({ ok: true, message: clean(msg) })
    }

    if (route === '/messages' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const inbox = await database.collection('messages').find({ toUserId: user.id }).sort({ createdAt: -1 }).limit(200).toArray()
      const sent = await database.collection('messages').find({ fromUserId: user.id }).sort({ createdAt: -1 }).limit(200).toArray()
      const unread = inbox.filter((m) => !m.read).length
      return json({ inbox: inbox.map(clean), sent: sent.map(clean), unread })
    }

    if (route === '/messages/read' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      await database.collection('messages').updateMany({ toUserId: user.id, read: false }, { $set: { read: true } })
      return json({ ok: true })
    }

    // ================= CALENDAR =================
    if (route === '/calendar' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      let events = []
      if (user.role === 'company') {
        const jobs = await database.collection('jobs').find({ userId: user.id }).limit(500).toArray()
        events = jobs.map((j) => ({ id: j.id, date: j.date, role: j.role, city: j.city, state: j.state, callTime: j.callTime, status: j.status, hours: j.hours, kind: 'job' }))
      } else {
        const apps = await database.collection('applications').find({ crewUserId: user.id }).limit(500).toArray()
        for (const a of apps) {
          const j = await database.collection('jobs').findOne({ id: a.jobId })
          if (j) events.push({ id: j.id, date: j.date, role: j.role, city: j.city, state: j.state, callTime: j.callTime, status: a.status === 'cancelled' || j.status === 'cancelled' ? 'cancelled' : a.status, hours: j.hours, kind: 'booking' })
        }
      }
      const extra = await showCalendarEvents(database, user, { from: request.nextUrl.searchParams.get('from'), to: request.nextUrl.searchParams.get('to') })
      if (extra.error) return json({ error: extra.error }, 400)
      return json({ events: [...events, ...extra.events] })
    }

    // ================= AUTH =================
    if (route === '/auth/session' && method === 'POST') {
      const { session_id } = await request.json()
      if (!session_id) return json({ error: 'session_id required' }, 400)
      const resp = await fetch(`${EMERGENT_AUTH_BASE}/auth/v1/env/oauth/session-data`, {
        headers: { 'X-Session-ID': session_id },
      })
      if (!resp.ok) return json({ error: 'Invalid session' }, 401)
      const data = await resp.json()
      let user = await database.collection('users').findOne({ email: data.email })
      if (!user) {
        user = { id: uuidv4(), email: data.email, name: data.name, picture: data.picture, role: null, createdAt: new Date() }
        await database.collection('users').insertOne(user)
      }
      const token = await createSession(database, user.id)
      const res = json({ user: clean(user) })
      return setSessionCookie(res, token)
    }

    if (route === '/auth/dev-login' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = (body.email || `demo${Math.floor(Math.random() * 100000)}@lantix.pro`).toLowerCase()
      let user = await database.collection('users').findOne({ email })
      if (!user) {
        user = {
          id: uuidv4(), email, name: body.name || 'Demo User',
          picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(body.name || 'Demo User')}&background=6d28d9&color=fff`,
          role: body.role || null, createdAt: new Date(),
        }
        await database.collection('users').insertOne(user)
      } else if (body.role && !user.role) {
        await database.collection('users').updateOne({ id: user.id }, { $set: { role: body.role } })
        user.role = body.role
      }
      const token = await createSession(database, user.id)
      const res = json({ user: clean(user) })
      return setSessionCookie(res, token)
    }

    if (route === '/auth/register' && method === 'POST') {
      const { email, password, name, role } = await request.json()
      if (!email || !password) return json({ error: 'Email and password are required' }, 400)
      if (String(password).length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)
      const em = String(email).toLowerCase().trim()
      const existing = await database.collection('users').findOne({ email: em })
      if (existing) return json({ error: 'An account with this email already exists. Try logging in.' }, 400)
      const passwordHash = await bcrypt.hash(String(password), 10)
      const chosenRole = ['company', 'crew'].includes(role) ? role : null
      const user = {
        id: uuidv4(), email: em, name: name || em.split('@')[0],
        picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || em)}&background=6d28d9&color=fff`,
        role: chosenRole, passwordHash, createdAt: new Date(),
      }
      await database.collection('users').insertOne(user)
      const token = await createSession(database, user.id)
      const u = clean(user); delete u.passwordHash
      return setSessionCookie(json({ user: u }), token)
    }

    if (route === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json()
      if (!email || !password) return json({ error: 'Email and password are required' }, 400)
      const em = String(email).toLowerCase().trim()
      if (em.endsWith('@lantix.local')) {
        await ensureTestAccountsSeeded(database)
      }
      const user = await database.collection('users').findOne({ email: em })
      if (!user || !user.passwordHash) return json({ error: 'Invalid email or password' }, 401)
      const ok = await bcrypt.compare(String(password), user.passwordHash)
      if (!ok) return json({ error: 'Invalid email or password' }, 401)
      if (user.suspended) return json({ error: 'This account is suspended. Please contact support.' }, 403)
      const token = await createSession(database, user.id)
      const u = clean(user); delete u.passwordHash
      return setSessionCookie(json({ user: u }), token)
    }

    if (route === '/auth/forgot' && method === 'POST') {
      const { email } = await request.json()
      if (!email) return json({ error: 'Email is required' }, 400)
      const em = String(email).toLowerCase().trim()
      const user = await database.collection('users').findOne({ email: em })
      if (user && user.passwordHash) {
        const token = uuidv4() + uuidv4()
        await database.collection('password_resets').insertOne({ token, userId: user.id, expiresAt: new Date(Date.now() + 3600000), used: false, createdAt: new Date() })
        const link = `${APP_URL}/?reset_token=${token}`
        try {
          await sendEmail({
            to: em,
            subject: 'Reset your LANTIX Pro password',
            html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#18181b;max-width:520px;margin:0 auto">
              <h2 style="color:#6d28d9">Reset your password</h2>
              <p>We received a request to reset your LANTIX Pro password. This link is valid for 1 hour.</p>
              <p style="margin:24px 0"><a href="${link}" style="background:#6d28d9;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>
              <p style="color:#71717a;font-size:12px">Or paste this link into your browser:<br>${link}</p>
              <p style="color:#a1a1aa;font-size:12px;margin-top:16px">If you didn't request this, you can ignore this email.</p>
            </div>`,
          })
        } catch (e) { console.error('reset email failed:', e.message) }
      }
      return json({ ok: true })
    }

    if (route === '/auth/reset' && method === 'POST') {
      const { token, password } = await request.json()
      if (!token || !password) return json({ error: 'Token and new password are required' }, 400)
      if (String(password).length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)
      const pr = await database.collection('password_resets').findOne({ token, used: false })
      if (!pr || new Date(pr.expiresAt) < new Date()) return json({ error: 'This reset link is invalid or has expired.' }, 400)
      const passwordHash = await bcrypt.hash(String(password), 10)
      await database.collection('users').updateOne({ id: pr.userId }, { $set: { passwordHash } })
      await database.collection('password_resets').updateOne({ token }, { $set: { used: true } })
      return json({ ok: true })
    }

    if (route === '/auth/me' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ user: null }, 200)
      let company = null, crew = null
      if (user.role === 'company') company = clean(await companyForUser(database, user.id))
      if (user.role === 'crew') crew = clean(await crewForUser(database, user.id))
      const su = clean(user); delete su.passwordHash
      return json({ user: su, company, crew })
    }

    if (route === '/auth/logout' && method === 'POST') {
      const token = request.cookies.get('lantix_session')?.value
      if (token) await database.collection('sessions').deleteOne({ session_token: token })
      const res = json({ ok: true })
      res.cookies.set('lantix_session', '', { path: '/', maxAge: 0 })
      return res
    }

    if (route === '/auth/role' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const { role } = await request.json()
      if (!['company', 'crew'].includes(role)) return json({ error: 'invalid role' }, 400)
      await database.collection('users').updateOne({ id: user.id }, { $set: { role } })
      return json({ ok: true, role })
    }

    // ================= CREW =================
    if (route === '/crew/profile' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const b = await request.json()
      const existingLocation = await database.collection('crew_profiles').findOne({ userId: user.id }, { projection: { city: 1, state: 1 } })
      const location = readLocation(b, existingLocation || {})
      if (location.error) return json({ error: location.error }, 400)
      const doc = {
        userId: user.id,
        fullName: b.fullName || user.name,
        photo: b.photo || user.picture,
        cell: b.cell || '',
        email: b.email || user.email,
        skills: b.skills || [],
        primaryCategory: b.primaryCategory || (b.skills && b.skills[0]) || '',
        dayRate: Number(b.dayRate ?? b.regularRate) || 0,
        regularRate: Number(b.regularRate ?? b.dayRate) || 0,
        overtimeRate: Number(b.overtimeRate) || 0,
        travelRate: Number(b.travelRate) || 0,
        holidayRate: Number(b.holidayRate) || 0,
        emergencyRate: Number(b.emergencyRate) || 0,
        city: location.city,
        state: location.state,
        available: b.available !== false,
        unionMember: !!b.unionMember,
        bio: b.bio || '',
        certs: Array.isArray(b.certs) ? b.certs.map((c) => ({ name: c.name || '', expiry: c.expiry || '', file: c.file || '', fileType: c.fileType || '', fileName: c.fileName || '' })) : [],
        smsConsent: !!b.smsConsent,
        smsConsentAt: b.smsConsent ? new Date() : null,
        updatedAt: new Date(),
      }
      await database.collection('crew_profiles').updateOne(
        { userId: user.id },
        { $set: doc, $setOnInsert: { id: uuidv4(), ratingAvg: 0, ratingCount: 0, createdAt: new Date() } },
        { upsert: true }
      )
      const saved = await crewForUser(database, user.id)
      return json({ crew: clean(saved) })
    }

    if (route === '/crew' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const sp = request.nextUrl.searchParams
      const q = {}
      const skill = sp.get('skill')
      const city = sp.get('city')
      const minRate = sp.get('minRate')
      const maxRate = sp.get('maxRate')
      const union = sp.get('union')
      const avail = sp.get('available')
      const search = sp.get('q')
      if (skill && skill !== 'all') q.skills = skill
      if (city && city !== 'all') q.city = { $regex: `^${city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
      const selectedState = request.nextUrl.searchParams.get('state')
      if (selectedState && selectedState !== 'all') {
        const state = normalizeState(selectedState)
        if (!state) return json({ error: 'Select one of the 50 US states' }, 400)
        q.state = state
      }
      if (union === 'true') q.unionMember = true
      if (avail === 'true') q.available = true
      if (minRate || maxRate) {
        q.dayRate = {}
        if (minRate) q.dayRate.$gte = Number(minRate)
        if (maxRate) q.dayRate.$lte = Number(maxRate)
      }
      if (search) q.fullName = { $regex: search, $options: 'i' }
      const certList = sp.getAll('cert')
      if (certList.length) q['certs.name'] = { $all: certList }
      const list = await database.collection('crew_profiles').find(q).limit(200).toArray()
      const company = await companyForUser(database, user.id)
      const paid = company?.paidVerified
      const out = list.map((c) => {
        const cc = clean(c)
        if (!paid) { delete cc.cell; delete cc.email; cc.contactLocked = true }
        return cc
      })
      return json({ crew: out, paid: !!paid })
    }

    if (route.match(/^\/crew\/[^/]+\/rate$/) && method === 'POST') {
      const id = route.split('/')[2]
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const { rating, note } = await request.json()
      await database.collection('ratings').insertOne({ id: uuidv4(), crewId: id, byUser: user.id, rating: Number(rating), note: note || '', createdAt: new Date() })
      const all = await database.collection('ratings').find({ crewId: id }).toArray()
      const avg = all.reduce((s, r) => s + r.rating, 0) / all.length
      await database.collection('crew_profiles').updateOne({ id }, { $set: { ratingAvg: +avg.toFixed(1), ratingCount: all.length } })
      return json({ ok: true, ratingAvg: +avg.toFixed(1), ratingCount: all.length })
    }

    if (route.match(/^\/crew\/[^/]+$/) && method === 'GET') {
      const id = route.split('/')[2]
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const c = await database.collection('crew_profiles').findOne({ id })
      if (!c) return json({ error: 'not found' }, 404)
      const company = await companyForUser(database, user.id)
      const cc = clean(c)
      if (!company?.paidVerified) { delete cc.cell; delete cc.email; cc.contactLocked = true }

      // Attach verified reviews and work history summary
      const reviews = await database.collection('reviews').find({ crewId: id }).sort({ createdAt: -1 }).toArray()
      cc.reviews = reviews.map(clean)

      // Work history from completed shows (only public title/role/dates - no sensitive client data)
      const shows = await database.collection('shows').find({
        staffing: { $elemMatch: { invitations: { $elemMatch: { crewId: id, status: 'accepted' } } } },
      }).toArray()
      cc.workHistory = shows.map((s) => {
        const row = (s.staffing || []).find((r) => (r.invitations || []).some((inv) => inv.crewId === id && inv.status === 'accepted'))
        return {
          showTitle: s.title,
          department: row?.departmentName || 'General',
          role: row?.roleTitle || 'Crew',
          city: s.city,
          state: s.state,
          year: s.startDate ? new Date(s.startDate).getFullYear() : undefined,
          status: s.status,
        }
      })
      cc.showsWorkedCount = cc.workHistory.length

      return json({ crew: cc })
    }

    // Certs expiring within 30 days (for admin email alerts — wiring pending email provider)
    if (route === '/certs/expiring' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const today = new Date().toISOString().slice(0, 10)
      const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
      const all = await database.collection('crew_profiles').find({ 'certs.expiry': { $gte: today, $lte: soon } }).limit(500).toArray()
      const out = []
      for (const c of all) {
        for (const cert of (c.certs || [])) {
          if (cert.expiry && cert.expiry >= today && cert.expiry <= soon) {
            out.push({ crew: c.fullName, city: c.city, cell: c.cell, cert: cert.name, expiry: cert.expiry })
          }
        }
      }
      out.sort((a, b) => a.expiry.localeCompare(b.expiry))
      return json({ expiring: out, count: out.length })
    }

    // ================= COMPANIES =================
    if (route === '/companies/profile' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const b = await request.json()
      const existingLocation = await database.collection('companies').findOne({ userId: user.id }, { projection: { city: 1, state: 1 } })
      const location = readLocation(b, existingLocation || {})
      if (location.error) return json({ error: location.error }, 400)
      const doc = {
        userId: user.id,
        name: b.name || '',
        companyType: b.companyType || 'Production House',
        logo: b.logo || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name || 'Co')}&background=6d28d9&color=fff&bold=true`,
        phone: b.phone || '',
        email: b.email || user.email,
        website: b.website || '',
        city: location.city,
        state: location.state,
        description: b.description || '',
        updatedAt: new Date(),
      }
      await database.collection('companies').updateOne(
        { userId: user.id },
        { $set: doc, $setOnInsert: { id: uuidv4(), paidVerified: false, subscriptionStatus: 'none', createdAt: new Date() } },
        { upsert: true }
      )
      const saved = await companyForUser(database, user.id)
      return json({ company: clean(saved) })
    }

    if (route === '/companies' && method === 'GET') {
      const sp = request.nextUrl.searchParams
      const q = {}
      const city = sp.get('city')
      const type = sp.get('type')
      const search = sp.get('q')
      if (city && city !== 'all') q.city = { $regex: `^${city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
      const selectedState = request.nextUrl.searchParams.get('state')
      if (selectedState && selectedState !== 'all') {
        const state = normalizeState(selectedState)
        if (!state) return json({ error: 'Select one of the 50 US states' }, 400)
        q.state = state
      }
      if (type && type !== 'all') q.companyType = type
      if (search) q.name = { $regex: search, $options: 'i' }
      const list = await database.collection('companies').find(q).limit(200).toArray()
      return json({ companies: list.map(clean) })
    }

    if (route.match(/^\/companies\/[^/]+$/) && method === 'GET') {
      const id = route.split('/')[2]
      const c = await database.collection('companies').findOne({ id })
      if (!c) return json({ error: 'not found' }, 404)
      return json({ company: clean(c) })
    }

    // ================= JOBS =================
    if (route === '/jobs' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Create a company profile first' }, 400)
      if (!company.paidVerified) return json({ error: 'Company posting access is required' }, 403)
      const b = await request.json()
      const location = readLocation(b, company)
      if (location.error) return json({ error: location.error }, 400)
      const job = {
        id: uuidv4(),
        userId: user.id,
        companyName: company.name,
        companyType: company.companyType,
        role: b.role || '',
        skills: b.skills && b.skills.length ? b.skills : (b.role ? [b.role] : []),
        crewCount: Number(b.crewCount) || 1,
        date: b.date || new Date().toISOString().slice(0, 10),
        city: location.city,
        state: location.state,
        callTime: b.callTime || '09:00',
        dayRate: Number(b.dayRate) || 0,
        union: !!b.union,
        description: b.description || '',
        address: b.address || '',
        hours: Number(b.hours) === 8 ? 8 : 10,
        holidayPay: !!b.holidayPay,
        overtimeHours: Number(b.overtimeHours) || 0,
        clientName: b.clientName || '',
        clientContact: b.clientContact || '',
        plot: b.plot || '',
        plotName: b.plotName || '',
        status: 'open',
        createdAt: new Date(),
      }
      await database.collection('jobs').insertOne(job)
      const matches = await matchCrew(database, job)
      const msg = `LANTIX: New job in ${job.city} on ${job.date}. ${job.role} $${job.dayRate}/10hr. Tap to view & apply.`
      let sent = 0, skippedNoConsent = 0
      for (const m of matches) {
        const r = await sendSms(database, m.cell, msg, { jobId: job.id, crewId: m.id, type: 'job_alert' })
        if (r.status === 'skipped_no_consent') skippedNoConsent++
        else sent++
      }
      return json({
        job: clean(job),
        matched: matches.length,
        notified: sent,
        skippedNoConsent,
        message: msg,
        demo: !TWILIO_LIVE,
        matchNames: matches.slice(0, 8).map((m) => m.fullName),
      })
    }

    if (route === '/jobs' && method === 'GET') {
      const sp = request.nextUrl.searchParams
      const q = {}
      const role = sp.get('role')
      const skill = sp.get('skill')
      const city = sp.get('city')
      const union = sp.get('union')
      const type = sp.get('companyType')
      const minRate = sp.get('minRate')
      if (role && role !== 'all') q.role = role
      if (skill && skill !== 'all') q.skills = skill
      if (city && city !== 'all') q.city = { $regex: `^${city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
      const selectedState = request.nextUrl.searchParams.get('state')
      if (selectedState && selectedState !== 'all') {
        const state = normalizeState(selectedState)
        if (!state) return json({ error: 'Select one of the 50 US states' }, 400)
        q.state = state
      }
      if (type && type !== 'all') q.companyType = type
      if (union === 'true') q.union = true
      if (minRate) q.dayRate = { $gte: Number(minRate) }
      const list = await database.collection('jobs').find(q).sort({ createdAt: -1 }).limit(200).toArray()
      return json({ jobs: list.map(clean) })
    }

    if (route.match(/^\/jobs\/[^/]+\/apply$/) && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const crew = await crewForUser(database, user.id)
      if (!crew) return json({ error: 'Create a crew profile first' }, 400)
      const existing = await database.collection('applications').findOne({ jobId: id, crewUserId: user.id })
      if (existing) return json({ ok: true, already: true })
      await database.collection('applications').insertOne({
        id: uuidv4(), jobId: id, crewUserId: user.id, crewId: crew.id,
        status: 'applied', createdAt: new Date(),
      })
      return json({ ok: true })
    }

    if (route.match(/^\/jobs\/[^/]+\/cancel$/) && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const job = await database.collection('jobs').findOne({ id })
      if (!job) return json({ error: 'not found' }, 404)
      // Enforce 24-hour notice using job date + call time
      const jobStart = new Date(`${job.date}T${(job.callTime || '09:00')}:00`)
      const hoursUntil = (jobStart.getTime() - Date.now()) / 3600000
      if (isFinite(hoursUntil) && hoursUntil < 24) {
        return json({ error: 'Jobs can only be cancelled with at least 24 hours notice. This job is within 24 hours — please contact the other party directly.' }, 400)
      }
      if (job.userId === user.id) {
        // Company cancels the entire job
        await database.collection('jobs').updateOne({ id }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'company' } })
        const apps = await database.collection('applications').find({ jobId: id }).limit(500).toArray()
        for (const a of apps) {
          await database.collection('applications').updateOne({ id: a.id }, { $set: { status: 'cancelled' } })
          if (a.status === 'confirmed') {
            const crew = await database.collection('crew_profiles').findOne({ id: a.crewId })
            if (crew?.cell) await sendSms(database, crew.cell, `LANTIX: Job CANCELLED — ${job.role} in ${job.city} on ${job.date} was cancelled by the company (24hr+ notice).`, { jobId: id, type: 'job_cancel' })
          }
        }
        return json({ ok: true, cancelled: 'job' })
      }
      // Crew cancels their own booking/application
      const app = await database.collection('applications').findOne({ jobId: id, crewUserId: user.id })
      if (!app) return json({ error: 'You are not booked on this job' }, 403)
      await database.collection('applications').updateOne({ id: app.id }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'crew' } })
      const co = await database.collection('companies').findOne({ userId: job.userId })
      const crew = await database.collection('crew_profiles').findOne({ id: app.crewId })
      if (co?.phone) await sendSms(database, co.phone, `LANTIX: ${crew?.fullName || 'A crew member'} cancelled for ${job.role} on ${job.date} (24hr+ notice). Re-open the role to find a replacement.`, { jobId: id, type: 'crew_cancel' })
      return json({ ok: true, cancelled: 'application' })
    }

    if (route.match(/^\/jobs\/[^/]+\/applicants$/) && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const apps = await database.collection('applications').find({ jobId: id }).limit(500).toArray()
      const out = []
      for (const a of apps) {
        const crew = await database.collection('crew_profiles').findOne({ id: a.crewId })
        const cc = crew ? clean(crew) : null
        if (cc && a.status !== 'confirmed') { delete cc.cell; delete cc.email }
        out.push({ application: clean(a), crew: cc })
      }
      return json({ applicants: out })
    }

    if (route.match(/^\/jobs\/[^/]+\/confirm$/) && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const { applicationId } = await request.json()
      const job = await database.collection('jobs').findOne({ id })
      if (!job || job.userId !== user.id) return json({ error: 'Not your job' }, 403)
      await database.collection('applications').updateOne({ id: applicationId }, { $set: { status: 'confirmed', confirmedAt: new Date() } })
      const app = await database.collection('applications').findOne({ id: applicationId })
      const crew = await database.collection('crew_profiles').findOne({ id: app.crewId })
      if (crew?.cell) {
        const msg = `LANTIX: You're CONFIRMED for ${job.role} in ${job.city} on ${job.date}. Full details & contact now unlocked in your app.`
        await sendSms(database, crew.cell, msg, { jobId: id, crewId: crew.id, type: 'confirm' })
      }
      return json({ ok: true })
    }

    if (route.match(/^\/jobs\/[^/]+$/) && method === 'GET') {
      const id = route.split('/')[2]
      const user = await getUser(request)
      const job = await database.collection('jobs').findOne({ id })
      if (!job) return json({ error: 'not found' }, 404)
      let unlocked = false
      if (user) {
        const app = await database.collection('applications').findOne({ jobId: id, crewUserId: user.id, status: 'confirmed' })
        unlocked = !!app || job.userId === user.id
      }
      const jc = clean(job)
      if (unlocked) {
        const co = await database.collection('companies').findOne({ userId: job.userId })
        jc.companyContact = co ? { phone: co.phone, email: co.email, website: co.website, address: `${co.city}, MA` } : null
      }
      jc.unlocked = unlocked
      return json({ job: jc })
    }

    if (route === '/my/applications' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const apps = await database.collection('applications').find({ crewUserId: user.id }).sort({ createdAt: -1 }).limit(200).toArray()
      const out = []
      for (const a of apps) {
        const job = await database.collection('jobs').findOne({ id: a.jobId })
        const jc = job ? clean(job) : null
        if (jc && a.status === 'confirmed') {
          const co = await database.collection('companies').findOne({ userId: job.userId })
          jc.companyContact = co ? { phone: co.phone, email: co.email, website: co.website, address: `${co.city}, MA` } : null
        }
        out.push({ application: clean(a), job: jc })
      }
      return json({ applications: out })
    }

    // ================= RFP =================
    if (route === '/rfps' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Create a company profile first' }, 400)
      if (!company.paidVerified) return json({ error: 'Company posting access is required' }, 403)
      const b = await request.json()
      const location = readLocation(b, company)
      if (location.error) return json({ error: location.error }, 400)
      const rfp = {
        id: uuidv4(), userId: user.id, companyId: company.id, companyName: company.name,
        title: b.title || '', description: b.description || '',
        city: location.city, state: location.state, date: b.date || '',
        budget: Number(b.budget) || 0, status: 'open', createdAt: new Date(),
      }
      await database.collection('rfps').insertOne(rfp)
      return json({ rfp: clean(rfp) })
    }

    if (route === '/rfps' && method === 'GET') {
      const list = await database.collection('rfps').find({}).sort({ createdAt: -1 }).limit(100).toArray()
      return json({ rfps: list.map(clean) })
    }

    if (route.match(/^\/rfps\/[^/]+\/proposals$/) && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Create a company profile first' }, 400)
      const id = route.split('/')[2]
      const b = await request.json()
      await database.collection('proposals').insertOne({
        id: uuidv4(), rfpId: id, userId: user.id, companyName: company.name,
        amount: Number(b.amount) || 0, message: b.message || '', createdAt: new Date(),
      })
      return json({ ok: true })
    }

    if (route.match(/^\/rfps\/[^/]+$/) && method === 'GET') {
      const user = await getUser(request)
      const id = route.split('/')[2]
      const rfp = await database.collection('rfps').findOne({ id })
      if (!rfp) return json({ error: 'not found' }, 404)
      const rc = clean(rfp)
      const isOwner = user && rfp.userId === user.id
      const proposals = await database.collection('proposals').find({ rfpId: id }).sort({ createdAt: -1 }).limit(200).toArray()
      rc.proposals = isOwner ? proposals.map(clean) : []
      rc.proposalCount = proposals.length
      rc.isOwner = isOwner
      return json({ rfp: rc })
    }

    // ================= SERVICES & ADA =================
    if (route === '/services' && method === 'GET') {
      const sp = request.nextUrl.searchParams
      const q = {}
      const category = sp.get('category')
      const city = sp.get('city')
      const search = sp.get('q')
      if (category && category !== 'all') q.category = category
      if (city && city !== 'all') q.city = { $regex: `^${city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
      const selectedState = request.nextUrl.searchParams.get('state')
      if (selectedState && selectedState !== 'all') {
        const state = normalizeState(selectedState)
        if (!state) return json({ error: 'Select one of the 50 US states' }, 400)
        q.state = state
      }
      if (search) q.name = { $regex: search, $options: 'i' }
      const list = await database.collection('services').find(q).sort({ createdAt: -1 }).limit(200).toArray()
      return json({ services: list.map(clean) })
    }

    if (route === '/services' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const b = await request.json()
      if (!b.name || !b.category) return json({ error: 'name and category required' }, 400)
      const location = readLocation(b)
      if (location.error) return json({ error: location.error }, 400)
      const svc = {
        id: uuidv4(), userId: user.id,
        name: b.name, category: b.category,
        city: location.city, state: location.state,
        phone: b.phone || '', email: b.email || '', website: b.website || '',
        description: b.description || '', createdAt: new Date(),
      }
      await database.collection('services').insertOne(svc)
      return json({ service: clean(svc) })
    }

    // ================= BILLING =================
    if (route === '/billing/checkout' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Create a company profile first' }, 400)

      if (!STRIPE_LIVE) {
        await database.collection('companies').updateOne({ userId: user.id }, {
          $set: {
            subscriptionStatus: 'trialing', paidVerified: true,
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400000), updatedAt: new Date(),
          },
        })
        return json({ demo: true, activated: true, mode: STRIPE_MODE })
      }

      const successUrl = `${APP_URL}/?billing=success&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${APP_URL}/?billing=cancel`
      const lineItems = [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'LANTIX Pro \u2014 Company Account' },
          recurring: { interval: 'month' },
          unit_amount: SUBSCRIPTION_PRICE_CENTS,
        },
        quantity: 1,
      }]
      const meta = { userId: user.id, companyId: company.id }

      // ---- Emergent-managed claimable sandbox (proxy) ----
      if (STRIPE_SANDBOX) {
        const session = await stripeProxy('POST', '/checkout/sessions', {
          mode: 'subscription',
          customer_email: company.email || user.email,
          line_items: lineItems,
          subscription_data: { trial_period_days: TRIAL_DAYS, metadata: meta },
          payment_method_collection: 'always',
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: meta,
        })
        await database.collection('payment_transactions').insertOne({
          id: uuidv4(), userId: user.id, companyId: company.id, sessionId: session.id, mode: 'sandbox',
          amount: SUBSCRIPTION_PRICE_CENTS, currency: 'usd', status: 'initiated',
          paymentStatus: session.payment_status || null, createdAt: new Date(),
        })
        await database.collection('companies').updateOne({ userId: user.id }, { $set: { stripeCheckoutSessionId: session.id, updatedAt: new Date() } })
        return json({ url: session.url, sessionId: session.id, mode: 'sandbox' })
      }

      // ---- Direct Stripe (your own keys) ----
      let customerId = company.stripeCustomerId
      if (!customerId) {
        const customer = await stripe.customers.create({ name: company.name, email: company.email, metadata: { userId: user.id } })
        customerId = customer.id
        await database.collection('companies').updateOne({ userId: user.id }, { $set: { stripeCustomerId: customerId } })
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: lineItems,
        subscription_data: { trial_period_days: TRIAL_DAYS, metadata: meta },
        payment_method_collection: 'always',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: meta,
      })
      await database.collection('payment_transactions').insertOne({
        id: uuidv4(), userId: user.id, companyId: company.id, sessionId: session.id, mode: STRIPE_MODE,
        amount: SUBSCRIPTION_PRICE_CENTS, currency: 'usd', status: 'initiated', paymentStatus: session.payment_status || null, createdAt: new Date(),
      })
      return json({ url: session.url, sessionId: session.id, mode: STRIPE_MODE })
    }

    if (route === '/billing/verify' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (!STRIPE_LIVE) return json({ ok: true, demo: true, mode: STRIPE_MODE })
      const { session_id } = await request.json().catch(() => ({}))
      if (!session_id || typeof session_id !== 'string') return json({ error: 'session_id required' }, 400)

      // ---- Sandbox: read the checkout session back through the proxy ----
      if (STRIPE_SANDBOX) {
        let cs
        try { cs = await stripeProxyRetrieveSession(session_id) }
        catch (e) {
          if (e.status === 404 || e.code === 'resource_missing') return json({ ok: false, pending: true, mode: 'sandbox', error: 'Still confirming with Stripe — please retry in a moment.' }, 202)
          throw e
        }
        if (cs.metadata?.userId && cs.metadata.userId !== user.id) return json({ error: 'This checkout session belongs to a different account' }, 403)
        const complete = cs.status === 'complete'
        const tx = await database.collection('payment_transactions').findOne({ sessionId: session_id })
        const txSet = { status: complete ? 'complete' : (cs.status || 'unknown'), paymentStatus: cs.payment_status || null, subscriptionId: cs.subscription || null, customerId: cs.customer || null, verifiedAt: new Date() }
        if (tx) await database.collection('payment_transactions').updateOne({ sessionId: session_id }, { $set: txSet })
        else await database.collection('payment_transactions').insertOne({ id: uuidv4(), userId: user.id, sessionId: session_id, mode: 'sandbox', amount: cs.amount_total ?? SUBSCRIPTION_PRICE_CENTS, currency: cs.currency || 'usd', createdAt: new Date(), ...txSet })
        if (complete) {
          const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400000)
          await database.collection('companies').updateOne({ userId: user.id }, {
            $set: {
              stripeCustomerId: cs.customer || null,
              stripeSubscriptionId: cs.subscription || null,
              stripeCheckoutSessionId: cs.id,
              subscriptionStatus: 'trialing',
              paidVerified: true,
              cancelAtPeriodEnd: false,
              canceledAt: null,
              trialEndsAt: trialEnd,
              currentPeriodEnd: trialEnd,
              updatedAt: new Date(),
            },
          })
        }
        return json({ ok: complete, status: cs.status, paymentStatus: cs.payment_status, mode: 'sandbox' })
      }

      // ---- Direct Stripe ----
      const cs = await stripe.checkout.sessions.retrieve(session_id)
      if (cs.metadata?.userId && cs.metadata.userId !== user.id) return json({ error: 'This checkout session belongs to a different account' }, 403)
      if (cs.subscription) {
        const sub = await stripe.subscriptions.retrieve(cs.subscription)
        await syncSubscription(database, sub, user.id)
      }
      await database.collection('payment_transactions').updateOne({ sessionId: session_id }, { $set: { status: cs.status, paymentStatus: cs.payment_status, subscriptionId: cs.subscription || null, customerId: cs.customer || null, verifiedAt: new Date() } })
      return json({ ok: cs.status === 'complete', status: cs.status, mode: STRIPE_MODE })
    }

    if (route === '/billing/status' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      const lastTx = await database.collection('payment_transactions').find({ userId: user.id }).sort({ createdAt: -1 }).limit(1).toArray()
      return json({
        subscriptionStatus: company?.subscriptionStatus || 'none',
        paidVerified: !!company?.paidVerified,
        trialEndsAt: company?.trialEndsAt || null,
        currentPeriodEnd: company?.currentPeriodEnd || company?.trialEndsAt || null,
        cancelAtPeriodEnd: !!company?.cancelAtPeriodEnd,
        canceledAt: company?.canceledAt || null,
        priceCents: SUBSCRIPTION_PRICE_CENTS,
        trialDays: TRIAL_DAYS,
        mode: STRIPE_MODE,
        stripeLive: STRIPE_LIVE,
        portalAvailable: STRIPE_DIRECT && !!company?.stripeCustomerId,
        lastTransaction: lastTx[0] ? clean(lastTx[0]) : null,
      })
    }

    // Cancel at period end — keeps access until the paid/trial period ends
    if (route === '/billing/cancel' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Create a company profile first' }, 400)
      if (!company.paidVerified || ['none', 'canceled'].includes(company.subscriptionStatus || 'none')) return json({ error: 'No active subscription to cancel' }, 400)
      if (company.cancelAtPeriodEnd) return json({ ok: true, already: true, cancelAtPeriodEnd: true, currentPeriodEnd: company.currentPeriodEnd || company.trialEndsAt || null })
      let periodEnd = company.currentPeriodEnd || company.trialEndsAt || new Date(Date.now() + 30 * 86400000)
      let stripeSynced = false
      if (STRIPE_DIRECT && company.stripeSubscriptionId) {
        const sub = await stripe.subscriptions.update(company.stripeSubscriptionId, { cancel_at_period_end: true })
        if (sub.current_period_end) periodEnd = new Date(sub.current_period_end * 1000)
        stripeSynced = true
      }
      await database.collection('companies').updateOne({ userId: user.id }, {
        $set: { cancelAtPeriodEnd: true, cancelRequestedAt: new Date(), currentPeriodEnd: periodEnd, updatedAt: new Date() },
      })
      await database.collection('payment_transactions').insertOne({ id: uuidv4(), userId: user.id, companyId: company.id, mode: STRIPE_MODE, type: 'cancel_scheduled', status: 'cancel_scheduled', stripeSynced, periodEnd, createdAt: new Date() })
      return json({ ok: true, cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd, stripeSynced, mode: STRIPE_MODE })
    }

    // Undo a scheduled cancellation
    if (route === '/billing/resume' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Create a company profile first' }, 400)
      if (!company.cancelAtPeriodEnd) return json({ error: 'Subscription is not scheduled for cancellation' }, 400)
      if (!company.paidVerified) return json({ error: 'This subscription has already ended — start a new subscription instead' }, 400)
      let stripeSynced = false
      if (STRIPE_DIRECT && company.stripeSubscriptionId) {
        await stripe.subscriptions.update(company.stripeSubscriptionId, { cancel_at_period_end: false })
        stripeSynced = true
      }
      await database.collection('companies').updateOne({ userId: user.id }, { $set: { cancelAtPeriodEnd: false, updatedAt: new Date() }, $unset: { cancelRequestedAt: '' } })
      await database.collection('payment_transactions').insertOne({ id: uuidv4(), userId: user.id, companyId: company.id, mode: STRIPE_MODE, type: 'cancel_reverted', status: 'active', stripeSynced, createdAt: new Date() })
      return json({ ok: true, cancelAtPeriodEnd: false, stripeSynced, mode: STRIPE_MODE })
    }

    // Stripe Billing Portal (update card / invoices) — only possible with your own Stripe keys
    if (route === '/billing/portal' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!STRIPE_DIRECT || !company?.stripeCustomerId) return json({ error: 'Billing portal is available once live Stripe keys are connected' }, 400)
      const ps = await stripe.billingPortal.sessions.create({ customer: company.stripeCustomerId, return_url: `${APP_URL}/?billing=portal` })
      return json({ url: ps.url })
    }

    if (route === '/billing/webhook' && method === 'POST') {
      // Webhooks can only be signature-verified in DIRECT mode (your own Stripe account + STRIPE_WEBHOOK_SECRET).
      // In sandbox/demo mode we acknowledge but never grant entitlement from unverified payloads.
      if (!STRIPE_DIRECT || !process.env.STRIPE_WEBHOOK_SECRET) return json({ received: true, ignored: true, mode: STRIPE_MODE })
      const rawBody = await request.text()
      const sig = request.headers.get('stripe-signature')
      let event
      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
      } catch (e) {
        return json({ error: 'bad signature' }, 400)
      }
      if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
        const sub = event.data.object
        await syncSubscription(database, sub, sub.metadata?.userId)
      }
      if (event.type === 'invoice.payment_failed') {
        const inv = event.data.object
        const co = inv.customer ? await database.collection('companies').findOne({ stripeCustomerId: inv.customer }) : null
        if (co) {
          await database.collection('companies').updateOne({ id: co.id }, { $set: { subscriptionStatus: 'past_due', lastPaymentFailedAt: new Date(), updatedAt: new Date() } })
          await database.collection('payment_transactions').insertOne({ id: uuidv4(), userId: co.userId, companyId: co.id, mode: STRIPE_MODE, type: 'payment_failed', status: 'failed', invoiceId: inv.id, amount: inv.amount_due ?? null, currency: inv.currency || 'usd', createdAt: new Date() })
        }
      }
      return json({ received: true, type: event.type })
    }

    // ================= TIMESHEETS =================
    if (route === '/timesheets' || route.startsWith('/timesheets/')) {
      return await handleTimesheets(request, { database, user: await getUser(request), route })
    }

    // ================= SHOW INVITATIONS / ASSIGNMENTS =================
    if (route === '/invitations' || route.startsWith('/invitations/') || /^\/shows\/[^/]+\/staffing\/[^/]+\/(invitations|crew)$/.test(route)) {
      return await handleShowInvitations(request, { database, user: await getUser(request), route })
    }

    // ================= SHOWS / DEPARTMENT STAFFING =================
    if (route === '/shows' || route.startsWith('/shows/')) {
      return await handleShowsRequest(request, { database, user: await getUser(request), route })
    }

    // ================= COMPANY TEAM (RBAC) =================
    if (route === '/company/team' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company not found' }, 404)
      const team = await getCompanyTeam(database, company.id)
      return json({ team: team.map(clean) })
    }

    if (route === '/company/team' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company not found' }, 404)
      const perm = await checkCompanyPermission(database, user, company, 'manage_team')
      if (!perm.allowed) return json({ error: perm.error || 'Only Owner can manage company team' }, 403)
      const { email, role, name, departments } = await request.json()
      if (!email || !role) return json({ error: 'Email and role are required' }, 400)
      const item = {
        id: uuidv4(),
        companyId: company.id,
        email: String(email).toLowerCase().trim(),
        name: name || '',
        role,
        departments: Array.isArray(departments) ? departments : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await database.collection('company_team').updateOne(
        { companyId: company.id, email: item.email },
        { $set: item },
        { upsert: true }
      )
      return json({ ok: true, member: item })
    }

    if (route.startsWith('/company/team/') && method === 'DELETE') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company not found' }, 404)
      const perm = await checkCompanyPermission(database, user, company, 'manage_team')
      if (!perm.allowed) return json({ error: 'Only Owner can remove team members' }, 403)
      const memberId = route.split('/')[3]
      await database.collection('company_team').deleteOne({ companyId: company.id, id: memberId })
      return json({ ok: true })
    }

    // ================= COMPANY FAVOURITES & PREVIOUS CREW =================
    if (route === '/company/favourites' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company not found' }, 404)
      const favs = await database.collection('company_favourites').find({ companyId: company.id }).toArray()
      const crewIds = favs.map((f) => f.crewId)
      const crew = await database.collection('crew_profiles').find({ id: { $in: crewIds } }).toArray()
      return json({ favourites: crew.map(clean) })
    }

    if (route === '/company/favourites' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company not found' }, 404)
      const { crewId } = await request.json()
      if (!crewId) return json({ error: 'crewId is required' }, 400)
      const existing = await database.collection('company_favourites').findOne({ companyId: company.id, crewId })
      if (existing) {
        await database.collection('company_favourites').deleteOne({ companyId: company.id, crewId })
        return json({ ok: true, favourited: false })
      } else {
        await database.collection('company_favourites').insertOne({
          id: uuidv4(),
          companyId: company.id,
          crewId,
          createdAt: new Date(),
        })
        return json({ ok: true, favourited: true })
      }
    }

    if (route === '/company/previous-crew' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company not found' }, 404)
      const crew = await getPreviousCrew(database, company.id)
      return json({ previousCrew: crew })
    }

    // ================= SHOW SUMMARY & EXPORTS =================
    if (route.match(/^\/shows\/[^/]+\/summary$/) && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const showId = route.split('/')[2]
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company not found' }, 404)
      const summary = await generateShowSummary(database, showId, company.id)
      if (!summary) return json({ error: 'Show not found' }, 404)
      return json({ summary })
    }

    if (route === '/company/export/staffing' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const showId = request.nextUrl.searchParams.get('showId')
      if (!showId) return json({ error: 'showId is required' }, 400)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company not found' }, 404)
      const show = await database.collection('shows').findOne({ id: showId, companyId: company.id })
      if (!show) return json({ error: 'Show not found' }, 404)
      const csv = exportShowStaffingCsv(show)
      const res = new NextResponse(csv, { status: 200 })
      res.headers.set('Content-Type', 'text/csv; charset=utf-8')
      res.headers.set('Content-Disposition', `attachment; filename="show-staffing-${show.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv"`)
      return res
    }

    if (route === '/crew/export/timesheets' && method === 'GET') {
      const user = await getUser(request)
      if (!user || user.role !== 'crew') return json({ error: 'Crew account required' }, 403)
      const shows = await database.collection('shows').find({ 'staffing.invitations.crewUserId': user.id }).toArray()
      const sheets = []
      for (const show of shows) {
        for (const row of (show.staffing || [])) {
          for (const inv of (row.invitations || [])) {
            if (inv.crewUserId === user.id) {
              for (const s of (inv.timesheets || [])) {
                sheets.push({
                  ...s,
                  showTitle: show.title,
                  venueName: show.venueName,
                  city: show.city,
                  state: show.state,
                  departmentName: row.departmentName,
                  roleTitle: row.roleTitle,
                })
              }
            }
          }
        }
      }
      const csv = exportCrewTimesheetsCsv(sheets, user.name)
      const res = new NextResponse(csv, { status: 200 })
      res.headers.set('Content-Type', 'text/csv; charset=utf-8')
      res.headers.set('Content-Disposition', 'attachment; filename="crew-approved-timesheets.csv"')
      return res
    }

    if (route === '/crew/export/history' && method === 'GET') {
      const user = await getUser(request)
      if (!user || user.role !== 'crew') return json({ error: 'Crew account required' }, 403)
      const shows = await database.collection('shows').find({ 'staffing.invitations.crewUserId': user.id }).toArray()
      const historyRows = [['Show Title', 'Venue', 'City', 'State', 'Start Date', 'End Date', 'Department', 'Role', 'Status']]
      for (const show of shows) {
        for (const row of (show.staffing || [])) {
          for (const inv of (row.invitations || [])) {
            if (inv.crewUserId === user.id) {
              historyRows.push([
                show.title, show.venueName, show.city, show.state, show.startDate, show.endDate,
                row.departmentName, row.roleTitle, inv.status,
              ])
            }
          }
        }
      }
      const csv = historyRows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
      const res = new NextResponse(csv, { status: 200 })
      res.headers.set('Content-Type', 'text/csv; charset=utf-8')
      res.headers.set('Content-Disposition', 'attachment; filename="crew-work-history.csv"')
      return res
    }

    // ================= DOCUMENTS (7 Categories, RBAC Protection) =================
    if (route === '/documents' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const targetUserId = request.nextUrl.searchParams.get('userId') || user.id
      const category = request.nextUrl.searchParams.get('category')
      const query = { ownerUserId: targetUserId }
      if (category && category !== 'all') query.category = category

      if (targetUserId !== user.id && user.role !== 'admin') {
        query.sensitive = false
      }

      const docs = await database.collection('documents').find(query).sort({ createdAt: -1 }).toArray()
      return json({ documents: docs.map(clean) })
    }

    if (route === '/documents' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const { name, category, fileData, fileType, showId } = await request.json()
      if (!name || !category) return json({ error: 'Document name and category are required' }, 400)
      const sensitiveCategories = ['ids', 'tax_w9', 'contracts']
      const isSensitive = sensitiveCategories.includes(category)
      const doc = {
        id: uuidv4(),
        ownerUserId: user.id,
        ownerRole: user.role,
        name: String(name).trim().slice(0, 160),
        category,
        sensitive: isSensitive,
        fileData: fileData || '',
        fileType: fileType || 'application/pdf',
        showId: showId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await database.collection('documents').insertOne(doc)
      return json({ ok: true, document: clean(doc) }, 201)
    }

    if (route.startsWith('/documents/') && method === 'DELETE') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const docId = route.split('/')[2]
      const doc = await database.collection('documents').findOne({ id: docId })
      if (!doc) return json({ error: 'Document not found' }, 404)
      if (doc.ownerUserId !== user.id && user.role !== 'admin') {
        return json({ error: 'Unauthorized' }, 403)
      }
      await database.collection('documents').deleteOne({ id: docId })
      return json({ ok: true })
    }

    // ================= REVIEWS (Verified Completed Work Only) =================
    if (route === '/reviews' && method === 'GET') {
      const crewId = request.nextUrl.searchParams.get('crewId')
      if (!crewId) return json({ error: 'crewId is required' }, 400)
      const reviews = await database.collection('reviews').find({ crewId }).sort({ createdAt: -1 }).toArray()
      return json({ reviews: reviews.map(clean) })
    }

    if (route === '/reviews' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const company = await companyForUser(database, user.id)
      if (!company) return json({ error: 'Company account required to review crew' }, 403)
      const { crewId, rating, comment } = await request.json()
      if (!crewId || !rating) return json({ error: 'crewId and rating are required' }, 400)
      const result = await addCrewReview(database, {
        companyId: company.id,
        companyName: company.name,
        crewId,
        rating,
        comment,
      })
      if (result.error) return json({ error: result.error }, 400)
      return json({ ok: true, review: clean(result.review) }, 201)
    }

    // ================= NOTIFICATIONS =================
    if (route === '/notifications' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const list = await database.collection('notifications')
        .find({ userId: user.id })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()
      const unreadCount = list.filter((n) => !n.read).length
      return json({ notifications: list.map(clean), unreadCount })
    }

    if (route === '/notifications/read' && method === 'POST') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      await database.collection('notifications').updateMany(
        { userId: user.id, read: false },
        { $set: { read: true, readAt: new Date() } }
      )
      return json({ ok: true })
    }

    // ================= DASHBOARD =================
    if (route === '/dashboard' && method === 'GET') {
      const user = await getUser(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const jobs = await database.collection('jobs').find({ userId: user.id }).sort({ createdAt: -1 }).toArray()
      const jobsOut = []
      let confirmedCrew = []
      for (const j of jobs) {
        const apps = await database.collection('applications').find({ jobId: j.id }).toArray()
        const confirmed = apps.filter((a) => a.status === 'confirmed')
        jobsOut.push({ ...clean(j), applicantCount: apps.length, confirmedCount: confirmed.length })
        for (const a of confirmed) {
          const crew = await database.collection('crew_profiles').findOne({ id: a.crewId })
          if (crew) confirmedCrew.push({ ...clean(crew), jobRole: j.role, jobDate: j.date, jobCity: j.city })
        }
      }
      const rfps = await database.collection('rfps').find({ userId: user.id }).sort({ createdAt: -1 }).toArray()
      const rfpsOut = []
      for (const r of rfps) {
        const pc = await database.collection('proposals').countDocuments({ rfpId: r.id })
        rfpsOut.push({ ...clean(r), proposalCount: pc })
      }
      return json({
        jobs: jobsOut,
        confirmedCrew,
        rfps: rfpsOut,
        stats: {
          activeJobs: jobs.filter((j) => j.status === 'open').length,
          totalApplicants: jobsOut.reduce((s, j) => s + j.applicantCount, 0),
          confirmed: confirmedCrew.length,
          rfps: rfps.length,
        },
      })
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (error) {
    console.error('API Error:', error)
    return json({ error: 'Internal server error', detail: error.message }, 500)
  }
}

async function handleRequest(request, context) {
  return handleCORS(await handleRoute(request, context), request)
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const DELETE = handleRequest
export const PATCH = handleRequest
