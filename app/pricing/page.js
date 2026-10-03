import Link from 'next/link'
import { Check, ShieldCheck, ArrowRight, Building2, Users } from 'lucide-react'

export const metadata = {
  title: 'Pricing — Production Company Subscriptions & Free Crew Accounts | LANTIX Pro',
  description: 'LANTIX Pro transparent pricing: $300/month for production houses with unlimited shows and staffing. 100% free for freelance event crew.',
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-extrabold text-xl tracking-tight text-foreground">
              LANTIX <span className="text-violet-600">PRO</span>
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/for-companies" className="text-muted-foreground hover:text-foreground">For Companies</Link>
            <Link href="/for-crew" className="text-muted-foreground hover:text-foreground">For Crew</Link>
            <Link href="/?action=login" className="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition">
              Log In
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-16 sm:px-6 space-y-12">
        <div className="text-center space-y-3">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Simple, Transparent Labor Platform Pricing
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base sm:text-lg">
            Connecting production companies with vetted live-event audio, lighting, and video technicians across all 50 states.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-stretch">
          {/* Crew Plan */}
          <div className="p-8 rounded-2xl border bg-card flex flex-col justify-between shadow-soft">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 text-violet-600 font-semibold text-sm">
                <Users className="h-5 w-5" /> Freelance Event Crew
              </div>
              <div>
                <div className="text-4xl font-extrabold">$0</div>
                <div className="text-sm text-muted-foreground">Always 100% Free Forever</div>
              </div>
              <p className="text-sm text-muted-foreground">
                Join our national directory of A1s, lighting board ops, video techs, rigger/stagehands, and production specialists.
              </p>
              <ul className="space-y-3 text-sm">
                {[
                  'National verified directory visibility',
                  'Configure 5 rate tiers (Regular, OT, Travel, Holiday, Emergency)',
                  'Receive direct show offers and staffing invitations',
                  'Track and submit timesheets with overtime calculations',
                  'Lock in approved work records & verified client reviews',
                  'Export approved timesheets & work history (CSV)',
                ].map((feat, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-8">
              <Link
                href="/?action=signup&role=crew"
                className="w-full inline-flex justify-center items-center py-3 px-4 rounded-xl border border-violet-600 text-violet-600 font-semibold hover:bg-violet-50 transition"
              >
                Sign Up as Crew (Free)
              </Link>
            </div>
          </div>

          {/* Company Plan */}
          <div className="p-8 rounded-2xl border-2 border-violet-600 bg-card flex flex-col justify-between shadow-soft relative">
            <div className="absolute -top-3.5 right-6 bg-violet-600 text-white text-xs font-bold py-1 px-3 rounded-full uppercase tracking-wider">
              Production Plan
            </div>
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 text-violet-600 font-semibold text-sm">
                <Building2 className="h-5 w-5" /> Production Companies
              </div>
              <div>
                <div className="text-4xl font-extrabold">$300 <span className="text-lg font-normal text-muted-foreground">/ month</span></div>
                <div className="text-sm text-muted-foreground">Full Platform & Staffing Access</div>
              </div>
              <p className="text-sm text-muted-foreground">
                Everything production houses and AV providers need to source, staff, and review event crew nationwide.
              </p>
              <ul className="space-y-3 text-sm">
                {[
                  'Unlimited shows, events, and department staffing rows',
                  'Search & filter crew across all 50 US states',
                  'Direct crew invitations with rate and call time confirmation',
                  'Internal company RBAC (Owner, Event Manager, Dept Head, Finance)',
                  'Department Head timesheet approval isolation',
                  'Favourite crew and previous team re-invites',
                  'Document vault with sensitive privacy compliance',
                  'Show staffing summary & CSV export reporting',
                ].map((feat, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-8">
              <Link
                href="/?action=signup&role=company"
                className="w-full inline-flex justify-center items-center py-3 px-4 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition"
              >
                Start Company Membership <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-6 bg-muted/20 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 font-semibold text-sm">
            <ShieldCheck className="h-5 w-5 text-violet-600" />
            No In-Platform Crew Payouts or Hidden Fees
          </div>
          <p className="text-xs text-muted-foreground max-w-xl mx-auto">
            LANTIX Pro tracks and locks approved labor hours, overtime, and work logs. Production companies pay crew directly according to their standard AP or payroll procedures using our verified export records.
          </p>
        </div>
      </main>
    </div>
  )
}
