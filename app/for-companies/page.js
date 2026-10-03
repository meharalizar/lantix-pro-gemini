import Link from 'next/link'
import { Building2, Users, CheckCircle2, ShieldCheck, ArrowRight, Layers, FileSpreadsheet, Lock } from 'lucide-react'

export const metadata = {
  title: 'For Production Companies — Event Crew Staffing & Management | LANTIX Pro',
  description: 'Streamline live event staffing with LANTIX Pro. Source vetted A1s, lighting board operators, and video techs. Department tabs, timesheet approvals, and CSV exports.',
}

export default function ForCompaniesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-xl tracking-tight text-foreground">
            LANTIX <span className="text-violet-600">PRO</span>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
            <Link href="/for-crew" className="text-muted-foreground hover:text-foreground">For Crew</Link>
            <Link href="/?action=login" className="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition">
              Log In
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-16 sm:px-6 space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-semibold">
            <Building2 className="h-4 w-4" /> Live Event Production Platform
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Staff Every Show Faster With Verified Live-Event Crew
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            A staffing-first workforce management platform engineered for production houses, concert promoters, corporate AV providers, and venue operators nationwide.
          </p>
          <div className="pt-2">
            <Link
              href="/?action=signup&role=company"
              className="inline-flex items-center px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition shadow-soft"
            >
              Register Production Company <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Staffing-First Workflow',
              desc: 'Organise your shows with dedicated department tabs for Audio, Lighting, Video, Staging, and Rigging.',
              icon: Layers,
            },
            {
              title: 'Internal Company RBAC',
              desc: 'Assign team members to Owner, Event Manager, Department Head, and Finance roles. Department Heads only approve their assigned department timesheets.',
              icon: Lock,
            },
            {
              title: 'Favourite Crew & Previous Teams',
              desc: 'Bookmark top technicians and easily re-invite proven teams from past successful shows with a single click.',
              icon: Users,
            },
            {
              title: 'All 50 US States',
              desc: 'Find qualified local crew in any US city or tour market, avoiding unnecessary travel and hotel expenses.',
              icon: CheckCircle2,
            },
            {
              title: 'Locked Timesheets & Approvals',
              desc: 'Crew submits regular and overtime hours. Approved timesheets are automatically locked, creating a permanent audit trail.',
              icon: ShieldCheck,
            },
            {
              title: 'Show Summary & CSV Exports',
              desc: 'Export complete staffing rosters, rates, and approved shift hours into CSV format ready for your accounting system.',
              icon: FileSpreadsheet,
            },
          ].map((item, i) => (
            <div key={i} className="p-6 rounded-2xl border bg-card space-y-3 shadow-soft">
              <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base">{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA Banner */}
        <div className="rounded-2xl border-2 border-violet-600 p-8 sm:p-10 bg-gradient-to-r from-violet-900/10 to-transparent flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold">Ready to streamline your event staffing?</h2>
            <p className="text-xs text-muted-foreground">Join production companies managing over 500+ successful live events.</p>
          </div>
          <Link
            href="/?action=signup&role=company"
            className="px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition shrink-0"
          >
            Get Started Now
          </Link>
        </div>
      </main>
    </div>
  )
}
