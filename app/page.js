'use client'

import { useEffect, useState, useCallback, useId, cloneElement, isValidElement } from 'react'
import ShowsSection from '@/components/shows-section'
import CrewInvitations from '@/components/crew-invitations'
import Timesheets from '@/components/timesheets'
import WorkCalendar from '@/components/work-calendar'
import StateSelect from '@/components/state-select'
import { normalizeState } from '@/lib/us-locations'
import AppShell, { Brand } from '@/components/app-shell'
import CompanyOverview from '@/components/company-overview'
import CompanyTeam from '@/components/company-team'
import DocumentVault from '@/components/document-vault'
import { CrewReviewsSection } from '@/components/crew-reviews'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Users, Building2, Briefcase, FileText, LayoutDashboard, Zap, MapPin, Star,
  CheckCircle2, Lock, Phone, Mail, Globe, Search, Plus, LogOut, ShieldCheck,
  Radio, DollarSign, Clock, Calendar, Send, UserCircle, Sparkles, Menu, X,
  Truck, Accessibility, HeartHandshake, Heart, ExternalLink, Map as MapIcon, Eye, EyeOff, KeyRound,
  MessageSquare, ClipboardList, Trash2, Megaphone, CreditCard, RefreshCw, UserCheck, ArrowRight,
} from 'lucide-react'

/* ---------------- constants ---------------- */
const SKILL_CATEGORIES = {
  Production: ['Crew Chief', 'Show Caller'],
  Crew: ['Make Up Artist'],
  Audio: ['FOH Engineer', 'A1', 'A2', 'Monitor Engineer', 'RF Tech', 'System Tech'],
  Lighting: ['Lighting Designer', 'Lighting Board Op', 'Lighting Assist L2', 'Electrician', 'Follow Spot'],
  Video: ['Video Engineer', 'Camera Op', 'CCU Operator', 'TD - Technical Director', 'Media Server Op', 'LED Tech', 'Projectionist', 'E2 Operator', 'Spider Operator', 'Video Playback', 'Graphic Operator', 'Teleprompter'],
  Photo: ['Photographer'],
  Rigging: ['Head Rigger', 'Rigger', 'Ground Rigger'],
  Stage: ['Stagehand', 'Carpenter', 'Deck Hand', 'Loader', 'Fork Operator'],
  Backline: ['Backline Tech', 'Guitar Tech', 'Drum Tech'],
}
const KEY_ROLES = ['FOH Engineer', 'Monitor Engineer', 'Head Rigger', 'Crew Chief', 'TD - Technical Director', 'Lighting Designer', 'Show Caller']
const LOGO = '/lantix-logo-neon.jpeg?v=2'
const ALL_SKILLS = Object.values(SKILL_CATEGORIES).flat()
const COMPANY_TYPES = ['Production House', 'Venue', 'Promoter']
const SERVICE_CATEGORIES = ['Catering', 'Transportation (Car Service)', 'Travel', 'Legal (Entertainment Law)', 'Talent Agency (Actors)', 'Makeup Artist', 'ADA — Signers (ASL)', 'ADA — Translators']
const CERT_TYPES = ['OSHA', 'OSHA 30', 'ETCP', 'ETCP Rigging', 'Rigger Cert', 'CDL', 'CPR/First Aid', 'Aerial/MEWP', 'Forklift']
const daysUntil = (d) => { if (!d) return null; return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000) }
const certExpSoon = (d) => { const n = daysUntil(d); return n !== null && n <= 30 }
const mapSrc = (q) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed`
const dirLink = (q) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`
function calDates(job) {
  const d = (job.date || '').replace(/-/g, '')
  const t = (job.callTime || '09:00').replace(':', '') + '00'
  const start = `${d}T${t}`
  const endH = String((parseInt((job.callTime || '09:00').slice(0, 2)) + (job.hours || 10)) % 24).padStart(2, '0')
  const end = `${d}T${endH}${(job.callTime || '09:00').slice(3, 5)}00`
  return { start, end }
}
const gcalLink = (job) => {
  const { start, end } = calDates(job)
  const text = `${job.role} — LANTIX (${job.companyName || ''})`
  const details = `${job.role} · $${job.dayRate}/${job.hours || 10}hr${job.holidayPay ? ' · Holiday Pay' : ''}`
  const loc = job.address || `${job.city}${job.state ? ', ' + job.state : ''}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${start}/${end}&location=${encodeURIComponent(loc)}&details=${encodeURIComponent(details)}`
}
function downloadIcs(job) {
  const { start, end } = calDates(job)
  const loc = job.address || `${job.city}${job.state ? ', ' + job.state : ''}`
  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//LANTIX Pro//EN\nBEGIN:VEVENT\nUID:${job.id}@lantixpro\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${job.role} - LANTIX\nLOCATION:${loc}\nDESCRIPTION:${job.role} $${job.dayRate}/${job.hours || 10}hr\nEND:VEVENT\nEND:VCALENDAR`
  const blob = new Blob([ics], { type: 'text/calendar' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${job.role}-${job.date}.ics`; a.click()
}
const HERO = 'https://images.unsplash.com/photo-1573339887617-d674bc961c31?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwyfHxzdGFnZSUyMGxpZ2h0aW5nfGVufDB8fHxibGFja3wxNzg2NTUyNTc4fDA&ixlib=rb-4.1.0&q=85'

/* ---------------- api helper ---------------- */
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const Stars = ({ value }) => (
  <span className="inline-flex items-center gap-0.5 text-amber-500">
    <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
    <span className="text-xs font-semibold text-zinc-700">{value || '—'}</span>
  </span>
)

/* ==================================================================== */
export default function App() {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [crew, setCrew] = useState(null)
  const [page, setPage] = useState('crew')
  const [mobileNav, setMobileNav] = useState(false)
  const [resetToken, setResetToken] = useState(null)
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (user?.role === 'company' && company && typeof window !== 'undefined' && Date.now() - new Date(company.createdAt).getTime() < 300000) {
      const key = 'lantix_welcome_' + user.id
      if (!localStorage.getItem(key)) setShowWelcome(true)
    }
  }, [user, company])

  const refreshMe = useCallback(async () => {
    const d = await api('/auth/me')
    setUser(d.user)
    setCompany(d.company || null)
    setCrew(d.crew || null)
    return d
  }, [])

  // Verify a Stripe checkout that we returned from. The session id is kept in localStorage until
  // it is confirmed, so a logged-out return (expired session, different device) is picked up after login.
  const PENDING_KEY = 'lantix_pending_checkout'
  const verifyPendingCheckout = useCallback(async () => {
    const sid = typeof window !== 'undefined' ? localStorage.getItem(PENDING_KEY) : null
    if (!sid) return false
    let verified = false, pending = false, unauthorized = false
    for (let attempt = 0; attempt < 4 && !verified; attempt++) {
      try {
        const v = await api('/billing/verify', { method: 'POST', body: { session_id: sid } })
        if (v.ok) { verified = true; break }
        if (v.pending) { pending = true; await new Promise((r) => setTimeout(r, 1500)); continue }
        pending = false; break
      } catch (e) {
        if (/unauthorized/i.test(e.message)) { unauthorized = true }
        break
      }
    }
    if (unauthorized) { toast.message('Sign in to finish activating your subscription.'); return false }
    if (verified) { localStorage.removeItem(PENDING_KEY); toast.success('Subscription active — you are verified! 14-day trial started.'); await refreshMe().catch(() => {}); return true }
    if (pending) { toast.message('Payment received — Stripe is still confirming. Refresh in a moment to see your verified badge.'); return false }
    localStorage.removeItem(PENDING_KEY)
    toast.error('We could not confirm that checkout completed. If you were charged, contact admin@lantixpro.com.')
    return false
  }, [refreshMe])

  // If a checkout was left unverified (e.g. returned while logged out), verify once the user is signed in
  useEffect(() => {
    if (user && typeof window !== 'undefined' && localStorage.getItem(PENDING_KEY)) verifyPendingCheckout()
  }, [user, verifyPendingCheckout])

  useEffect(() => {
    (async () => {
      // Existing data is never seeded or replaced by ordinary page visits.
      try { localStorage.removeItem('lantix_admin_code') } catch {}
      // Emergent OAuth return
      const hash = window.location.hash
      if (hash.includes('session_id=')) {
        const sid = new URLSearchParams(hash.replace('#', '')).get('session_id')
        try {
          await api('/auth/session', { method: 'POST', body: { session_id: sid } })
          window.history.replaceState({}, '', window.location.pathname)
          toast.success('Signed in with Google')
        } catch (e) { toast.error('Sign in failed') }
      }
      // Stripe return
      const qs = new URLSearchParams(window.location.search)
      if (qs.get('billing') === 'success') {
        const sid = qs.get('session_id')
        if (sid) localStorage.setItem(PENDING_KEY, sid)
        window.history.replaceState({}, '', window.location.pathname)
        await verifyPendingCheckout()
      }
      if (qs.get('billing') === 'cancel') {
        window.history.replaceState({}, '', window.location.pathname)
        toast.message('Checkout cancelled — no charge was made.')
      }
      if (qs.get('billing') === 'portal') {
        window.history.replaceState({}, '', window.location.pathname)
        toast.message('Billing details updated.')
      }
      if (qs.get('reset_token')) { setResetToken(qs.get('reset_token')); window.history.replaceState({}, '', window.location.pathname) }
      // Deep link to admin/master page (e.g. lantixpro.com/#admin)
      const h = (window.location.hash || '').toLowerCase()
      if (h === '#admin' || h === '#master') { window.location.replace('/master-admin'); return }
      try { const me = await refreshMe(); setPage(me.user?.role === 'company' ? 'dashboard' : 'jobs') } catch (e) {}
      setBooting(false)
    })()
  }, [refreshMe])

  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); setCompany(null); setCrew(null) }

  if (booting) return <SplashLoader />
  if (resetToken) return <ResetPasswordScreen token={resetToken} onDone={() => setResetToken(null)} />
  if (!user) return <Landing />

  // onboarding
  if (!user.role) return <RoleGate onDone={refreshMe} />
  if (user.role === 'company' && !company) return <CompanyEditor first onDone={refreshMe} />
  if (user.role === 'crew' && !crew) return <CrewEditor user={user} first onDone={refreshMe} />

  const isCompany = user.role === 'company'
  const navItems = isCompany
    ? [
        { k: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { k: 'shows', label: 'Shows / Events', icon: Calendar },
        { k: 'new-show', label: 'Post a Show', icon: Plus },
        { k: 'crew', label: 'Crew Directory', icon: Users },
        { k: 'applicants', label: 'Applicants', icon: UserCheck },
        { k: 'calendar', label: 'Calendar', icon: Calendar },
        { k: 'timesheet-approvals', label: 'Timesheet Approvals', icon: ClipboardList },
        { k: 'jobs', label: 'Jobs Board', icon: Briefcase },
        { k: 'post', label: 'Post Job / RFP', icon: Plus },
        { k: 'rfps', label: 'RFPs', icon: FileText },
        { k: 'messages', label: 'Messages', icon: MessageSquare },
        { k: 'companies', label: 'Company Directory', icon: Building2 },
        { k: 'services', label: 'Services & ADA', icon: HeartHandshake },
        { k: 'billing', label: 'Billing', icon: CreditCard },
        { k: 'company-profile', label: 'My Company', icon: UserCircle },
      ]
    : [
        { k: 'jobs', label: 'Jobs Board', icon: Briefcase },
        { k: 'calendar', label: 'Calendar', icon: Calendar },
        { k: 'applications', label: 'My Applications', icon: CheckCircle2 },
        { k: 'invitations', label: 'Crew Invitations', icon: Mail },
        { k: 'timesheets', label: 'Timesheets', icon: ClipboardList },
        { k: 'companies', label: 'Company Directory', icon: Building2 },
        { k: 'services', label: 'Services & ADA', icon: HeartHandshake },
        { k: 'messages', label: 'Messages', icon: MessageSquare },
        { k: 'crew-profile', label: 'My Profile', icon: UserCircle },
      ]

  const go = (k) => { setPage(k); setMobileNav(false) }
  const dismissWelcome = () => { if (user) localStorage.setItem('lantix_welcome_' + user.id, '1'); setShowWelcome(false) }

  return (
    <>
      <AppShell user={user} navItems={navItems} page={page} title={navLabel(page)} onNavigate={go} onLogout={logout} actions={isCompany ? <><Badge className="hidden sm:inline-flex" variant={company?.paidVerified ? 'secondary' : 'outline'}>{company?.paidVerified ? 'Posting enabled' : 'Company workspace'}</Badge><Button onClick={() => go('new-show')} size="sm"><Plus className="mr-1 h-4 w-4" />Post a show</Button></> : <Badge variant="secondary">Crew workspace</Badge>}>
          {page === 'crew' && <CrewDirectory company={company} />}
          {page === 'calendar' && <CalendarView />}
          {page === 'messages' && <MessagesView user={user} />}
          {page === 'companies' && <CompanyDirectory />}
          {page === 'services' && <ServicesDirectory />}
          {page === 'jobs' && <JobsBoard user={user} onGoApplications={() => go('applications')} />}
          {page === 'rfps' && <RFPBoard onPost={() => go('post')} />}
          {page === 'dashboard' && <Dashboard company={company} onChanged={refreshMe} onNavigate={go} />}
          {page === 'applicants' && <Dashboard company={company} onChanged={refreshMe} onNavigate={go} applicantsOnly />}
          {isCompany && (page === 'shows' || page === 'new-show') && <ShowsSection key={page} api={api} initialCreate={page === 'new-show'} />}
          {isCompany && page === 'billing' && <div className="space-y-5"><Card className="shadow-soft"><CardContent className="p-6"><h2 className="text-xl font-semibold">Your company plan</h2><p className="mt-2 text-sm text-muted-foreground">Manage your existing subscription and review your company access. Show rates and timesheet estimates are separate from subscription billing.</p></CardContent></Card><BillingCard company={company} onChanged={refreshMe} /></div>}
          {page === 'applications' && <MyApplications />}
          {page === 'invitations' && user?.role === 'crew' && <CrewInvitations key={user.id} api={api} />}
          {page === 'timesheets' && user?.role === 'crew' && <Timesheets key={user.id} api={api} role="crew" />}
          {page === 'timesheet-approvals' && user?.role === 'company' && <Timesheets key={user.id} api={api} role="company" />}
          {page === 'company-profile' && <><CompanyEditor onDone={refreshMe} existing={company} /><details className="rounded-2xl border border-border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Communication preferences</summary><div className="mt-4"><EmailDigestBar /></div></details></>}
          {page === 'crew-profile' && <CrewEditor user={user} onDone={refreshMe} existing={crew} />}
          {page === 'post' && <PostCenter company={company} onPosted={() => go('dashboard')} />}
      </AppShell>
      {isCompany && <CompanyWelcome open={showWelcome} company={company} onClose={dismissWelcome} onPostJob={() => { dismissWelcome(); go('post') }} />}
    </>
  )
}

function navLabel(p) {
  const m = { shows: 'Shows / Events', 'new-show': 'Post a Show', applicants: 'Applicants & Assignments', billing: 'Billing', crew: 'Crew Directory', master: 'Master List', calendar: 'Calendar', messages: 'Messages', companies: 'Company Directory', services: 'Services & ADA Directory', jobs: 'Jobs Board', rfps: 'Requests for Proposal', dashboard: 'Dashboard', applications: 'My Applications', invitations: 'Crew Invitations', timesheets: 'Timesheets', 'timesheet-approvals': 'Timesheet Approvals', 'company-profile': 'My Company', 'crew-profile': 'My Profile', post: 'Post Job / RFP' }
  return m[p] || p
}

/* ---------------- Splash ---------------- */
function SplashLoader() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <div className="h-14 w-14 rounded-xl bg-violet-600 flex items-center justify-center animate-pulse"><Zap className="h-7 w-7 text-white" /></div>
      <p className="text-zinc-400 text-sm">Loading LANTIX Pro…</p>
    </div>
  )
}

/* ---------------- Reset password screen ---------------- */
function ResetPasswordScreen({ token, onDone }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const submit = async () => {
    if (pw.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try { await api('/auth/reset', { method: 'POST', body: { token, password: pw } }); setDone(true); toast.success('Password updated — you can log in now.') }
    catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-border shadow-soft">
        <CardContent className="p-7 space-y-5">
          <Brand compact />
          <div className="space-y-2"><h2 className="text-2xl font-bold tracking-tight">Set a new password</h2><p className="text-sm text-muted-foreground">Choose a secure password for your LANTIX Pro account.</p></div>
          {done ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-600 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Your password has been updated.</p>
              <Button onClick={onDone} className="w-full bg-violet-600 hover:bg-violet-500">Back to log in</Button>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="reset-password" className="text-sm mb-1 block">New password</Label>
                <div className="relative">
                  <Input id="reset-password" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" className="pr-10" onKeyDown={(e) => e.key === 'Enter' && submit()} />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
              </div>
              <Button onClick={submit} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-500">{loading ? 'Saving…' : 'Update password'}</Button>
              <button onClick={onDone} className="text-xs text-zinc-500 hover:text-zinc-700 w-full text-center">Cancel</button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------------- Landing ---------------- */
function Landing() {
  const [open, setOpen] = useState(false)
  const [legal, setLegal] = useState(null)
  const google = () => { window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(window.location.origin)}` }
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="w-full bg-violet-600 py-2.5 px-4 text-center text-xs md:text-sm font-semibold uppercase tracking-wider text-white">
        Developed by True Life Entertainment LLC
      </div>
      <header className="flex items-center justify-between px-6 md:px-12 h-20">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-violet-600 flex items-center justify-center"><Zap className="h-6 w-6 text-white" /></div>
          <span className="font-bold text-xl">LANTIX <span className="text-violet-400">Pro</span></span>
        </div>
        <Button onClick={() => setOpen(true)} variant="secondary" className="bg-white text-zinc-900 hover:bg-zinc-200">Sign in</Button>
      </header>

      <section className="relative overflow-hidden">
        <img src={HERO} alt="Live event stage" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950" />
        <div className="relative px-6 md:px-12 py-24 md:py-32 max-w-4xl">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
            The labor network for <span className="text-violet-400">live events</span>.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-zinc-300 max-w-2xl">
            Post jobs. Post RFPs. Find crew in minutes, not group texts. Browse every vetted engineer and stagehand — photo, skills, and 10hr rate.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Button size="lg" onClick={() => setOpen(true)} className="bg-violet-600 hover:bg-violet-500 text-white h-12 px-8 text-base">
              Start 14-Day Trial <Sparkles className="ml-2 h-4 w-4" />
            </Button>
            <div className="flex items-center text-zinc-400 text-sm px-2">$300/month for production companies · Free for crew</div>
          </div>
        </div>
      </section>

      <section className="px-6 md:px-12 py-20 grid md:grid-cols-2 gap-6 max-w-6xl mx-auto">
        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-violet-400" /> For Production Companies</CardTitle></CardHeader>
          <CardContent className="text-zinc-400 space-y-3">
            <p>Post jobs. Post RFPs. Find crew in minutes, not group texts.</p>
            <p>Browse every vetted engineer and stagehand. See photo, skills, and 10hr rate. Auto-SMS the right people instantly.</p>
            <p className="text-white font-semibold">$300 / month per company</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-violet-400" /> For Crew</CardTitle></CardHeader>
          <CardContent className="text-zinc-400 space-y-3">
            <p>Get booked. <span className="text-white font-semibold">Free to join.</span></p>
            <p>Set your skills. Set your 10hr rate. Get an SMS the moment a job matches you.</p>
            <p>Confirmed? Full job details & company contact unlock instantly.</p>
          </CardContent>
        </Card>
      </section>

      <section id="company" className="px-6 md:px-12 py-16 border-t border-zinc-800/80 max-w-6xl mx-auto grid md:grid-cols-2 gap-10">
        <div>
          <h2 className="text-2xl font-bold mb-3">About</h2>
          <p className="text-zinc-400 leading-relaxed">
            <span className="text-white font-semibold">LANTIX Pro</span> (the "Lantix App") is a product of{' '}
            <span className="text-white font-semibold">True Life Entertainment LLC</span>, a Massachusetts live-events company.
            LANTIX Pro connects production companies, venues and promoters with vetted live-event crew across Massachusetts —
            handling crew discovery, job posting, matching, and booking.
          </p>
          <p className="text-zinc-500 text-sm mt-3">Operated by True Life Entertainment LLC — LantixPro is a DBA of True Life Entertainment LLC</p>
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-3">Contact</h2>
          <ul className="space-y-3 text-zinc-300 text-sm">
            <li className="flex items-center gap-3"><Building2 className="h-4 w-4 text-violet-400 shrink-0" /> True Life Entertainment LLC DBA Lantix Pro</li>
            <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-violet-400 shrink-0" /> <a href="mailto:hello@truelifeentertainment.com" className="hover:text-violet-400 hover:underline">hello@truelifeentertainment.com</a></li>
            <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-violet-400 shrink-0" /> <a href="mailto:admin@lantixpro.com" className="hover:text-violet-400 hover:underline">admin@lantixpro.com</a></li>
            <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-violet-400 shrink-0" /> <a href="tel:+16179557915" className="hover:text-violet-400 hover:underline">(617) 955-7915</a></li>
            <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-violet-400 shrink-0" /> 16 Hiawatha Road, Boston, MA 02126</li>
          </ul>
        </div>
      </section>

      <LoginDialog open={open} onOpenChange={setOpen} onGoogle={google} />
      <LegalDialog which={legal} onClose={() => setLegal(null)} />
      <footer className="py-10 px-6 text-center text-zinc-500 text-sm border-t border-zinc-800/80">
        <p className="text-zinc-300 font-medium">LANTIX Pro is a product of True Life Entertainment LLC</p>
        <p className="mt-1 text-zinc-500">16 Hiawatha Road, Boston, MA 02126 · <a href="tel:+16179557915" className="hover:text-violet-400">(617) 955-7915</a> · <a href="mailto:hello@truelifeentertainment.com" className="hover:text-violet-400">hello@truelifeentertainment.com</a> · <a href="mailto:admin@lantixpro.com" className="hover:text-violet-400">admin@lantixpro.com</a></p>
        <div className="mt-3 space-x-3">
          <span>© {new Date().getFullYear()} True Life Entertainment LLC DBA Lantix Pro</span>
          <span className="text-zinc-700">·</span>
          <button onClick={() => setLegal('privacy')} className="hover:text-violet-400 hover:underline underline-offset-2">Privacy Policy</button>
          <span className="text-zinc-700">·</span>
          <button onClick={() => setLegal('terms')} className="hover:text-violet-400 hover:underline underline-offset-2">Terms of Service</button>
        </div>
      </footer>
    </div>
  )
}

