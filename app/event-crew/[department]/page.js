import Link from 'next/link'
import { Layers, Users, CheckCircle2, ArrowRight } from 'lucide-react'

const DEPARTMENTS = {
  audio: {
    name: 'Audio Engineering',
    roles: ['FOH Engineer', 'A1 Lead Audio', 'A2 Audio Assistant', 'Monitor Engineer', 'RF Coordinator', 'System Tech'],
    description: 'Concert sound, touring PA systems, wireless RF coordination, and corporate breakout audio technicians.',
  },
  lighting: {
    name: 'Lighting & Electrics',
    roles: ['Lighting Designer', 'GrandMA / Hog Board Op', 'Electrician', 'Moving Light Tech', 'Spotlight Operator'],
    description: 'Touring stage lighting, corporate convention illumination, intelligent fixtures, and power distribution.',
  },
  video: {
    name: 'Video & LED Walls',
    roles: ['LED Wall Tech', 'Media Server Op (Resolume / Disguise)', 'E2 / Spyder Screen Switcher', 'Projectionist', 'Broadcast Director'],
    description: 'High-resolution LED panels, video switching, projection mapping, graphics playback, and teleprompting.',
  },
  staging: {
    name: 'Staging & Rigging',
    roles: ['ETCP Certified Rigger', 'Stage Carpenter', 'Ground Rigger', 'Stagehand', 'Forklift Operator'],
    description: 'Stage builds, roof trusses, motor points, load-in logistics, and safety coordination.',
  },
  production: {
    name: 'Production & Management',
    roles: ['Production Manager', 'Show Caller', 'Crew Chief', 'Stage Manager', 'Technical Director'],
    description: 'Overall show leadership, schedule enforcement, departmental coordination, and live event execution.',
  },
}

export async function generateMetadata({ params }) {
  const { department } = await params
  const key = String(department || '').toLowerCase()
  const info = DEPARTMENTS[key] || {
    name: key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    roles: ['Specialized Technicians'],
    description: 'Live event crew specialists.',
  }
  return {
    title: `Hire Live Event ${info.name} Crew | LANTIX Pro`,
    description: `Book qualified ${info.name} technicians nationwide. ${info.description}`,
  }
}

export default async function EventCrewDepartmentPage({ params }) {
  const { department } = await params
  const key = String(department || '').toLowerCase()
  const info = DEPARTMENTS[key] || {
    name: key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    roles: ['Technicians & Operators'],
    description: 'Experienced live event crew members.',
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
            <Layers className="h-3.5 w-3.5" /> Department Specialisation
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Hire Vetted {info.name} Technicians Across the US
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            {info.description} Transparent 5-tier rates, verified show reviews, and seamless timesheet approvals.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={`/?skill=${encodeURIComponent(info.roles[0] || info.name)}`}
              className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition text-sm flex items-center gap-2"
            >
              Browse {info.name} Crew <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="px-5 py-2.5 rounded-xl border border-border bg-card font-semibold hover:bg-muted/30 transition text-sm"
            >
              View Company Pricing
            </Link>
          </div>
        </div>

        {/* Roles list */}
        <div className="space-y-4 pt-4 border-t">
          <h2 className="text-xl font-bold">Key Roles in {info.name}</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {info.roles.map((r, i) => (
              <div key={i} className="p-4 rounded-xl border bg-card space-y-1">
                <div className="font-semibold text-sm">{r}</div>
                <div className="text-xs text-muted-foreground">Vetted skills, rate tiers, & verified history</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
