import Link from 'next/link'
import { Users, DollarSign, CalendarCheck, ShieldCheck, ArrowRight, Award, FileText } from 'lucide-react'

export const metadata = {
  title: 'For Freelance Event Crew — Find Live Production Gigs | LANTIX Pro',
  description: 'Join LANTIX Pro free as an audio engineer, lighting designer, or video technician. Configure 5 rate tiers, receive show offers, and export approved timesheets.',
}

export default function ForCrewPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-xl tracking-tight text-foreground">
            LANTIX <span className="text-violet-600">PRO</span>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
            <Link href="/for-companies" className="text-muted-foreground hover:text-foreground">For Companies</Link>
            <Link href="/?action=login" className="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition">
              Log In
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-16 sm:px-6 space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
            <Users className="h-4 w-4" /> 100% Free for Freelance Event Technicians
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Book Live Event Gigs, Set Your Rates, and Lock In Hours
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            Connect directly with verified production houses and corporate AV companies. Never pay a fee to find gigs or submit your timesheets.
          </p>
          <div className="pt-2">
            <Link
              href="/?action=signup&role=crew"
              className="inline-flex items-center px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition shadow-soft"
            >
              Create Free Crew Profile <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Available Jobs First',
              desc: 'Log in and see immediate open staffing needs in your city and department without browsing through clutter.',
              icon: CalendarCheck,
            },
            {
              title: '5 Transparent Rate Tiers',
              desc: 'Set your distinct rates for Regular, Overtime, Travel, Holiday, and Emergency calls so clients know your terms upfront.',
              icon: DollarSign,
            },
            {
              title: 'Direct Show Invitations',
              desc: 'Receive formal show offers with exact call times, venue location, and rate confirmation before accepting.',
              icon: Users,
            },
            {
              title: 'Locked Timesheets & Overtime',
              desc: 'Submit your hours with automatic overtime calculation. Approved records are locked permanently for your records.',
              icon: ShieldCheck,
            },
            {
              title: 'Verified Production Reviews',
              desc: 'Build your industry reputation with verified reviews left exclusively by clients who have approved your show timesheets.',
              icon: Award,
            },
            {
              title: 'Export Work Records (CSV)',
              desc: 'Download your full approved timesheet history and work logs into CSV format ready for tax season or invoice tracking.',
              icon: FileText,
            },
          ].map((item, i) => (
            <div key={i} className="p-6 rounded-2xl border bg-card space-y-3 shadow-soft">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base">{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA Banner */}
        <div className="rounded-2xl border border-border p-8 bg-card flex flex-col sm:flex-row items-center justify-between gap-6 shadow-soft">
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold">Ready to take on your next event gig?</h2>
            <p className="text-xs text-muted-foreground">Join thousands of technicians booking shows across all 50 states.</p>
          </div>
          <Link
            href="/?action=signup&role=crew"
            className="px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition shrink-0"
          >
            Join as Crew (Free)
          </Link>
        </div>
      </main>
    </div>
  )
}