function LegalDialog({ which, onClose }) {
  if (!which) return null
  const isPrivacy = which === 'privacy'
  return (
    <Dialog open={!!which} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</DialogTitle></DialogHeader>
        <div className="text-sm text-zinc-600 space-y-3 leading-relaxed">
          <p className="text-xs text-zinc-400">Last updated: {new Date().getFullYear()}</p>
          {isPrivacy ? (
            <>
              <p>LANTIX Pro (the "Lantix App", "we", "us"), a product of <span className="font-semibold text-zinc-800">True Life Entertainment LLC</span> (DBA Lantix Pro), connects live-event production companies with crew in Massachusetts. This policy explains what we collect and how we use it.</p>
              <p className="font-semibold text-zinc-800">Information we collect</p>
              <p>Account details from your Google sign-in (name, email, profile photo); profile information you provide (skills, 10hr rate, city, phone/cell, company details, logo); and activity such as jobs posted, applications, bookings and RFP proposals.</p>
              <p className="font-semibold text-zinc-800">How we use it</p>
              <p>To operate the marketplace — matching crew to jobs, sending job-alert SMS and email to opted-in crew, showing companies relevant crew and vice-versa, processing subscriptions, and improving the service.</p>
              <p className="font-semibold text-zinc-800">Contact information visibility</p>
              <p>Crew phone and email are hidden in the directory and are only revealed to a subscribed company once a crew member is confirmed/booked for that company's job.</p>
              <p className="font-semibold text-zinc-800">SMS messages</p>
              <p>By adding a cell number, crew consent to receive job-related SMS from LANTIX Pro (operated by True Life Entertainment LLC). Message frequency varies; message and data rates may apply. Reply STOP to opt out at any time, or HELP for help.</p>
              <p className="font-semibold text-zinc-800">Third-party services</p>
              <p>We use trusted providers to run the product, including payment processing (Stripe), SMS (Twilio), and Google for sign-in. These providers process data only to deliver their service.</p>
              <p className="font-semibold text-zinc-800">Data retention & your choices</p>
              <p>You may edit or remove your profile at any time from your profile page. Contact us to request deletion of your account and associated data.</p>
              <p className="font-semibold text-zinc-800">Contact</p>
              <p>Questions about privacy? This app is operated by True Life Entertainment LLC (DBA Lantix Pro), 16 Hiawatha Road, Boston, MA 02126. Email <a href="mailto:hello@truelifeentertainment.com" className="text-violet-600 underline">hello@truelifeentertainment.com</a> or <a href="mailto:admin@lantixpro.com" className="text-violet-600 underline">admin@lantixpro.com</a>, or call (617) 955-7915.</p>
            </>
          ) : (
            <>
              <p>These Terms govern your use of LANTIX Pro (the "Lantix App"), a product of <span className="font-semibold text-zinc-800">True Life Entertainment LLC</span> (DBA Lantix Pro). By creating an account you agree to them.</p>
              <p className="font-semibold text-zinc-800">Accounts</p>
              <p>Crew accounts are free. Company accounts require a subscription of $300/month per company (with a 14-day free trial) to post jobs & RFPs and to unlock crew contact information. Verified status reflects an active subscription.</p>
              <p className="font-semibold text-zinc-800">The marketplace</p>
              <p>LANTIX Pro is a platform that helps companies and crew find each other. We are not a party to any booking, employment or service agreement made between users, and we are not the employer of any crew member.</p>
              <p className="font-semibold text-zinc-800">Bookings & cancellations</p>
              <p>When a company confirms a crew member, job details and contact are shared between the parties. Jobs and bookings may be cancelled through the platform only with at least 24 hours' notice before call time; cancellations within 24 hours must be arranged directly between the parties.</p>
              <p className="font-semibold text-zinc-800">Acceptable use</p>
              <p>Provide accurate information, honor commitments you make, and do not misuse the platform, harass other users, or post false listings. We may suspend accounts that violate these Terms.</p>
              <p className="font-semibold text-zinc-800">Payments</p>
              <p>Subscription fees are billed monthly and are non-refundable except where required by law. You can cancel your subscription to stop future charges.</p>
              <p className="font-semibold text-zinc-800">Disclaimer & liability</p>
              <p>The service is provided "as is". To the fullest extent permitted by law, LANTIX Pro is not liable for disputes, damages, no-shows, or losses arising between companies and crew.</p>
              <p className="font-semibold text-zinc-800">Contact</p>
              <p>Questions about these Terms? This app is operated by True Life Entertainment LLC (DBA Lantix Pro), 16 Hiawatha Road, Boston, MA 02126. Email <a href="mailto:hello@truelifeentertainment.com" className="text-violet-600 underline">hello@truelifeentertainment.com</a> or <a href="mailto:admin@lantixpro.com" className="text-violet-600 underline">admin@lantixpro.com</a>, or call (617) 955-7915.</p>
            </>
          )}
        </div>
        <DialogFooter><Button onClick={onClose} className="bg-violet-600 hover:bg-violet-500">Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LoginDialog({ open, onOpenChange, onGoogle }) {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('login')
  const [showPw, setShowPw] = useState(false)
  const [f, setF] = useState({ email: '', password: '', name: '', role: '' })
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const submit = async () => {
    if (mode === 'forgot') {
      if (!f.email) return toast.error('Enter your email')
      setLoading(true)
      try { await api('/auth/forgot', { method: 'POST', body: { email: f.email } }); toast.success('If an account exists, we just emailed a reset link.'); setMode('login') }
      catch (e) { toast.error(e.message) } finally { setLoading(false) }
      return
    }
    if (!f.email || !f.password) return toast.error('Enter email and password')
    if (mode === 'signup' && !f.role) return toast.error('Please choose whether you are Crew or a Company')
    setLoading(true)
    try {
      await api(mode === 'signup' ? '/auth/register' : '/auth/login', { method: 'POST', body: f })
      window.location.reload()
    } catch (e) { toast.error(e.message); setLoading(false) }
  }
  const title = mode === 'forgot' ? 'Reset your password' : 'Welcome to LANTIX Pro'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-border bg-card p-6 shadow-soft sm:max-w-md sm:p-8">
        <div className="mb-2"><Brand compact /></div>
        <DialogHeader><DialogTitle className="text-2xl font-bold tracking-tight">{mode === 'signup' ? 'Create your account' : title}</DialogTitle><p className="pt-1 text-sm text-muted-foreground">{mode === 'forgot' ? 'We’ll help you get back into your workspace.' : 'Your next show starts here.'}</p></DialogHeader>
        <div className="space-y-4 py-1">
          {mode === 'forgot' ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-500">Enter your account email and we'll send you a link to set a new password.</p>
              <div><Label htmlFor="auth-email" className="text-sm mb-1 block">Email</Label><Input id="auth-email" type="email" value={f.email} onChange={(e) => upd('email', e.target.value)} placeholder="you@email.com" onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>
              <Button onClick={submit} disabled={loading} className="w-full h-11 bg-violet-600 hover:bg-violet-500"><KeyRound className="h-4 w-4 mr-1" /> {loading ? 'Sending…' : 'Send reset link'}</Button>
              <p className="text-xs text-center text-zinc-500"><button className="text-violet-600 font-medium" onClick={() => setMode('login')}>Back to log in</button></p>
            </div>
          ) : (
            <>
              <Button onClick={onGoogle} variant="outline" className="w-full h-11"><GoogleIconDark /> Continue with Google</Button>
              <div className="flex items-center gap-3 text-xs text-zinc-400"><Separator className="flex-1" /> or with email <Separator className="flex-1" /></div>
              <div className="space-y-3">
                {mode === 'signup' && (<div><Label htmlFor="auth-name" className="text-sm mb-1 block">Name</Label><Input id="auth-name" value={f.name} onChange={(e) => upd('name', e.target.value)} placeholder="Your name" /></div>)}
                {mode === 'signup' && (
                  <div>
                    <Label className="text-sm mb-1.5 block">I'm signing up as</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => upd('role', 'crew')} className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${f.role === 'crew' ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500' : 'border-zinc-200 hover:border-violet-300'}`}>
                        <Users className={`h-5 w-5 ${f.role === 'crew' ? 'text-violet-600' : 'text-zinc-400'}`} />
                        <div><p className="text-sm font-semibold">Crew</p><p className="text-[11px] text-zinc-500">Free · find event work</p></div>
                      </button>
                      <button type="button" onClick={() => upd('role', 'company')} className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${f.role === 'company' ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500' : 'border-zinc-200 hover:border-violet-300'}`}>
                        <Building2 className={`h-5 w-5 ${f.role === 'company' ? 'text-violet-600' : 'text-zinc-400'}`} />
                        <div><p className="text-sm font-semibold">Company</p><p className="text-[11px] text-zinc-500">Post jobs · $300/mo</p></div>
                      </button>
                    </div>
                  </div>
                )}
                <div><Label htmlFor="auth-email" className="text-sm mb-1 block">Email</Label><Input id="auth-email" type="email" value={f.email} onChange={(e) => upd('email', e.target.value)} placeholder="you@email.com" /></div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="auth-password" className="text-sm">Password</Label>
                    {mode === 'login' && <button className="text-xs text-violet-600" onClick={() => setMode('forgot')}>Forgot password?</button>}
                  </div>
                  <div className="relative">
                    <Input id="auth-password" type={showPw ? 'text' : 'password'} value={f.password} onChange={(e) => upd('password', e.target.value)} placeholder="••••••••" className="pr-10" onKeyDown={(e) => e.key === 'Enter' && submit()} />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600" aria-label="Toggle password">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={submit} disabled={loading} className="w-full h-11 bg-violet-600 hover:bg-violet-500">{loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</Button>
                <p className="text-xs text-center text-zinc-500">
                  {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button className="text-violet-600 font-medium" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Log in' : 'Sign up'}</button>
                </p>
              </div>
              <p className="text-[11px] text-zinc-400 text-center">By continuing you agree to our <span className="text-zinc-600 font-medium">Terms of Service</span> &amp; <span className="text-zinc-600 font-medium">Privacy Policy</span>.</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const GoogleIconDark = () => (
  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>
)

const GoogleIcon = () => (
  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" opacity=".9"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#fff" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>
)

/* ---------------- Role gate ---------------- */
function RoleGate({ onDone }) {
  const set = async (role) => { await api('/auth/role', { method: 'POST', body: { role } }); await onDone() }
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-white text-center mb-2">How will you use LANTIX Pro?</h1>
        <p className="text-zinc-400 text-center mb-8">You can only pick one for this account.</p>
        <div className="grid md:grid-cols-2 gap-4">
          <button onClick={() => set('company')} className="text-left p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-violet-500 transition group">
            <Building2 className="h-8 w-8 text-violet-400 mb-3" />
            <h3 className="text-xl font-semibold text-white">I'm a Company</h3>
            <p className="text-zinc-400 mt-2 text-sm">Production house, venue or promoter. Post jobs & RFPs, browse crew. $300/mo.</p>
          </button>
          <button onClick={() => set('crew')} className="text-left p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-violet-500 transition">
            <Users className="h-8 w-8 text-violet-400 mb-3" />
            <h3 className="text-xl font-semibold text-white">I'm Crew</h3>
            <p className="text-zinc-400 mt-2 text-sm">Engineer or stagehand. Build a profile, get SMS'd when jobs match. Free.</p>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Skill picker ---------------- */
function SkillPicker({ value, onChange }) {
  const toggle = (s) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])
  return (
    <div className="space-y-4">
      {Object.entries(SKILL_CATEGORIES).map(([cat, skills]) => (
        <div key={cat}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">{cat}</p>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <button type="button" key={s} onClick={() => toggle(s)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${value.includes(s) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-zinc-600 border-zinc-300 hover:border-violet-400'}`}>
                {value.includes(s) && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />}{s}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Certs editor ---------------- */
function CertsEditor({ value, onChange }) {
  const [name, setName] = useState(CERT_TYPES[0])
  const [expiry, setExpiry] = useState('')
  const [file, setFile] = useState(null)
  const onFile = (e) => { const fl = e.target.files?.[0]; if (!fl) return; const r = new FileReader(); r.onload = () => setFile({ file: r.result, fileType: fl.type, fileName: fl.name }); r.readAsDataURL(fl) }
  const add = () => {
    if (!name) return
    onChange([...(value || []), { name, expiry, file: file?.file || '', fileType: file?.fileType || '', fileName: file?.fileName || '' }])
    setExpiry(''); setFile(null)
  }
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-zinc-50 border">
        <div><Label className="text-xs mb-1 block">Certification / License</Label>
          <Select value={name} onValueChange={setName}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{CERT_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        </div>
        <div><Label className="text-xs mb-1 block">Expires</Label><Input type="date" className="w-40" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
        <div><Label className="text-xs mb-1 block">File (PDF/JPG)</Label>
          <label className="inline-flex items-center gap-1 text-sm text-violet-600 cursor-pointer border rounded-md px-3 h-10 bg-white"><UserCircle className="h-4 w-4" />{file ? 'Attached ✓' : 'Upload'}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} /></label>
        </div>
        <Button type="button" onClick={add} variant="outline"><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(value || []).map((c, i) => {
          const soon = certExpSoon(c.expiry)
          return (
            <div key={i} className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full border text-sm ${soon ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="font-medium">{c.name}</span>
              {c.expiry && <span className="text-xs opacity-80">exp {c.expiry}{soon ? ' ⚠' : ''}</span>}
              {c.file && <a href={c.file} target="_blank" className="text-xs underline">view</a>}
              <button type="button" onClick={() => remove(i)} className="hover:opacity-70"><X className="h-3.5 w-3.5" /></button>
            </div>
          )
        })}
        {!(value || []).length && <p className="text-xs text-zinc-400">No certifications added yet.</p>}
      </div>
    </div>
  )
}

/* ---------------- Crew Editor ---------------- */
function CrewEditor({ user, first, onDone, existing }) {
  const [f, setF] = useState({
    fullName: existing?.fullName || user?.name || '', photo: existing?.photo || user?.picture || '',
    cell: existing?.cell || '', email: existing?.email || user?.email || '', skills: existing?.skills || [],
    dayRate: existing?.dayRate || 500,
    regularRate: existing?.regularRate || existing?.dayRate || 500,
    overtimeRate: existing?.overtimeRate || 75,
    travelRate: existing?.travelRate || 350,
    holidayRate: existing?.holidayRate || 750,
    emergencyRate: existing?.emergencyRate || 850,
    city: existing?.city || '', state: normalizeState(existing?.state), available: existing?.available !== false,
    unionMember: !!existing?.unionMember, bio: existing?.bio || '', certs: existing?.certs || [],
    smsConsent: existing?.smsConsent || false,
  })
  const [saving, setSaving] = useState(false)
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const onPhoto = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const r = new FileReader(); r.onload = () => upd('photo', r.result); r.readAsDataURL(file)
  }
  const save = async () => {
    if (!f.fullName || !f.skills.length) return toast.error('Add your name and at least one skill')
    if (f.cell && !f.smsConsent) return toast.error('Please check the SMS consent box to receive job texts (or clear your cell number)')
    setSaving(true)
    try { await api('/crew/profile', { method: 'POST', body: { ...f, primaryCategory: catOf(f.skills[0]) } }); toast.success('Profile saved'); await onDone() }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Wrapper first={first} title="Your crew profile" subtitle="Companies see this. Contact stays hidden until they book you.">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="flex flex-col items-center gap-3">
          <Avatar className="h-32 w-32"><AvatarImage src={f.photo} /><AvatarFallback>{f.fullName?.[0] || '?'}</AvatarFallback></Avatar>
          <Label className="cursor-pointer text-sm text-violet-600 font-medium">
            Upload photo<input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
          </Label>
        </div>
        <div className="md:col-span-2 grid sm:grid-cols-2 gap-4">
          <Field label="Full name"><Input value={f.fullName} onChange={(e) => upd('fullName', e.target.value)} /></Field>
          <Field label="Cell (for job SMS)"><Input value={f.cell} onChange={(e) => upd('cell', e.target.value)} placeholder="+1 617 555 0123" /></Field>
          <Field label="Email"><Input value={f.email} onChange={(e) => upd('email', e.target.value)} /></Field>
          <Field label="City"><Input aria-label="City" value={f.city} onChange={(e) => upd('city', e.target.value)} maxLength={100} placeholder="Enter city" /></Field>
          <Field label="State"><StateSelect value={f.state} onChange={(v) => upd('state', v)} /></Field>
          <Field label="10hr Day Rate ($)"><Input type="number" value={f.dayRate} onChange={(e) => { upd('dayRate', e.target.value); upd('regularRate', e.target.value) }} /></Field>
          <Field label="Regular Overtime Rate ($/hr)"><Input type="number" value={f.overtimeRate} onChange={(e) => upd('overtimeRate', e.target.value)} placeholder="75" /></Field>
          <Field label="Travel Rate ($/day)"><Input type="number" value={f.travelRate} onChange={(e) => upd('travelRate', e.target.value)} placeholder="350" /></Field>
          <Field label="Holiday Rate ($/day)"><Input type="number" value={f.holidayRate} onChange={(e) => upd('holidayRate', e.target.value)} placeholder="750" /></Field>
          <Field label="Emergency Call Rate ($/day)"><Input type="number" value={f.emergencyRate} onChange={(e) => upd('emergencyRate', e.target.value)} placeholder="850" /></Field>
          <div className="flex gap-6 items-end pb-2">
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.available} onCheckedChange={(v) => upd('available', v)} /> Available</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.unionMember} onCheckedChange={(v) => upd('unionMember', v)} /> Union</label>
          </div>
        </div>
      </div>
      <label className="mt-6 flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 cursor-pointer">
        <Checkbox checked={f.smsConsent} onCheckedChange={(v) => upd('smsConsent', !!v)} className="mt-0.5" />
        <span className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-800">I agree to receive job-related SMS from LANTIX Pro</span> (operated by True Life Entertainment LLC) at the mobile number above — job match alerts, booking confirmations, and schedule/cancellation notices. Message frequency varies; message &amp; data rates may apply. Reply STOP to opt out, HELP for help. See our Terms &amp; Privacy Policy.
        </span>
      </label>
      <div className="mt-6"><Label className="mb-3 block font-medium">Skills</Label><SkillPicker value={f.skills} onChange={(v) => upd('skills', v)} /></div>
      <div className="mt-6"><Label className="mb-3 block font-medium">Certifications &amp; Licenses</Label><CertsEditor value={f.certs} onChange={(v) => upd('certs', v)} /></div>
      <div className="mt-6"><Field label="Short bio"><Textarea value={f.bio} onChange={(e) => upd('bio', e.target.value)} rows={3} /></Field></div>
      <Button onClick={save} disabled={saving} className="mt-6 bg-violet-600 hover:bg-violet-500">{saving ? 'Saving…' : 'Save profile'}</Button>
      <div className="mt-8 pt-6 border-t">
        <DocumentVault user={user} isOwner={true} />
      </div>
      {existing && <AccountTypeSwitch current="crew" />}
      {existing && <DangerZone label="crew account" />}
    </Wrapper>
  )
}
function catOf(skill) { for (const [c, arr] of Object.entries(SKILL_CATEGORIES)) if (arr.includes(skill)) return c; return '' }

/* ---------------- Danger zone: self-service account deletion ---------------- */
function DangerZone({ label }) {
  const [busy, setBusy] = useState(false)
  const del = async () => {
    if (!confirm(`Permanently delete your ${label || 'account'}? This removes your profile and all related jobs/applications. This cannot be undone.`)) return
    if (!confirm('Are you absolutely sure? This is permanent and immediate.')) return
    setBusy(true)
    try { await api('/account', { method: 'DELETE' }); toast.success('Your account has been deleted'); setTimeout(() => { window.location.href = '/' }, 900) }
    catch (e) { toast.error(e.message); setBusy(false) }
  }
  return (
    <div className="mt-8 rounded-xl border border-red-200 bg-red-50/50 p-5">
      <h3 className="text-sm font-semibold text-red-600 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Danger zone</h3>
      <p className="text-xs text-zinc-500 mt-1 mb-3">Permanently delete your {label || 'account'}, profile, and all related data (jobs, applications, messages). This cannot be undone.</p>
      <Button variant="outline" onClick={del} disabled={busy} className="border-red-300 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4 mr-1" />{busy ? 'Deleting…' : 'Delete my account'}</Button>
    </div>
  )
}

/* ---------------- Switch account type (Crew <-> Company) ---------------- */
function AccountTypeSwitch({ current }) {
  const other = current === 'company' ? 'crew' : 'company'
  const otherLabel = other === 'company' ? 'Company' : 'Crew'
  const [busy, setBusy] = useState(false)
  const switchRole = async () => {
    if (!confirm(`Switch this account to ${otherLabel}? You can switch back anytime — your current profile is kept.`)) return
    setBusy(true)
    try { await api('/auth/role', { method: 'POST', body: { role: other } }); toast.success(`Switched to ${otherLabel}`); setTimeout(() => window.location.reload(), 700) }
    catch (e) { toast.error(e.message); setBusy(false) }
  }
  return (
    <div className="mt-6 rounded-xl border p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2"><UserCircle className="h-4 w-4 text-violet-600" /> Account type</h3>
      <p className="text-xs text-zinc-500 mt-1 mb-3">You're currently set up as <span className="font-semibold capitalize">{current}</span>. Picked the wrong one? Switch anytime — your current profile is saved in case you switch back.</p>
      <Button variant="outline" onClick={switchRole} disabled={busy}>{busy ? 'Switching…' : `Switch to ${otherLabel}`}</Button>
    </div>
  )
}

/* ---------------- Company welcome (first-time onboarding) ---------------- */
function CompanyWelcome({ open, company, onClose, onPostJob }) {
  const [step, setStep] = useState(0)
  const steps = [
    { icon: Sparkles, title: `Welcome${company?.name ? ', ' + company.name : ''}!`, body: 'Your company account is all set. LANTIX Pro connects you with vetted live-event crew across Massachusetts.' },
    { icon: Users, title: 'Find & book crew', body: 'Browse the crew directory by role, skill and city. Subscribe ($300/mo) to unlock contact details and start booking.' },
    { icon: Briefcase, title: 'Post jobs & RFPs', body: "Post a job and we'll match and text qualified crew automatically. Ready to staff your first show?" },
  ]
  const s = steps[step]
  const Icon = s.icon
  const last = step === steps.length - 1
  return (
    <Dialog open={!!open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md" data-testid="company-welcome-dialog">
        <div className="flex flex-col items-center text-center gap-3 py-3">
          <div className="h-14 w-14 rounded-2xl bg-violet-100 flex items-center justify-center"><Icon className="h-7 w-7 text-violet-600" /></div>
          <h2 className="text-xl font-bold">{s.title}</h2>
          <p className="text-sm text-zinc-500">{s.body}</p>
          <div className="flex gap-1.5 mt-1">{steps.map((_, i) => (<span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-violet-600' : 'w-1.5 bg-zinc-300'}`} />))}</div>
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          <Button variant="ghost" onClick={onClose} data-testid="welcome-dialog-skip">{last ? 'Maybe later' : 'Skip'}</Button>
          {last
            ? <Button onClick={onPostJob} className="bg-violet-600 hover:bg-violet-500" data-testid="welcome-dialog-post-job"><Plus className="h-4 w-4 mr-1" /> Post your first job</Button>
            : <Button onClick={() => setStep(step + 1)} className="bg-violet-600 hover:bg-violet-500" data-testid="welcome-dialog-next">Next</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


/* ---------------- Company Editor ---------------- */
function CompanyEditor({ first, onDone, existing }) {
  const [f, setF] = useState({
    name: existing?.name || '', companyType: existing?.companyType || 'Production House', logo: existing?.logo || '',
    phone: existing?.phone || '', email: existing?.email || '', website: existing?.website || '',
    city: existing?.city || '', state: normalizeState(existing?.state), description: existing?.description || '',
  })
  const [saving, setSaving] = useState(false)
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const onLogo = (e) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => upd('logo', r.result); r.readAsDataURL(file) }
  const save = async () => {
    if (!f.name) return toast.error('Company name is required')
    setSaving(true)
    try { await api('/companies/profile', { method: 'POST', body: f }); toast.success('Company saved'); await onDone() }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Wrapper first={first} title="Your company profile" subtitle="Other companies can find you in the directory. Pay to unlock crew contact + posting.">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="flex flex-col items-center gap-3">
          <Avatar className="h-28 w-28 rounded-xl"><AvatarImage src={f.logo} className="object-cover" /><AvatarFallback className="rounded-xl">{f.name?.[0] || 'C'}</AvatarFallback></Avatar>
          <Label className="cursor-pointer text-sm text-violet-600 font-medium">Upload logo<input type="file" accept="image/*" className="hidden" onChange={onLogo} /></Label>
        </div>
        <div className="md:col-span-2 grid sm:grid-cols-2 gap-4">
          <Field label="Company name"><Input value={f.name} onChange={(e) => upd('name', e.target.value)} /></Field>
          <Field label="Type"><Select value={f.companyType} onValueChange={(v) => upd('companyType', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => upd('phone', e.target.value)} /></Field>
          <Field label="Email"><Input value={f.email} onChange={(e) => upd('email', e.target.value)} /></Field>
          <Field label="Website"><Input value={f.website} onChange={(e) => upd('website', e.target.value)} /></Field>
          <Field label="City"><Input aria-label="City" value={f.city} onChange={(e) => upd('city', e.target.value)} maxLength={100} placeholder="Enter city" /></Field>
          <Field label="State"><StateSelect value={f.state} onChange={(v) => upd('state', v)} /></Field>
        </div>
      </div>
      <div className="mt-6"><Field label="Description"><Textarea value={f.description} onChange={(e) => upd('description', e.target.value)} rows={3} /></Field></div>
      <Button onClick={save} disabled={saving} className="mt-6 bg-violet-600 hover:bg-violet-500">{saving ? 'Saving…' : 'Save company'}</Button>
      <div className="mt-8 pt-6 border-t space-y-8">
        <CompanyTeam company={existing} />
        <DocumentVault companyId={existing?.id} isOwner={true} />
      </div>
      {existing && <AccountTypeSwitch current="company" />}
      {existing && <DangerZone label="company account" />}
    </Wrapper>
  )
}

/* ---------------- Crew Directory ---------------- */
function CrewDirectory({ company }) {
  const [list, setList] = useState([])
  const [paid, setPaid] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [viewMode, setViewMode] = useState('all') // 'all', 'favourites', 'previous'
  const [favourites, setFavourites] = useState([])
  const [ff, setFF] = useState({ q: '', skill: 'all', city: 'all', state: 'all', minRate: '', union: false, available: false, certs: [] })

  const loadFavourites = useCallback(async () => {
    try {
      const d = await api('/company/favourites')
      setFavourites(d.favourites || [])
    } catch {}
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    if (viewMode === 'favourites') {
      const d = await api('/company/favourites')
      setList(d.favourites || [])
      setPaid(!!company?.paidVerified)
      setLoading(false)
      return
    }
    if (viewMode === 'previous') {
      const d = await api('/company/previous-crew')
      setList((d.previousCrew || []).map((p) => ({ ...p.profile, lastShow: p.lastShow, showsWorked: p.showsWorked, lastRole: p.lastRole })).filter((c) => !!c.id))
      setPaid(!!company?.paidVerified)
      setLoading(false)
      return
    }

    const p = new URLSearchParams()
    if (ff.q) p.set('q', ff.q); if (ff.skill !== 'all') p.set('skill', ff.skill); if (ff.city !== 'all') p.set('city', ff.city); if (ff.state !== 'all') p.set('state', ff.state)
    if (ff.minRate) p.set('minRate', ff.minRate); if (ff.union) p.set('union', 'true'); if (ff.available) p.set('available', 'true')
    ff.certs.forEach((c) => p.append('cert', c))
    const d = await api('/crew?' + p.toString()); setList(d.crew); setPaid(d.paid); setLoading(false)
  }, [ff, viewMode, company?.paidVerified])

  useEffect(() => { load(); loadFavourites() }, [load, loadFavourites])

  const toggleFavourite = async (e, crewId) => {
    e.stopPropagation()
    try {
      const res = await api('/company/favourites', { method: 'POST', body: { crewId } })
      if (res.favourited) {
        toast.success('Added to Favourite Crew')
      } else {
        toast.success('Removed from Favourite Crew')
      }
      loadFavourites()
      if (viewMode === 'favourites') load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const isFav = (id) => favourites.some((f) => f.id === id)

  return (
    <div className="space-y-5">
      {!paid && <LockBanner text="Subscribe to unlock crew phone & email. Browsing is open — contact is gated." />}

      {/* Directory Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={viewMode === 'all' ? 'default' : 'outline'}
            className={viewMode === 'all' ? 'bg-violet-600 hover:bg-violet-700' : ''}
            onClick={() => setViewMode('all')}
          >
            All Crew Directory
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'favourites' ? 'default' : 'outline'}
            className={viewMode === 'favourites' ? 'bg-violet-600 hover:bg-violet-700' : ''}
            onClick={() => setViewMode('favourites')}
          >
            <Heart className="h-3.5 w-3.5 mr-1.5 fill-current text-rose-500" />
            Favourite Crew ({favourites.length})
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'previous' ? 'default' : 'outline'}
            className={viewMode === 'previous' ? 'bg-violet-600 hover:bg-violet-700' : ''}
            onClick={() => setViewMode('previous')}
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Previous Teams & Shows
          </Button>
        </div>
      </div>

      {viewMode === 'all' && (
        <>
          <FilterBar>
            <SearchInput value={ff.q} onChange={(v) => setFF((p) => ({ ...p, q: v }))} placeholder="Search name…" />
            <SkillFilter value={ff.skill} onChange={(v) => setFF((p) => ({ ...p, skill: v }))} />
            <StateSelect value={ff.state} onChange={(v) => setFF((p) => ({ ...p, state: v }))} allowAll className="h-10 w-44 rounded-lg border border-input bg-card px-3 text-sm" />
            <CitySelect value={ff.city} onChange={(v) => setFF((p) => ({ ...p, city: v }))} allowAll />
            <Input type="number" placeholder="Max rate" className="w-32" value={ff.minRate} onChange={(e) => setFF((p) => ({ ...p, minRate: e.target.value }))} />
            <ToggleChip active={ff.available} onClick={() => setFF((p) => ({ ...p, available: !p.available }))}>Available</ToggleChip>
            <ToggleChip active={ff.union} onClick={() => setFF((p) => ({ ...p, union: !p.union }))}>Union</ToggleChip>
          </FilterBar>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Certs:</span>
            {['OSHA', 'ETCP', 'Rigger Cert', 'CDL', 'Forklift'].map((c) => {
              const on = ff.certs.includes(c)
              return <ToggleChip key={c} active={on} onClick={() => setFF((p) => ({ ...p, certs: on ? p.certs.filter((x) => x !== c) : [...p.certs, c] }))}>{c}</ToggleChip>
            })}
          </div>
        </>
      )}

      {loading ? <Loading /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((c) => (
            <CrewCard
              key={c.id}
              c={c}
              isFavourite={isFav(c.id)}
              onToggleFav={(e) => toggleFavourite(e, c.id)}
              onClick={() => setDetail(c)}
            />
          ))}
          {!list.length && <Empty text={viewMode === 'favourites' ? 'No favourite crew saved yet. Click the heart icon on any crew profile to bookmark them.' : viewMode === 'previous' ? 'No previous team members found yet. Crew members assigned to your shows will appear here.' : 'No crew match your filters.'} />}
        </div>
      )}
      <CrewDetailDialog crew={detail} company={company} onClose={() => setDetail(null)} paid={paid} />
    </div>
  )
}

function CrewCard({ c, onClick, isFavourite, onToggleFav }) {
  return (
    <Card className="cursor-pointer hover:shadow-lg hover:border-violet-300 transition relative" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="h-14 w-14"><AvatarImage src={c.photo} /><AvatarFallback>{c.fullName?.[0]}</AvatarFallback></Avatar>
            <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${c.available ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold truncate">{c.fullName}</p>
              {c.unionMember && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600">Union</Badge>}
            </div>
            <p className="text-xs text-zinc-500">{c.primaryCategory}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500"><MapPin className="h-3 w-3" /> {[c.city, c.state].filter(Boolean).join(', ')} <Stars value={c.ratingAvg} /></div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {onToggleFav && (
              <button
                type="button"
                onClick={onToggleFav}
                className="text-muted-foreground hover:text-rose-500 transition-colors p-1"
                aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
              >
                <Heart className={`h-4 w-4 ${isFavourite ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
            )}
            <div className="text-right">
              <p className="text-lg font-bold text-violet-600">${c.dayRate || c.regularRate}</p>
              <p className="text-[10px] text-zinc-400 -mt-1">/10hr</p>
            </div>
          </div>
        </div>

        {c.lastShow && (
          <div className="mt-2.5 text-[11px] bg-violet-50/50 dark:bg-violet-950/20 text-violet-800 dark:text-violet-300 px-2 py-1 rounded border border-violet-200">
            Past show: <span className="font-semibold">{c.lastShow}</span> ({c.lastRole})
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mt-3">
          {c.skills?.slice(0, 4).map((s) => <Badge key={s} variant="secondary" className="text-[11px] font-normal">{s}</Badge>)}
        </div>
        {c.certs?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {c.certs.slice(0, 4).map((ct, i) => {
              const soon = certExpSoon(ct.expiry)
              return <Badge key={i} variant="outline" className={`text-[10px] gap-0.5 ${soon ? 'border-amber-400 text-amber-700' : 'border-blue-300 text-blue-700'}`}><ShieldCheck className="h-3 w-3" />{ct.name}{soon ? ' ⚠' : ''}</Badge>
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CrewDetailDialog({ crew, onClose, paid, company }) {
  const [msg, setMsg] = useState(false)
  if (!crew) return null

  const dayRate = crew.dayRate || crew.regularRate || 500
  const otRate = crew.overtimeRate || Math.round(dayRate / 10 * 1.5)
  const travelRate = crew.travelRate || Math.round(dayRate * 0.7)
  const holidayRate = crew.holidayRate || Math.round(dayRate * 1.5)
  const emergencyRate = crew.emergencyRate || Math.round(dayRate * 1.7)

  return (
    <Dialog open={!!crew} onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-border sm:max-w-2xl">
        <DialogHeader><DialogTitle>Crew Profile & Verified Work History</DialogTitle></DialogHeader>
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20"><AvatarImage src={crew.photo} /><AvatarFallback>{crew.fullName?.[0]}</AvatarFallback></Avatar>
          <div>
            <div className="flex items-center gap-2"><h3 className="text-xl font-bold">{crew.fullName}</h3>{crew.unionMember && <Badge variant="outline" className="border-violet-300 text-violet-600">Union</Badge>}</div>
            <p className="text-sm text-zinc-500">{crew.primaryCategory} · {[crew.city, crew.state].filter(Boolean).join(', ')}</p>
            <div className="flex items-center gap-3 mt-1"><Stars value={crew.ratingAvg} /><span className="text-xs text-zinc-400">{crew.ratingCount} reviews</span></div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold text-violet-600">${dayRate}</p>
            <p className="text-xs text-zinc-400 -mt-1">/10hr day rate</p>
          </div>
        </div>

        {/* 5 Rate Tiers Breakdown */}
        <div className="space-y-1.5 pt-2">
          <p className="text-xs font-semibold uppercase text-zinc-500">Rate Tiers & Terms</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2 rounded border bg-muted/20">
              <div className="text-[10px] text-muted-foreground">10hr Day</div>
              <div className="font-bold text-foreground mt-0.5">${dayRate}</div>
            </div>
            <div className="p-2 rounded border bg-muted/20">
              <div className="text-[10px] text-muted-foreground">Overtime</div>
              <div className="font-bold text-foreground mt-0.5">${otRate}/hr</div>
            </div>
            <div className="p-2 rounded border bg-muted/20">
              <div className="text-[10px] text-muted-foreground">Travel Day</div>
              <div className="font-bold text-foreground mt-0.5">${travelRate}</div>
            </div>
            <div className="p-2 rounded border bg-muted/20">
              <div className="text-[10px] text-muted-foreground">Holiday</div>
              <div className="font-bold text-foreground mt-0.5">${holidayRate}</div>
            </div>
            <div className="p-2 rounded border bg-muted/20 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-muted-foreground">Emergency</div>
              <div className="font-bold text-foreground mt-0.5">${emergencyRate}</div>
            </div>
          </div>
        </div>

        {crew.bio && <p className="text-sm text-zinc-600 mt-2">{crew.bio}</p>}
        <div><p className="text-xs font-semibold uppercase text-zinc-500 mb-2">Skills</p><div className="flex flex-wrap gap-1.5">{crew.skills?.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div></div>
        {crew.certs?.length > 0 && (
          <div><p className="text-xs font-semibold uppercase text-zinc-500 mb-2">Certifications</p>
            <div className="flex flex-wrap gap-2">
              {crew.certs.map((ct, i) => {
                const soon = certExpSoon(ct.expiry)
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs ${soon ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                    <ShieldCheck className="h-3.5 w-3.5" /> {ct.name}{ct.expiry ? ` · exp ${ct.expiry}${soon ? ' ⚠' : ''}` : ''}
                    {ct.file && <a href={ct.file} target="_blank" className="underline ml-1">view</a>}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Public Work History */}
        {(crew.workHistory || []).length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-semibold uppercase text-zinc-500">Verified Work History ({crew.workHistory.length})</p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs">
              {crew.workHistory.map((w, i) => (
                <div key={i} className="p-2 rounded bg-muted/20 border flex items-center justify-between">
                  <div>
                    <span className="font-medium text-foreground">{w.showTitle}</span>
                    <span className="text-muted-foreground ml-2">· {w.department} ({w.role})</span>
                  </div>
                  <div className="text-muted-foreground text-[11px]">{w.city}, {w.state} {w.year ? `(${w.year})` : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verified Reviews Component */}
        <CrewReviewsSection crewId={crew.id} company={company} />

        <Separator />
        {crew.contactLocked || !paid ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 bg-zinc-100 rounded-lg p-3"><Lock className="h-4 w-4" /> Contact unlocks after you subscribe & book this crew.</div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-violet-600" /> {crew.cell}</p>
            <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-violet-600" /> {crew.email}</p>
          </div>
        )}
        <Button variant="outline" onClick={() => setMsg(true)} className="w-full"><MessageSquare className="h-4 w-4 mr-1" /> Send private message</Button>
        <MessageDialog to={msg ? crew : null} onClose={() => setMsg(false)} />
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Company Directory ---------------- */
function CompanyDirectory() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true)
  const [ff, setFF] = useState({ q: '', city: 'all', type: 'all' })
  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (ff.q) p.set('q', ff.q); if (ff.city !== 'all') p.set('city', ff.city); if (ff.type !== 'all') p.set('type', ff.type)
    const d = await api('/companies?' + p.toString()); setList(d.companies); setLoading(false)
  }, [ff])
  useEffect(() => { load() }, [load])
  return (
    <div className="space-y-5">
      <FilterBar>
        <SearchInput value={ff.q} onChange={(v) => setFF((p) => ({ ...p, q: v }))} placeholder="Search production houses…" />
        <CitySelect value={ff.city} onChange={(v) => setFF((p) => ({ ...p, city: v }))} allowAll />
        <Select value={ff.type} onValueChange={(v) => setFF((p) => ({ ...p, type: v }))}><SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
      </FilterBar>
      {loading ? <Loading /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((c) => (
            <Card key={c.id} className="hover:shadow-lg transition">
              <CardContent className="p-5 flex items-start gap-3">
                <Avatar className="h-14 w-14 rounded-xl"><AvatarImage src={c.logo} className="object-cover" /><AvatarFallback className="rounded-xl">{c.name?.[0]}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><p className="font-semibold truncate">{c.name}</p>{c.paidVerified && <ShieldCheck className="h-4 w-4 text-emerald-500" />}</div>
                  <p className="text-xs text-zinc-500">{c.companyType}</p>
                  <p className="flex items-center gap-1 text-xs text-zinc-500 mt-1"><MapPin className="h-3 w-3" /> {[c.city, c.state].filter(Boolean).join(', ')}</p>
                  <div className="flex gap-3 mt-2 text-xs text-zinc-400">
                    {c.website && <a href={c.website} target="_blank" className="hover:text-violet-600 flex items-center gap-1"><Globe className="h-3 w-3" /> Site</a>}
                    {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!list.length && <Empty text="No companies found." />}
        </div>
      )}
    </div>
  )
}

/* ---------------- Services & ADA Directory ---------------- */
function ServicesDirectory() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true)
  const [ff, setFF] = useState({ q: '', category: 'all', city: 'all' })
  const [adding, setAdding] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (ff.q) p.set('q', ff.q); if (ff.category !== 'all') p.set('category', ff.category); if (ff.city !== 'all') p.set('city', ff.city)
    const d = await api('/services?' + p.toString()); setList(d.services); setLoading(false)
  }, [ff])
  useEffect(() => { load() }, [load])
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">Catering, transportation, travel, legal, talent, makeup — plus <span className="font-semibold text-zinc-700">ADA</span> ASL signers & translators.</p>
        <Button onClick={() => setAdding(true)} className="bg-violet-600 hover:bg-violet-500"><Plus className="h-4 w-4 mr-1" /> List a service</Button>
      </div>
      <FilterBar>
        <SearchInput value={ff.q} onChange={(v) => setFF((p) => ({ ...p, q: v }))} placeholder="Search services…" />
        <Select value={ff.category} onValueChange={(v) => setFF((p) => ({ ...p, category: v }))}><SelectTrigger className="w-64"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent className="max-h-72"><SelectItem value="all">All categories</SelectItem>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <CitySelect value={ff.city} onChange={(v) => setFF((p) => ({ ...p, city: v }))} allowAll />
      </FilterBar>
      {loading ? <Loading /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((s) => {
            const ada = s.category.startsWith('ADA')
            return (
              <Card key={s.id} className="hover:shadow-lg transition">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${ada ? 'bg-blue-100' : 'bg-violet-100'}`}>
                      {ada ? <Accessibility className="h-5 w-5 text-blue-600" /> : <HeartHandshake className="h-5 w-5 text-violet-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{s.name}</p>
                      <Badge variant="secondary" className={`mt-1 text-[11px] ${ada ? 'bg-blue-100 text-blue-700' : ''}`}>{s.category}</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-500 mt-3 line-clamp-2">{s.description}</p>
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[s.city, s.state].filter(Boolean).join(', ')}</span>
                    {s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {s.phone}</span>}
                    {s.website && <a href={s.website} target="_blank" className="flex items-center gap-1 hover:text-violet-600"><Globe className="h-3 w-3" /> Site</a>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {!list.length && <Empty text="No services found in this category." />}
        </div>
      )}
      <AddServiceDialog open={adding} onClose={() => setAdding(false)} onAdded={load} />
    </div>
  )
}

function AddServiceDialog({ open, onClose, onAdded }) {
  const [f, setF] = useState({ name: '', category: SERVICE_CATEGORIES[0], city: '', state: '', phone: '', email: '', website: '', description: '' })
  const [saving, setSaving] = useState(false)
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    if (!f.name) return toast.error('Add a business name')
    setSaving(true)
    try { await api('/services', { method: 'POST', body: f }); toast.success('Service listed'); onClose(); await onAdded() }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-border sm:max-w-2xl">
        <DialogHeader><DialogTitle>List a service</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Business name"><Input value={f.name} onChange={(e) => upd('name', e.target.value)} /></Field>
          <Field label="Category"><Select value={f.category} onValueChange={(v) => upd('category', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-72">{SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><Input value={f.city} onChange={(e) => upd('city', e.target.value)} placeholder="Enter city" maxLength={100} /></Field>
            <Field label="State"><StateSelect value={f.state} onChange={(v) => upd('state', v)} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => upd('phone', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><Input value={f.email} onChange={(e) => upd('email', e.target.value)} /></Field>
            <Field label="Website"><Input value={f.website} onChange={(e) => upd('website', e.target.value)} /></Field>
          </div>
          <Field label="Description"><Textarea rows={3} value={f.description} onChange={(e) => upd('description', e.target.value)} /></Field>
          <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-500 w-full">{saving ? 'Saving…' : 'List service'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Jobs Board ---------------- */
function JobsBoard({ user, onGoApplications }) {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ff, setFF] = useState({ role: 'all', city: 'all', state: 'all', union: false, minRate: '', companyType: 'all' })
  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (ff.role !== 'all') p.set('role', ff.role); if (ff.city !== 'all') p.set('city', ff.city); if (ff.state !== 'all') p.set('state', ff.state)
    if (ff.union) p.set('union', 'true'); if (ff.minRate) p.set('minRate', ff.minRate); if (ff.companyType !== 'all') p.set('companyType', ff.companyType)
    setError('')
    try { const d = await api('/jobs?' + p.toString()); setList(d.jobs || []) }
    catch (err) { setError(err.message); setList([]) }
    finally { setLoading(false) }
  }, [ff])
  useEffect(() => { load() }, [load])
  const [applied, setApplied] = useState({})
  const [managing, setManaging] = useState(null)
  const [detail, setDetail] = useState(null)
  const apply = async (job) => {
    try { await api(`/jobs/${job.id}/apply`, { method: 'POST' }); setApplied((p) => ({ ...p, [job.id]: true })); toast.success('Applied! Company will review your profile.') }
    catch (e) { toast.error(e.message) }
  }
  const isCrew = user.role === 'crew'
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft"><h2 className="text-xl font-semibold">{isCrew ? 'Find your next crew call' : 'Open jobs & crew calls'}</h2><p className="mt-1 text-sm text-muted-foreground">Explore live-event work by role, location, and rate.</p></div>
      <FilterBar>
        <SkillFilter value={ff.role} onChange={(v) => setFF((p) => ({ ...p, role: v }))} label="Role" />
        <StateSelect value={ff.state} onChange={(v) => setFF((p) => ({ ...p, state: v }))} allowAll className="h-10 w-44 rounded-lg border border-input bg-card px-3 text-sm" />
        <CitySelect value={ff.city} onChange={(v) => setFF((p) => ({ ...p, city: v }))} allowAll />
        <Select value={ff.companyType} onValueChange={(v) => setFF((p) => ({ ...p, companyType: v }))}><SelectTrigger className="w-40"><SelectValue placeholder="Company type" /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
        <Input type="number" placeholder="Min rate" className="w-28" value={ff.minRate} onChange={(e) => setFF((p) => ({ ...p, minRate: e.target.value }))} />
        <ToggleChip active={ff.union} onClick={() => setFF((p) => ({ ...p, union: !p.union }))}>Union only</ToggleChip>
      </FilterBar>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-muted-foreground">{loading ? 'Loading open calls…' : `${list.length} opportunities`}</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
      {loading ? <Loading /> : (
        <div className="grid gap-3">
          {list.map((j) => (
            <Card key={j.id} className="border-border shadow-soft transition hover:border-primary/30">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2"><h3 className="font-bold text-lg">{j.role}</h3>{j.union && <Badge variant="outline" className="border-violet-300 text-violet-600 text-[10px]">Union</Badge>}</div>
                    <p className="text-sm text-zinc-500">{j.companyName} · {j.companyType}</p>
                  </div>
                  <div className="text-right"><p className="text-xl font-bold text-violet-600">${j.dayRate}</p><p className="text-[10px] text-zinc-400 -mt-1">/10hr</p></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm text-zinc-600">
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-zinc-400" /> {[j.city, j.state].filter(Boolean).join(', ')}</span>
                  <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-zinc-400" /> {j.date}</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-zinc-400" /> Call {j.callTime}</span>
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-zinc-400" /> {j.crewCount} needed</span>
                </div>
                {j.description && <p className="text-sm text-zinc-500 mt-3 line-clamp-2">{j.description}</p>}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDetail(j)}><MapIcon className="h-3.5 w-3.5 mr-1" /> Details</Button>
                  {isCrew && <Button size="sm" onClick={() => apply(j)} disabled={applied[j.id]} className="bg-violet-600 hover:bg-violet-500">{applied[j.id] ? 'Applied ✓' : 'Apply'}</Button>}
                  {user.role === 'company' && j.userId === user.id && <Button size="sm" variant="outline" onClick={() => setManaging(j)}>View applicants</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
          {!list.length && <Empty text="No jobs match your filters." />}
        </div>
      )}
      <ApplicantsDialog job={managing} onClose={() => setManaging(null)} />
      <JobDetailDialog job={detail} onClose={() => setDetail(null)} isCrew={isCrew} applied={applied} onApply={apply} />
    </div>
  )
}

function JobDetailDialog({ job, onClose, isCrew, applied, onApply }) {
  if (!job) return null
  const q = job.address || `${job.city}${job.state ? ', ' + job.state : ''}`
  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-border sm:max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{job.role}{job.union && <Badge variant="outline" className="border-violet-300 text-violet-600 text-[10px]">Union</Badge>}</DialogTitle></DialogHeader>
        <p className="text-sm text-zinc-500 -mt-2">{job.companyName} · {job.companyType}</p>
        <div className="grid grid-cols-2 gap-2 text-sm text-zinc-700">
          <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-violet-600" /> ${job.dayRate}/10hr</span>
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-zinc-400" /> {job.crewCount} needed</span>
          <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-zinc-400" /> {job.date}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-zinc-400" /> Call {job.callTime}</span>
        </div>
        {job.description && <p className="text-sm text-zinc-600">{job.description}</p>}
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500 mb-1 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {job.address || `${job.city}${job.state ? ', ' + job.state : ''}`}</p>
          <iframe title="jobmap" src={mapSrc(q)} className="w-full h-56 rounded-lg border" loading="lazy" />
          <div className="flex gap-3 mt-1">
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`} target="_blank" className="text-xs text-violet-600 flex items-center gap-1 hover:underline"><ExternalLink className="h-3 w-3" /> Open in Google Maps</a>
            <a href={dirLink(q)} target="_blank" className="text-xs text-violet-600 flex items-center gap-1 hover:underline"><MapIcon className="h-3 w-3" /> Get Directions</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{job.hours || 10}hr day</Badge>
          {job.holidayPay && <Badge className="bg-amber-100 text-amber-700">Holiday pay</Badge>}
          {job.overtimeHours > 0 && <Badge className="bg-orange-100 text-orange-700">OT ~{job.overtimeHours}h</Badge>}
          {job.union && <Badge variant="outline" className="border-violet-300 text-violet-600">Union</Badge>}
        </div>
        {(job.clientName || job.clientContact) && <p className="text-sm text-zinc-600"><span className="font-medium">Client:</span> {job.clientName} {job.clientContact && `· ${job.clientContact}`}</p>}
        {job.plot && <a href={job.plot} target="_blank" className="text-sm text-violet-600 flex items-center gap-1 hover:underline"><FileText className="h-4 w-4" /> View plot / production doc{job.plotName ? ` (${job.plotName})` : ''}</a>}
        <div className="flex gap-2">
          <a href={gcalLink(job)} target="_blank" className="flex-1"><Button variant="outline" className="w-full"><Calendar className="h-4 w-4 mr-1" /> Add to Google Calendar</Button></a>
          <Button variant="outline" onClick={() => downloadIcs(job)}><Calendar className="h-4 w-4 mr-1" /> .ics</Button>
        </div>
        {isCrew && <Button onClick={() => { onApply(job); onClose() }} disabled={applied[job.id]} className="bg-violet-600 hover:bg-violet-500 w-full">{applied[job.id] ? 'Applied ✓' : 'Apply to this job'}</Button>}
      </DialogContent>
    </Dialog>
  )
}

function ApplicantsDialog({ job, onClose }) {
  const [apps, setApps] = useState([]); const [loading, setLoading] = useState(false)
  const load = useCallback(async () => { if (!job) return; setLoading(true); const d = await api(`/jobs/${job.id}/applicants`); setApps(d.applicants); setLoading(false) }, [job])
  useEffect(() => { load() }, [load])
  const confirm = async (applicationId) => { await api(`/jobs/${job.id}/confirm`, { method: 'POST', body: { applicationId } }); toast.success('Crew confirmed — details unlocked to them via SMS'); load() }
  if (!job) return null
  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-border sm:max-w-2xl">
        <DialogHeader><DialogTitle>Applicants — {job.role}</DialogTitle></DialogHeader>
        {loading ? <Loading /> : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {apps.map(({ application, crew }) => (
              <div key={application.id} className="flex items-center gap-3 p-3 rounded-lg border">
                <Avatar className="h-10 w-10"><AvatarImage src={crew?.photo} /><AvatarFallback>{crew?.fullName?.[0]}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{crew?.fullName}</p>
                  <p className="text-xs text-zinc-500">{crew?.primaryCategory} · ${crew?.dayRate}/10hr</p>
                  {application.status === 'confirmed' && crew?.cell && <p className="text-xs text-emerald-600 mt-0.5">{crew.cell} · {crew.email}</p>}
                </div>
                {application.status === 'confirmed'
                  ? <Badge className="bg-emerald-100 text-emerald-700">Confirmed</Badge>
                  : <Button size="sm" className="bg-violet-600 hover:bg-violet-500" onClick={() => confirm(application.id)}>Confirm</Button>}
              </div>
            ))}
            {!apps.length && <Empty text="No applicants yet." />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- My Applications (crew) ---------------- */
function MyApplications() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { const d = await api('/my/applications'); setList(d.applications); setLoading(false) }, [])
  useEffect(() => { load() }, [load])
  const cancel = async (jobId) => {
    try { await api(`/jobs/${jobId}/cancel`, { method: 'POST' }); toast.success('Booking cancelled — the company has been notified.'); load() }
    catch (e) { toast.error(e.message) }
  }
  if (loading) return <Loading />
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {list.map(({ application, job }) => {
        const cancelled = application.status === 'cancelled'
        return (
        <Card key={application.id} className={cancelled ? 'opacity-70' : ''}>
          <CardContent className="p-5">
            <div className="flex justify-between">
              <div><h3 className="font-bold">{job?.role}</h3><p className="text-sm text-zinc-500">{job?.companyName}</p></div>
              {cancelled ? <Badge variant="secondary" className="bg-red-100 text-red-700">Cancelled</Badge>
                : application.status === 'confirmed' ? <Badge className="bg-emerald-100 text-emerald-700">Confirmed</Badge>
                : <Badge variant="secondary">Applied</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm text-zinc-600">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {job?.city}</span>
              <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {job?.date}</span>
              <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> ${job?.dayRate}/10hr</span>
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {job?.callTime}</span>
            </div>
            {application.status === 'confirmed' && job?.companyContact ? (
              <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm space-y-1">
                <p className="font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Details unlocked</p>
                <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {job.companyContact.phone}</p>
                <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {job.companyContact.email}</p>
                <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {job.address || job.companyContact.address}</p>
                <a href={dirLink(job.address || job.companyContact.address)} target="_blank" className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"><MapIcon className="h-3.5 w-3.5" /> Get Directions to job site</a>
                <div className="flex gap-2 pt-1">
                  <a href={gcalLink(job)} target="_blank"><Button size="sm" variant="outline" className="h-7 text-xs"><Calendar className="h-3 w-3 mr-1" /> Add to Calendar</Button></a>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadIcs(job)}>.ics</Button>
                </div>
              </div>
            ) : !cancelled && <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><Lock className="h-3.5 w-3.5" /> Contact unlocks when confirmed.</div>}
            {!cancelled && (
              <Button size="sm" variant="outline" className="mt-3 text-red-600 border-red-200 hover:bg-red-50" onClick={() => cancel(application.jobId)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel booking (24hr notice)
              </Button>
            )}
          </CardContent>
        </Card>
        )
      })}
      {!list.length && <Empty text="You haven't applied to any jobs yet." />}
    </div>
  )
}

/* ---------------- RFP Board ---------------- */
function RFPBoard({ onPost }) {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null)
  useEffect(() => { (async () => { const d = await api('/rfps'); setList(d.rfps); setLoading(false) })() }, [])
  if (loading) return <Loading />
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-zinc-500">Requests for Proposal — production houses bid on projects.</p>
        <Button onClick={onPost} className="bg-violet-600 hover:bg-violet-500"><Plus className="h-4 w-4 mr-1" /> Post RFP</Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {list.map((r) => (
          <Card key={r.id} className="hover:shadow-lg transition cursor-pointer" onClick={() => setActive(r)}>
            <CardContent className="p-5">
              <Badge className="bg-violet-100 text-violet-700 mb-2">RFP</Badge>
              <h3 className="font-bold">{r.title}</h3>
              <p className="text-sm text-zinc-500">{r.companyName}</p>
              <p className="text-sm text-zinc-600 mt-2 line-clamp-2">{r.description}</p>
              <div className="flex gap-4 mt-3 text-sm text-zinc-500">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.city}</span>
                {r.budget > 0 && <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> ~${r.budget.toLocaleString()}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
        {!list.length && <Empty text="No RFPs yet." />}
      </div>
      <RFPDialog rfp={active} onClose={() => setActive(null)} />
    </div>
  )
}

function RFPDialog({ rfp, onClose }) {
  const [data, setData] = useState(null)
  const [f, setF] = useState({ amount: '', message: '' })
  const load = useCallback(async () => { if (!rfp) return; const d = await api(`/rfps/${rfp.id}`); setData(d.rfp) }, [rfp])
  useEffect(() => { load() }, [load])
  const submit = async () => { if (!f.amount) return toast.error('Enter a quote amount'); await api(`/rfps/${rfp.id}/proposals`, { method: 'POST', body: f }); toast.success('Proposal submitted'); setF({ amount: '', message: '' }); load() }
  if (!rfp) return null
  return (
    <Dialog open={!!rfp} onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-border sm:max-w-2xl">
        <DialogHeader><DialogTitle>{rfp.title}</DialogTitle></DialogHeader>
        <p className="text-sm text-zinc-600">{data?.description}</p>
        <div className="flex gap-4 text-sm text-zinc-500"><span><MapPin className="h-3.5 w-3.5 inline" /> {rfp.city}</span>{rfp.budget > 0 && <span><DollarSign className="h-3.5 w-3.5 inline" /> ~${rfp.budget.toLocaleString()}</span>}</div>
        <Separator />
        {data?.isOwner ? (
          <div>
            <p className="font-semibold text-sm mb-2">Proposals ({data.proposalCount})</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.proposals?.map((p) => (
                <div key={p.id} className="p-3 rounded-lg border text-sm"><div className="flex justify-between"><span className="font-medium">{p.companyName}</span><span className="font-bold text-violet-600">${p.amount.toLocaleString()}</span></div><p className="text-zinc-500 mt-1">{p.message}</p></div>
              ))}
              {!data.proposals?.length && <p className="text-sm text-zinc-400">No proposals yet.</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Submit your proposal</p>
            <Field label="Quote amount ($)"><Input type="number" value={f.amount} onChange={(e) => setF((p) => ({ ...p, amount: e.target.value }))} /></Field>
            <Field label="Message"><Textarea rows={3} value={f.message} onChange={(e) => setF((p) => ({ ...p, message: e.target.value }))} placeholder="What's included, timeline, why you…" /></Field>
            <Button onClick={submit} className="bg-violet-600 hover:bg-violet-500 w-full"><Send className="h-4 w-4 mr-1" /> Send proposal</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Post Center ---------------- */
function PostCenter({ company, onPosted }) {
  const [tab, setTab] = useState('job')
  if (!company?.paidVerified) return <LockBanner big text="Subscribe ($300/mo, 14-day trial) to post Jobs and RFPs. Use the 'Subscribe' button in the top bar." />
  return (
    <div>
      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'job' ? 'default' : 'outline'} onClick={() => setTab('job')} className={tab === 'job' ? 'bg-violet-600 hover:bg-violet-500' : ''}><Briefcase className="h-4 w-4 mr-1" /> Post Job</Button>
        <Button variant={tab === 'rfp' ? 'default' : 'outline'} onClick={() => setTab('rfp')} className={tab === 'rfp' ? 'bg-violet-600 hover:bg-violet-500' : ''}><FileText className="h-4 w-4 mr-1" /> Post RFP</Button>
      </div>
      {tab === 'job' ? <PostJob company={company} onPosted={onPosted} /> : <PostRFP company={company} onPosted={onPosted} />}
    </div>
  )
}

function PostJob({ company, onPosted }) {
  const [f, setF] = useState({ role: '', skills: [], crewCount: 1, date: '', city: company?.city || '', state: normalizeState(company?.state), callTime: '09:00', dayRate: 500, union: false, description: '', address: '', hours: 10, holidayPay: false, overtimeHours: 0, clientName: '', clientContact: '', plot: '', plotName: '' })
  const [saving, setSaving] = useState(false)
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const post = async () => {
    if (!f.role || !f.date) return toast.error('Pick a role and date')
    setSaving(true)
    try {
      const d = await api('/jobs', { method: 'POST', body: { ...f, skills: f.skills.length ? f.skills : [f.role] } })
      toast.success(`Job posted! Matched ${d.matched} crew.`, { description: d.demo ? `SMS DEMO → "${d.message}" (would send to ${d.matched} crew${d.matchNames?.length ? ': ' + d.matchNames.join(', ') : ''})` : `SMS sent to ${d.notified} crew.`, duration: 8000 })
      onPosted()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Card className="max-w-3xl"><CardContent className="p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Role"><SkillFilter value={f.role || 'all'} onChange={(v) => upd('role', v === 'all' ? '' : v)} label="Select role" noAll /></Field>
        <Field label="# of crew"><Input type="number" min="1" value={f.crewCount} onChange={(e) => upd('crewCount', e.target.value)} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => upd('date', e.target.value)} /></Field>
        <Field label="Call time"><Input type="time" value={f.callTime} onChange={(e) => upd('callTime', e.target.value)} /></Field>
        <Field label="City"><Input aria-label="City" value={f.city} onChange={(e) => upd('city', e.target.value)} maxLength={100} placeholder="Enter city" /></Field>
        <Field label="State"><StateSelect value={f.state} onChange={(v) => upd('state', v)} /></Field>
        <Field label="10hr rate offered ($)"><Input type="number" value={f.dayRate} onChange={(e) => upd('dayRate', e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={f.union} onCheckedChange={(v) => upd('union', v)} /> Union crew required</label>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Schedule length">
          <Select value={String(f.hours)} onValueChange={(v) => upd('hours', Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10 hour day</SelectItem><SelectItem value="8">8 hour day (union)</SelectItem></SelectContent></Select>
        </Field>
        <Field label="Overtime hours (est.)"><Input type="number" value={f.overtimeHours} onChange={(e) => upd('overtimeHours', e.target.value)} /></Field>
        <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm"><Switch checked={f.holidayPay} onCheckedChange={(v) => upd('holidayPay', v)} /> Holiday pay</label></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Client name"><Input value={f.clientName} onChange={(e) => upd('clientName', e.target.value)} placeholder="End client / promoter" /></Field>
        <Field label="Client contact"><Input value={f.clientContact} onChange={(e) => upd('clientContact', e.target.value)} placeholder="Phone or email" /></Field>
      </div>
      <Field label="Plot / production doc (PDF or image)">
        <label className="inline-flex items-center gap-2 text-sm text-violet-600 cursor-pointer border rounded-md px-3 h-10 bg-white w-fit"><FileText className="h-4 w-4" />{f.plotName ? f.plotName : 'Upload plot'}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (!fl) return; const r = new FileReader(); r.onload = () => setF((p) => ({ ...p, plot: r.result, plotName: fl.name })); r.readAsDataURL(fl) }} /></label>
      </Field>
      <div><Label className="mb-2 block text-sm">Extra skills to match (optional)</Label><SkillPicker value={f.skills} onChange={(v) => upd('skills', v)} /></div>
      <Field label="Job site address (shows a map)"><Input value={f.address} onChange={(e) => upd('address', e.target.value)} placeholder="123 Lansdowne St, Boston, MA" /></Field>
      {f.address && <iframe title="map" src={mapSrc(f.address)} className="w-full h-48 rounded-lg border" loading="lazy" />}
      <Field label="Description"><Textarea rows={3} value={f.description} onChange={(e) => upd('description', e.target.value)} /></Field>
      <div className="flex items-center gap-2 text-xs text-zinc-500 bg-violet-50 border border-violet-100 rounded-lg p-3"><Radio className="h-4 w-4 text-violet-600" /> Posting uses the existing notification settings and crew consent preferences.</div>
      <Button onClick={post} disabled={saving} className="bg-violet-600 hover:bg-violet-500">{saving ? 'Posting…' : 'Post job'}</Button>
    </CardContent></Card>
  )
}

function PostRFP({ company, onPosted }) {
  const [f, setF] = useState({ title: '', description: '', city: company?.city || '', state: normalizeState(company?.state), date: '', budget: '' })
  const [saving, setSaving] = useState(false)
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const post = async () => {
    if (!f.title || !f.description) return toast.error('Add a title and description')
    setSaving(true)
    try { await api('/rfps', { method: 'POST', body: f }); toast.success('RFP posted — production houses can now bid.'); onPosted() }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Card className="max-w-3xl"><CardContent className="p-6 space-y-4">
      <Field label="Title"><Input value={f.title} onChange={(e) => upd('title', e.target.value)} placeholder="Full audio crew + stagehands for 3-day festival" /></Field>
      <Field label="Describe the project"><Textarea rows={4} value={f.description} onChange={(e) => upd('description', e.target.value)} placeholder="Need full audio crew + stagehands for 3-day festival in Worcester. Send quote." /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="City"><Input value={f.city} onChange={(e) => upd('city', e.target.value)} placeholder="Enter city" maxLength={100} /></Field>
        <Field label="State"><StateSelect value={f.state} onChange={(v) => upd('state', v)} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => upd('date', e.target.value)} /></Field>
        <Field label="Budget ($, optional)"><Input type="number" value={f.budget} onChange={(e) => upd('budget', e.target.value)} /></Field>
      </div>
      <Button onClick={post} disabled={saving} className="bg-violet-600 hover:bg-violet-500">{saving ? 'Posting…' : 'Post RFP'}</Button>
    </CardContent></Card>
  )
}

/* ---------------- Billing / subscription management ---------------- */
function BillingCard({ company, onChanged }) {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const load = useCallback(async () => { try { setSt(await api('/billing/status')) } catch (e) {} }, [])
  useEffect(() => { load() }, [load, company?.paidVerified, company?.cancelAtPeriodEnd])
  if (!st) return null
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
  const modeBadge = st.mode === 'live' ? null : <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100" data-testid="billing-mode-badge">{st.mode === 'sandbox' ? 'Sandbox payments' : st.mode === 'test' ? 'Test payments' : 'Demo mode'}</Badge>
  const periodEnd = st.currentPeriodEnd || st.trialEndsAt
  const hasSubscription = ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(st.subscriptionStatus)
  const postingAccessOnly = st.paidVerified && !hasSubscription
  let statusLabel = 'Not subscribed', statusCls = 'bg-muted text-muted-foreground'
  if (hasSubscription && st.cancelAtPeriodEnd) { statusLabel = `Cancels ${fmt(periodEnd)}`; statusCls = 'bg-orange-100 text-orange-700' }
  else if (st.subscriptionStatus === 'trialing') { statusLabel = 'Free trial'; statusCls = 'bg-emerald-100 text-emerald-700' }
  else if (st.subscriptionStatus === 'active') { statusLabel = 'Active'; statusCls = 'bg-emerald-100 text-emerald-700' }
  else if (['past_due', 'unpaid'].includes(st.subscriptionStatus)) { statusLabel = 'Payment required'; statusCls = 'bg-orange-100 text-orange-700' }
  else if (st.subscriptionStatus === 'paused') { statusLabel = 'Paused' }
  else if (st.subscriptionStatus === 'canceled') { statusLabel = 'Canceled'; statusCls = 'bg-red-100 text-red-700' }
  const doCancel = async () => {
    setBusy(true)
    try {
      const r = await api('/billing/cancel', { method: 'POST' })
      toast.success(`Cancellation scheduled — you keep full access until ${fmt(r.currentPeriodEnd)}.`)
      setConfirmCancel(false); await load(); await onChanged?.()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const doResume = async () => {
    setBusy(true)
    try { await api('/billing/resume', { method: 'POST' }); toast.success('Subscription resumed — it will renew as normal.'); await load(); await onChanged?.() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const doPortal = async () => {
    setBusy(true)
    try { const r = await api('/billing/portal', { method: 'POST' }); if (r.url) window.location.href = r.url }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Card data-testid="billing-card"><CardContent className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-violet-600" /> Subscription</h3>
            <Badge className={`${statusCls} hover:${statusCls}`} data-testid="billing-status-badge">{statusLabel}</Badge>
            {modeBadge}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {postingAccessOnly ? 'Demo / admin-granted posting access — no active Stripe subscription.' : <>LANTIX Pro Company Account · ${(st.priceCents / 100).toFixed(0)}/month</>}
            {hasSubscription && st.subscriptionStatus === 'trialing' && !st.cancelAtPeriodEnd && <> · trial ends <span className="font-medium text-foreground">{fmt(st.trialEndsAt)}</span>, then billed monthly</>}
            {st.subscriptionStatus === 'active' && !st.cancelAtPeriodEnd && periodEnd && <> · renews <span className="font-medium text-foreground">{fmt(periodEnd)}</span></>}
            {hasSubscription && st.cancelAtPeriodEnd && <> · access continues until <span className="font-medium text-foreground">{fmt(periodEnd)}</span>, then no further charges</>}
            {!hasSubscription && !postingAccessOnly && <> · {st.trialDays}-day free trial, cancel anytime</>}
          </p>
          {postingAccessOnly && <Badge variant="secondary" className="mt-2" data-testid="billing-posting-access-badge">Posting access enabled</Badge>}
          {st.mode === 'sandbox' && hasSubscription && <p className="text-xs text-amber-700 mt-1">Sandbox mode: no real money moves. Cancellations are recorded in LANTIX Pro; once live Stripe keys are connected they also sync to Stripe automatically.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasSubscription && !postingAccessOnly && <SubscribeButton onDone={async () => { await load(); await onChanged?.() }} />}
          {hasSubscription && !st.cancelAtPeriodEnd && <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => setConfirmCancel(true)} data-testid="billing-cancel-btn"><X className="h-3.5 w-3.5 mr-1" /> Cancel subscription</Button>}
          {hasSubscription && st.cancelAtPeriodEnd && <Button size="sm" className="bg-violet-600 hover:bg-violet-500" disabled={busy} onClick={doResume} data-testid="billing-resume-btn"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Resume subscription</Button>}
          {!postingAccessOnly && st.portalAvailable && <Button size="sm" variant="outline" disabled={busy} onClick={doPortal} data-testid="billing-portal-btn"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Manage payment method</Button>}
        </div>
      </div>
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-md" data-testid="billing-cancel-dialog" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Cancel your subscription?</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600">You'll keep full access — crew contact details, job and RFP posting — until <span className="font-semibold text-zinc-800">{fmt(periodEnd)}</span>. After that your account returns to browse-only and you won't be charged again. You can resume any time before then.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={busy}>Keep subscription</Button>
            <Button className="bg-red-600 hover:bg-red-500" onClick={doCancel} disabled={busy} data-testid="billing-cancel-confirm">{busy ? 'Cancelling…' : 'Yes, cancel'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  )
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ company, onChanged, onNavigate = () => {}, applicantsOnly = false }) {
  const [data, setData] = useState(null); const [managing, setManaging] = useState(null)
  const load = useCallback(async () => { const d = await api('/dashboard'); setData(d) }, [])
  useEffect(() => { load() }, [load])
  const cancelJob = async (jobId) => {
    try { await api(`/jobs/${jobId}/cancel`, { method: 'POST' }); toast.success('Job cancelled — confirmed crew have been notified.'); load() }
    catch (e) { toast.error(e.message) }
  }
  if (!data) return <Loading />
  const s = data.stats
  return (
    <div className="space-y-6">
      {!applicantsOnly && <CompanyOverview api={api} company={company} jobs={data.jobs || []} onNavigate={onNavigate} />}
      {applicantsOnly && <><div className="rounded-2xl border border-border bg-card p-5 shadow-soft"><h2 className="text-lg font-semibold">Applicants & assignments</h2><p className="mt-1 text-sm text-muted-foreground">Review job applicants below. Show invitations and accepted assignments stay with each show’s staffing row.</p><Button className="mt-4" variant="outline" onClick={() => onNavigate('shows')}>Manage show assignments</Button></div><div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Stat label="Active Jobs" value={s.activeJobs} icon={Briefcase} /><Stat label="Total Applicants" value={s.totalApplicants} icon={Users} /><Stat label="Confirmed Crew" value={s.confirmed} icon={CheckCircle2} /><Stat label="Open RFPs" value={s.rfps} icon={FileText} /></div></>}
      <div>
        <h3 className="font-semibold mb-3">Your Jobs</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {data.jobs.map((j) => (
            <Card key={j.id} className={j.status === 'cancelled' ? 'opacity-70' : ''}><CardContent className="p-5">
              <div className="flex justify-between"><div className="flex items-center gap-2"><h4 className="font-bold">{j.role}</h4>{j.status === 'cancelled' && <Badge variant="secondary" className="bg-red-100 text-red-700">Cancelled</Badge>}</div><p className="text-lg font-bold text-violet-600">${j.dayRate}</p></div>
              <p className="text-sm text-zinc-500">{j.city} · {j.date} · Call {j.callTime}</p>
              <div className="flex gap-3 mt-3 text-sm"><Badge variant="secondary">{j.applicantCount} applicants</Badge><Badge className="bg-emerald-100 text-emerald-700">{j.confirmedCount} confirmed</Badge></div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => setManaging(j)}>Manage applicants</Button>
                {j.status !== 'cancelled' && <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => cancelJob(j.id)}><X className="h-3.5 w-3.5 mr-1" /> Cancel job</Button>}
              </div>
            </CardContent></Card>
          ))}
          {!data.jobs.length && <Empty text="No jobs yet — post your first job." />}
        </div>
      </div>
      {data.confirmedCrew.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Confirmed Crew (contact unlocked)</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.confirmedCrew.map((c, i) => (
              <Card key={i}><CardContent className="p-4 flex items-center gap-3">
                <Avatar className="h-11 w-11"><AvatarImage src={c.photo} /><AvatarFallback>{c.fullName?.[0]}</AvatarFallback></Avatar>
                <div className="text-sm"><p className="font-medium">{c.fullName}</p><p className="text-xs text-zinc-500">{c.jobRole} · {c.jobDate}</p><p className="text-xs text-emerald-600">{c.cell}</p></div>
              </CardContent></Card>
            ))}
          </div>
        </div>
      )}
      <ApplicantsDialog job={managing} onClose={() => setManaging(null)} />
    </div>
  )
}

function EmailDigestBar() {
  const [status, setStatus] = useState(null)
  const [sending, setSending] = useState(false)
  const load = useCallback(async () => { try { setStatus(await api('/email/status')) } catch (e) {} }, [])
  useEffect(() => { load() }, [load])
  const send = async () => {
    setSending(true)
    try {
      const d = await api('/email/send-now', { method: 'POST' })
      const r = d.result
      if (r.demo) toast.message('Email is in DEMO mode', { description: 'Add a Resend key to actually send.' })
      else toast.success(`Master list emailed to ${r.to}`, { description: `${r.crewCount} crew · ${r.expiringCount} expiring cert(s)`, duration: 7000 })
      load()
    } catch (e) { toast.error(e.message) } finally { setSending(false) }
  }
  return (
    <Card className="border-violet-200 bg-violet-50/50">
      <CardContent className="p-4 flex flex-wrap items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center"><Mail className="h-5 w-5 text-white" /></div>
        <div className="flex-1 min-w-[220px]">
          <p className="font-semibold text-sm">Daily Crew Master List email</p>
          <p className="text-xs text-zinc-500">
            {status?.emailLive ? <>Live · sends to <span className="font-medium">{status.adminEmail}</span></> : 'Demo mode — add a Resend key to send for real'}
            {status?.last && <> · last sent {new Date(status.last.sentAt).toLocaleString()}</>}
          </p>
        </div>
        <Button onClick={send} disabled={sending} className="bg-violet-600 hover:bg-violet-500"><Send className="h-4 w-4 mr-1" /> {sending ? 'Sending…' : 'Email master list now'}</Button>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, icon: Icon }) {
  return (
    <Card><CardContent className="p-5 flex items-center gap-4">
      <div className="h-11 w-11 rounded-xl bg-violet-100 flex items-center justify-center"><Icon className="h-5 w-5 text-violet-600" /></div>
      <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-zinc-500">{label}</p></div>
    </CardContent></Card>
  )
}

/* ---------------- Subscribe ---------------- */
function SubscribeButton({ onDone }) {
  const [loading, setLoading] = useState(false)
  const go = async () => {
    setLoading(true)
    try {
      const d = await api('/billing/checkout', { method: 'POST' })
      if (d.url) { window.location.href = d.url }
      else { toast.success('14-day trial started — you are Verified! (Demo mode — no card required)'); await onDone() }
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  return <Button onClick={go} disabled={loading} className="bg-violet-600 hover:bg-violet-500" data-testid="billing-subscribe-btn"><Sparkles className="h-4 w-4 mr-1" /> {loading ? '…' : 'Start Trial · $300/mo'}</Button>
}

/* ---------------- Message dialog ---------------- */
function MessageDialog({ to, onClose }) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const send = async () => {
    if (!body.trim()) return
    setSending(true)
    try { await api('/messages', { method: 'POST', body: { toUserId: to.userId, body } }); toast.success(`Message sent to ${to.fullName || to.name}`); onClose() }
    catch (e) { toast.error(e.message) } finally { setSending(false) }
  }
  if (!to) return null
  return (
    <Dialog open={!!to} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Message {to.fullName || to.name}</DialogTitle></DialogHeader>
        <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a private message… (also sent via SMS/email if available)" />
        <DialogFooter><Button onClick={send} disabled={sending} className="bg-violet-600 hover:bg-violet-500"><Send className="h-4 w-4 mr-1" /> {sending ? 'Sending…' : 'Send message'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Master List (admin, code access) ---------------- */
function MasterList() {
  const [code, setCode] = useState('')
  const [input, setInput] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [data, setData] = useState(null)
  const [recips, setRecips] = useState('')
  const [bc, setBc] = useState({ subject: '', message: '' })
  const [msgTo, setMsgTo] = useState(null)
  const [edit, setEdit] = useState(null)
  const [tab, setTab] = useState('master')
  const af = useCallback((path, opts = {}) => fetch('/api' + path, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', 'x-admin-code': code || input, ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'failed'); return d }), [code, input])
  const load = useCallback(async () => {
    try { const d = await af('/admin/master'); setData(d); setUnlocked(true); setRecips((d.recipients || []).join('\n')) }
    catch (e) { setUnlocked(false) }
  }, [af])
  useEffect(() => { if (code) load() }, [code, load])
  const submitCode = async () => {
    const clean = (input || '').trim()
    if (!clean) return toast.error('Enter the access code')
    try { const r = await api('/admin/verify', { method: 'POST', body: { code: clean } }); if (r.ok) { setCode(clean); setInput(''); toast.success('Master List unlocked') } else toast.error('Invalid access code') }
    catch (e) { toast.error('Invalid access code') }
  }
  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <Card><CardContent className="p-6 space-y-4 text-center">
          <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center mx-auto"><KeyRound className="h-6 w-6 text-violet-600" /></div>
          <h2 className="text-xl font-bold">Master List — Admin Access</h2>
          <p className="text-sm text-zinc-500">Authorized administrators only. Enter your access credential.</p>
          <Input type="password" aria-label="Admin access credential" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Access code" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && submitCode()} />
          <Button onClick={submitCode} className="w-full bg-violet-600 hover:bg-violet-500">Unlock</Button>
        </CardContent></Card>
      </div>
    )
  }
  if (!data) return <Loading />
  const s = data.stats
  const saveRecips = async () => { const emails = recips.split(/[\n,]/).map((x) => x.trim()).filter(Boolean); try { await af('/admin/recipients', { method: 'POST', body: { emails } }); toast.success(`Saved ${emails.length} recipient(s)`) } catch (e) { toast.error(e.message) } }
  const sendDigest = async () => { try { const d = await af('/admin/send-digest', { method: 'POST' }); toast.success(d.result.demo ? 'Digest queued (email demo mode)' : `Digest sent to ${d.result.recipients.length} recipient(s)`) } catch (e) { toast.error(e.message) } }
  const broadcast = async () => { if (!bc.message) return toast.error('Write a message'); try { const d = await af('/admin/broadcast', { method: 'POST', body: bc }); toast.success(`Broadcast to ${d.texted} via SMS, ${d.emailed} via email${d.demo ? ' (email demo)' : ''}`); setBc({ subject: '', message: '' }) } catch (e) { toast.error(e.message) } }
  const del = async (id, name) => { if (!confirm(`Delete ${name} from the master list?`)) return; try { await af('/admin/member/' + id, { method: 'DELETE' }); toast.success('Member removed'); load() } catch (e) { toast.error(e.message) } }
  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        <button onClick={() => setTab('master')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'master' ? 'border-violet-600 text-violet-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>Crew Master List</button>
        <button onClick={() => setTab('users')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'users' ? 'border-violet-600 text-violet-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>All Users &amp; Details</button>
      </div>

      {tab === 'users' && <AdminUsers af={af} onMessage={setMsgTo} />}

      {tab === 'master' && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Registered Members" value={s.registered} icon={Users} />
        <Stat label="Crew Profiles" value={s.crewCount} icon={ClipboardList} />
        <Stat label="Active Now" value={s.active} icon={CheckCircle2} />
        <Stat label="Booked Off" value={s.bookedOff} icon={X} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardContent className="p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4 text-violet-600" /> Daily Master-List Recipients</h3>
          <p className="text-xs text-zinc-500">Only these people receive the auto-sent list at 12:00 AM daily. One email per line.</p>
          <Textarea rows={4} value={recips} onChange={(e) => setRecips(e.target.value)} placeholder="ashton.john64@yahoo.com" />
          <div className="flex gap-2"><Button onClick={saveRecips} variant="outline">Save recipients</Button><Button onClick={sendDigest} className="bg-violet-600 hover:bg-violet-500"><Send className="h-4 w-4 mr-1" /> Send now</Button></div>
          {data.lastDigest && <p className="text-xs text-zinc-400">Last sent {new Date(data.lastDigest.sentAt).toLocaleString()} to {(data.lastDigest.recipients || []).length} recipient(s)</p>}
        </CardContent></Card>
        <Card><CardContent className="p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4 text-violet-600" /> Message All Members</h3>
          <p className="text-xs text-zinc-500">Sends an SMS + email to every crew member at once.</p>
          <Input value={bc.subject} onChange={(e) => setBc((p) => ({ ...p, subject: e.target.value }))} placeholder="Subject (email)" />
          <Textarea rows={2} value={bc.message} onChange={(e) => setBc((p) => ({ ...p, message: e.target.value }))} placeholder="Announcement to all members…" />
          <Button onClick={broadcast} className="bg-violet-600 hover:bg-violet-500"><Megaphone className="h-4 w-4 mr-1" /> Send to all</Button>
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <th className="p-3">Member</th><th className="p-3">Role / Skills</th><th className="p-3">City</th><th className="p-3">10hr</th><th className="p-3">Status</th><th className="p-3">Certs</th><th className="p-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {data.crew.map((c) => {
              const isKey = (c.skills || []).some((sk) => KEY_ROLES.includes(sk))
              return (
                <tr key={c.id} className={`border-t ${isKey ? 'bg-violet-50/60' : ''}`}>
                  <td className="p-3"><div className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarImage src={c.photo} /><AvatarFallback>{c.fullName?.[0]}</AvatarFallback></Avatar><span className={isKey ? 'font-semibold text-violet-700' : 'font-medium'}>{c.fullName}</span></div></td>
                  <td className="p-3"><span className={isKey ? 'text-violet-700 font-medium' : ''}>{c.primaryCategory}</span><div className="text-xs text-zinc-400">{(c.skills || []).slice(0, 3).join(', ')}</div></td>
                  <td className="p-3">{c.city}</td>
                  <td className="p-3 font-semibold text-violet-600">${c.dayRate}</td>
                  <td className="p-3">{c.available ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge> : <Badge className="bg-red-100 text-red-700">Booked off</Badge>}</td>
                  <td className="p-3 text-xs">{(c.certs || []).map((x) => x.name).join(', ') || '—'}</td>
                  <td className="p-3"><div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => setMsgTo(c)} title="Message"><MessageSquare className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEdit(c)} title="Edit"><UserCircle className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-red-600" onClick={() => del(c.id, c.fullName)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent></Card>

      <p className="text-xs text-zinc-400"><span className="inline-block w-3 h-3 rounded bg-violet-200 align-middle mr-1" /> Purple = key roles ({KEY_ROLES.slice(0, 4).join(', ')}…)</p>
      </>}
      <MessageDialog to={msgTo} onClose={() => setMsgTo(null)} />
      <AdminEditDialog member={edit} af={af} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  )
}

function AdminUsers({ af, onMessage }) {
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [detail, setDetail] = useState(null)
  const [editCrew, setEditCrew] = useState(null)
  const [editCompany, setEditCompany] = useState(null)
  const load = useCallback(async () => {
    try { const d = await af(`/admin/users?type=${type}&q=${encodeURIComponent(q)}`); setData(d) }
    catch (e) { toast.error(e.message) }
  }, [af, type, q])
  const del = async (u) => {
    if (!confirm(`Delete ${u.name}? This permanently removes their ${u.type === 'crew' ? 'profile & applications' : 'company, jobs & applications'}. This cannot be undone.`)) return
    try {
      await af(`/admin/${u.type === 'crew' ? 'member' : 'company'}/${u.id}`, { method: 'DELETE' })
      toast.success(`${u.name} deleted`); load()
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  const exportCsv = () => {
    const rows = data?.users || []
    const head = ['Name', 'Type', 'Role', 'Email', 'Phone', 'City', 'State', 'Rate', 'Subscription', 'Account', 'Signed up']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map((u) => [u.name, u.type, u.role, u.email, u.phone, u.city, u.state, u.type === 'crew' ? u.dayRate : '', u.type === 'company' ? u.subscriptionStatus : '', u.hasAccount ? (u.authProvider || 'yes') : 'no', u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''].map(esc).join(','))
    const csv = [head.map(esc).join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lantix-users.csv'; a.click(); URL.revokeObjectURL(a.href)
  }
  if (!data) return <Loading />
  const s = data.stats
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Total Users" value={s.total} icon={Users} />
        <Stat label="Crew" value={s.crew} icon={UserCircle} />
        <Stat label="Companies" value={s.companies} icon={Building2} />
        <Stat label="Login Accounts" value={s.accounts} icon={ShieldCheck} />
        <Stat label="Subscribed" value={s.subscribed} icon={CheckCircle2} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input className="pl-9" placeholder="Search name, email, phone, city, role…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[['all', 'All'], ['crew', 'Crew'], ['company', 'Companies']].map(([k, l]) => (
            <Button key={k} size="sm" variant={type === k ? 'default' : 'outline'} className={type === k ? 'bg-violet-600 hover:bg-violet-500' : ''} onClick={() => setType(k)}>{l}</Button>
          ))}
          <Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <th className="p-3">User</th><th className="p-3">Type / Role</th><th className="p-3">Contact</th><th className="p-3">Location</th><th className="p-3">Rate / Plan</th><th className="p-3">Account</th><th className="p-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.type + u.id} className="border-t hover:bg-zinc-50">
                <td className="p-3"><div className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarImage src={u.photo} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar><span className="font-medium">{u.name}</span></div></td>
                <td className="p-3">{u.type === 'crew' ? <Badge className="bg-sky-100 text-sky-700">Crew</Badge> : <Badge className="bg-amber-100 text-amber-700">Company</Badge>}<div className="text-xs text-zinc-500 mt-1">{u.role}</div></td>
                <td className="p-3 text-xs"><div className="flex items-center gap-1"><Mail className="h-3 w-3 text-zinc-400" />{u.email || '—'}</div><div className="flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3 text-zinc-400" />{u.phone || '—'}</div></td>
                <td className="p-3 text-xs">{[u.city, u.state].filter(Boolean).join(', ') || '—'}</td>
                <td className="p-3 text-xs">{u.type === 'crew' ? <span className="font-semibold text-violet-600">${u.dayRate}</span> : (u.subscriptionStatus === 'active' ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge> : <Badge variant="outline">{u.subscriptionStatus || 'none'}</Badge>)}</td>
                <td className="p-3 text-xs">{u.hasAccount ? <Badge className="bg-violet-100 text-violet-700">{u.authProvider || 'account'}</Badge> : <span className="text-zinc-400">seed / no login</span>}</td>
                <td className="p-3"><div className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => setDetail(u)} title="View details"><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => onMessage({ ...u, fullName: u.name, userId: u.userId })} title="Message"><MessageSquare className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => u.type === 'crew' ? setEditCrew(u) : setEditCompany(u)} title="Edit"><UserCircle className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => del(u)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                </div></td>
              </tr>
            ))}
            {data.users.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-zinc-400">No users match your search.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-border sm:max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Avatar className="h-9 w-9"><AvatarImage src={detail?.photo} /><AvatarFallback>{detail?.name?.[0]}</AvatarFallback></Avatar>{detail?.name}</DialogTitle></DialogHeader>
          {detail && <div className="space-y-2 text-sm">
            <DetailRow label="Type" value={detail.type === 'crew' ? 'Crew member' : 'Company'} />
            <DetailRow label="Role" value={detail.role} />
            <DetailRow label="Email" value={detail.email || '—'} />
            <DetailRow label="Phone" value={detail.phone || '—'} />
            <DetailRow label="Location" value={[detail.city, detail.state].filter(Boolean).join(', ') || '—'} />
            {detail.type === 'crew' && <>
              <DetailRow label="Day rate" value={`$${detail.dayRate}`} />
              <DetailRow label="Union" value={detail.unionMember ? 'Yes' : 'No'} />
              <DetailRow label="Availability" value={detail.available ? 'Active' : 'Booked off'} />
              <DetailRow label="Skills" value={(detail.skills || []).join(', ') || '—'} />
              <DetailRow label="Certifications" value={(detail.certs || []).join(', ') || '—'} />
              {detail.bio && <DetailRow label="Bio" value={detail.bio} />}
            </>}
            {detail.type === 'company' && <>
              <DetailRow label="Subscription" value={detail.subscriptionStatus || 'none'} />
              <DetailRow label="Paid / verified" value={detail.paidVerified ? 'Yes' : 'No'} />
              {detail.website && <DetailRow label="Website" value={detail.website} />}
              {detail.description && <DetailRow label="About" value={detail.description} />}
            </>}
            <DetailRow label="Login account" value={detail.hasAccount ? (detail.accountEmail || 'yes') + (detail.authProvider ? ` · ${detail.authProvider}` : '') : 'No login account'} />
            <DetailRow label="Signed up" value={detail.createdAt ? new Date(detail.createdAt).toLocaleString() : '—'} />
          </div>}
        </DialogContent>
      </Dialog>

      <AdminEditDialog member={editCrew ? { ...editCrew, fullName: editCrew.name } : null} af={af} onClose={() => setEditCrew(null)} onSaved={load} />
      <AdminCompanyDialog company={editCompany} af={af} onClose={() => setEditCompany(null)} onSaved={load} />
    </div>
  )
}

function AdminCompanyDialog({ company, af, onClose, onSaved }) {
  const [f, setF] = useState({})
  useEffect(() => { if (company) setF({ name: company.name, companyType: company.role, email: company.email, phone: company.phone, city: company.city, website: company.website, subscriptionStatus: company.subscriptionStatus || 'none', paidVerified: !!company.paidVerified }) }, [company])
  if (!company) return null
  const save = async () => { try { await af('/admin/company/' + company.id, { method: 'POST', body: f }); toast.success('Company updated'); onClose(); onSaved() } catch (e) { toast.error(e.message) } }
  return (
    <Dialog open={!!company} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit {company.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Company name"><Input value={f.name || ''} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={f.companyType || 'Production House'} onValueChange={(v) => setF((p) => ({ ...p, companyType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="City"><CitySelect value={f.city || 'Boston'} onChange={(v) => setF((p) => ({ ...p, city: v }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><Input value={f.email || ''} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} /></Field>
            <Field label="Phone"><Input value={f.phone || ''} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} /></Field>
          </div>
          <Field label="Website"><Input value={f.website || ''} onChange={(e) => setF((p) => ({ ...p, website: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Subscription"><Select value={f.subscriptionStatus || 'none'} onValueChange={(v) => setF((p) => ({ ...p, subscriptionStatus: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['none', 'trialing', 'active', 'past_due', 'canceled'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <label className="flex items-center gap-2 text-sm pb-2"><Switch checked={!!f.paidVerified} onCheckedChange={(v) => setF((p) => ({ ...p, paidVerified: v }))} /> Verified</label>
          </div>
        </div>
        <DialogFooter><Button onClick={save} className="bg-violet-600 hover:bg-violet-500">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex gap-3 py-1 border-b border-zinc-100 last:border-0">
      <span className="w-32 shrink-0 text-zinc-400">{label}</span>
      <span className="flex-1 break-words">{value}</span>
    </div>
  )
}

function AdminEditDialog({ member, af, onClose, onSaved }) {
  const [f, setF] = useState({})
  useEffect(() => { if (member) setF({ fullName: member.fullName, dayRate: member.dayRate, city: member.city, available: member.available, unionMember: member.unionMember }) }, [member])
  if (!member) return null
  const save = async () => { try { await af('/admin/member/' + member.id, { method: 'POST', body: f }); toast.success('Member updated'); onClose(); onSaved() } catch (e) { toast.error(e.message) } }
  return (
    <Dialog open={!!member} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit {member.fullName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Full name"><Input value={f.fullName || ''} onChange={(e) => setF((p) => ({ ...p, fullName: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="10hr Rate ($)"><Input type="number" value={f.dayRate || 0} onChange={(e) => setF((p) => ({ ...p, dayRate: e.target.value }))} /></Field>
            <Field label="City"><CitySelect value={f.city || 'Boston'} onChange={(v) => setF((p) => ({ ...p, city: v }))} /></Field>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!f.available} onCheckedChange={(v) => setF((p) => ({ ...p, available: v }))} /> Available</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!f.unionMember} onCheckedChange={(v) => setF((p) => ({ ...p, unionMember: v }))} /> Union</label>
          </div>
        </div>
        <DialogFooter><Button onClick={save} className="bg-violet-600 hover:bg-violet-500">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Calendar ---------------- */
function CalendarView() {
  return <WorkCalendar api={api} />
}

/* ---------------- Messages ---------------- */
function MessagesView({ user }) {
  const [data, setData] = useState(null)
  useEffect(() => { (async () => { try { const d = await api('/messages'); setData(d); api('/messages/read', { method: 'POST' }).catch(() => {}) } catch (e) {} })() }, [])
  if (!data) return <Loading />
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h3 className="font-semibold mb-3">Inbox</h3>
        <div className="space-y-2">
          {data.inbox.map((m) => (
            <Card key={m.id}><CardContent className="p-4 flex gap-3">
              <Avatar className="h-9 w-9"><AvatarImage src={m.fromPicture} /><AvatarFallback>{m.fromName?.[0]}</AvatarFallback></Avatar>
              <div><p className="text-sm font-medium">{m.fromName}</p><p className="text-sm text-zinc-600">{m.body}</p><p className="text-[11px] text-zinc-400">{new Date(m.createdAt).toLocaleString()}</p></div>
            </CardContent></Card>
          ))}
          {!data.inbox.length && <Empty text="No messages yet." />}
        </div>
      </div>
      <div>
        <h3 className="font-semibold mb-3">Sent</h3>
        <div className="space-y-2">
          {data.sent.map((m) => (
            <Card key={m.id}><CardContent className="p-4"><p className="text-sm text-zinc-600">{m.body}</p><p className="text-[11px] text-zinc-400">{new Date(m.createdAt).toLocaleString()}</p></CardContent></Card>
          ))}
          {!data.sent.length && <Empty text="Nothing sent yet." />}
        </div>
      </div>
    </div>
  )
}

/* ---------------- small UI helpers ---------------- */
function Wrapper({ first, title, subtitle, children }) {
  return (
    <div className={first ? 'min-h-screen bg-background flex items-start justify-center px-4 py-8 sm:py-12' : ''}>
      <div className={first ? 'max-w-4xl w-full' : ''}>
        {first && <div className="mb-8 flex items-center justify-between"><Brand /><Button variant="ghost" size="sm" onClick={async () => { await api('/auth/logout', { method: 'POST' }); window.location.reload() }}>Sign out</Button></div>}
        <div className="mb-6"><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>
        <Card className="border-border shadow-soft"><CardContent className="p-5 sm:p-7">{children}</CardContent></Card>
      </div>
    </div>
  )
}
const Field = ({ label, children }) => {
  const generated = useId()
  const id = isValidElement(children) && children.props.id ? children.props.id : generated
  return <div className="min-w-0"><Label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</Label>{isValidElement(children) ? cloneElement(children, { id }) : children}</div>
}
const FilterBar = ({ children }) => (<div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">{children}</div>)
function SearchInput({ value, onChange, placeholder }) {
  return (<div className="relative flex-1 min-w-[180px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" /><Input className="pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>)
}
function CitySelect({ value, onChange, allowAll }) {
  return <Input aria-label="City" className="w-40" value={value === 'all' ? '' : value || ''} maxLength={100} placeholder={allowAll ? 'All cities (type to filter)' : 'Enter city'} onChange={(event) => onChange(allowAll && !event.target.value ? 'all' : event.target.value)} />
}
function SkillFilter({ value, onChange, label = 'Skill', noAll }) {
  return (<Select value={value} onValueChange={onChange}><SelectTrigger className="w-48"><SelectValue placeholder={label} /></SelectTrigger><SelectContent className="max-h-72">{!noAll && <SelectItem value="all">All {label.toLowerCase()}s</SelectItem>}{Object.entries(SKILL_CATEGORIES).map(([cat, arr]) => (<div key={cat}><p className="px-2 py-1 text-[10px] font-semibold uppercase text-zinc-400">{cat}</p>{arr.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</div>))}</SelectContent></Select>)
}
const ToggleChip = ({ active, onClick, children }) => (<button onClick={onClick} className={`px-3 py-2 rounded-lg text-sm border transition ${active ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-zinc-600 border-zinc-300 hover:border-violet-400'}`}>{children}</button>)
const Loading = () => (<div className="py-20 text-center text-zinc-400 text-sm">Loading…</div>)
const Empty = ({ text }) => (<div className="col-span-full py-16 text-center text-zinc-400 text-sm">{text}</div>)
function LockBanner({ text, big }) {
  return (<div className={`flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 ${big ? 'p-6' : 'p-4'}`}><Lock className="h-5 w-5 shrink-0" /><p className="text-sm">{text}</p></div>)
}
