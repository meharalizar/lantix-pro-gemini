import Link from 'next/link'
import { MapPin, Users, Building2, CheckCircle2, ArrowRight } from 'lucide-react'

const KNOWN_CITIES = {
  boston: { name: 'Boston', state: 'MA', metro: 'Greater Boston Area' },
  'new-york': { name: 'New York', state: 'NY', metro: 'NYC Metro & Tri-State' },
  'los-angeles': { name: 'Los Angeles', state: 'CA', metro: 'Greater Los Angeles' },
  chicago: { name: 'Chicago', state: 'IL', metro: 'Chicagoland' },
  'las-vegas': { name: 'Las Vegas', state: 'NV', metro: 'Las Vegas Valley & Strip' },
  nashville: { name: 'Nashville', state: 'TN', metro: 'Music City & Middle Tennessee' },
  atlanta: { name: 'Atlanta', state: 'GA', metro: 'Metro Atlanta' },
  austin: { name: 'Austin', state: 'TX', metro: 'Central Texas' },
  orlando: { name: 'Orlando', state: 'FL', metro: 'Central Florida' },
  denver: { name: 'Denver', state: 'CO', metro: 'Front Range Urban Corridor' },
}

export async function generateMetadata({ params }) {
  const { city } = await params
  const cityKey = String(city || '').toLowerCase()
  const info = KNOWN_CITIES[cityKey] || {
    name: cityKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    state: 'US',
    metro: 'United States',
  }
  return {
    title: `Live Event Staffing in ${info.name}, ${info.state} | LANTIX Pro`,
    description: `Source verified event technicians in ${info.name}, ${info.state}. Audio engineers, lighting programmers, video engineers, and production crew for concerts, festivals, and corporate events.`,
  }
}

export default async function EventStaffingCityPage({ params }) {
  const { city } = await params
  const cityKey = String(city || '').toLowerCase()
  const info = KNOWN_CITIES[cityKey] || {
    name: cityKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    state: 'US',
    metro: 'United States',
  }

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

      <main className="flex-1 max-w-5xl mx-auto px-4 py-16 sm:px-6 space-y-12">
        <div className="space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-semibold">
            <MapPin className="h-3.5 w-3.5" /> {info.metro}
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Live Event Labor & Crew Staffing in {info.name}, {info.state}
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            Connect with verified local audio engineers, lighting directors, video techs, and staging specialists ready for calls across {info.name} venues.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={`/?city=${encodeURIComponent(info.name)}&state=${encodeURIComponent(info.state)}`}
              className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition text-sm flex items-center gap-2"
            >
              Browse {info.name} Crew Directory <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/for-companies"
              className="px-5 py-2.5 rounded-xl border border-border bg-card font-semibold hover:bg-muted/30 transition text-sm"
            >
              How Staffing Works
            </Link>
          </div>
        </div>

        {/* Roles Available in this market */}
        <div className="space-y-4 pt-4 border-t">
          <h2 className="text-xl font-bold">Event Labor Roles in {info.name}</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { role: 'FOH & Monitor Audio Engineers', dept: 'Audio' },
              { role: 'Lighting Board Operators & Techs', dept: 'Lighting' },
              { role: 'LED Wall & Video Engineers', dept: 'Video' },
              { role: 'Stage Managers & Crew Chiefs', dept: 'Production' },
              { role: 'Certified Riggers & Stagehands', dept: 'Rigging / Staging' },
              { role: 'Camera & Broadcast Operators', dept: 'Camera' },
            ].map((r, i) => (
              <div key={i} className="p-4 rounded-xl border bg-card space-y-1">
                <div className="text-xs font-semibold text-violet-600">{r.dept}</div>
                <div className="font-semibold text-sm">{r.role}</div>
                <div className="text-xs text-muted-foreground">Available for day calls & tours</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
