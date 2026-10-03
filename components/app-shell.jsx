'use client'

import { useState } from 'react'
import { Zap, Menu, X, LogOut, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const Brand = ({ compact = false }) => <span className="inline-flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Zap className="h-5 w-5" /></span><span className={`${compact ? 'text-lg' : 'text-xl'} font-bold tracking-tight text-foreground`}>LANTIX <span className="text-primary">Pro</span></span></span>

const AppShell = ({ user, navItems, page, title, onNavigate, onLogout, children, actions, admin = false }) => {
  const [menu, setMenu] = useState(false)
  const sidebar = admin || user?.role === 'company'
  const go = (key) => { onNavigate(key); setMenu(false) }
  const navigation = <nav aria-label={admin ? 'Master admin navigation' : 'Main navigation'} className={sidebar ? 'space-y-1 p-3' : 'flex gap-1 overflow-x-auto px-4 pb-3 lg:justify-center'}>{navItems.map(({ k, label, icon: Icon }) => <button key={k} type="button" onClick={() => go(k)} aria-current={page === k ? 'page' : undefined} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${sidebar ? 'w-full text-left' : 'shrink-0'} ${page === k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon className="h-4 w-4 shrink-0" /><span>{label}</span>{sidebar && page === k && <ChevronRight className="ml-auto h-3.5 w-3.5" />}</button>)}</nav>
  return <div className="min-h-screen bg-background text-foreground text-sm antialiased">
    {sidebar ? <>
      {menu && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setMenu(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card transition-transform lg:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'}`}><div className="flex h-20 items-center justify-between px-5"><button onClick={() => go(navItems[0].k)} aria-label="Go to dashboard"><Brand compact /></button><button className="lg:hidden" aria-label="Close navigation" onClick={() => setMenu(false)}><X className="h-5 w-5" /></button></div><div className="px-6 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{admin ? 'Platform management' : 'Company workspace'}</div><div className="min-h-0 flex-1 overflow-y-auto">{navigation}</div><div className="m-3 rounded-xl border border-border bg-muted/40 p-3"><p className="truncate text-sm font-semibold">{user?.name || 'Administrator'}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{admin ? 'Restricted admin session' : user?.email}</p><button onClick={onLogout} className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><LogOut className="h-3.5 w-3.5" />Sign out</button></div></aside>
    </> : <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur"><div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-8"><button onClick={() => go(navItems[0].k)}><Brand /></button><div className="flex min-w-0 items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user?.name}</p><p className="text-xs text-muted-foreground">Crew workspace</p></div><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{user?.name?.slice(0, 1)?.toUpperCase() || 'C'}</span><button aria-label="Sign out" onClick={onLogout} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><LogOut className="h-4 w-4" /></button></div></div>{navigation}</header>}
    <div className={sidebar ? 'lg:pl-60' : ''}>
      <header className={`${sidebar ? 'sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur' : ''} flex min-h-20 items-center justify-between gap-3 px-4 py-4 sm:px-8`}><div className="flex min-w-0 items-center gap-3">{sidebar && <button aria-label="Open navigation" className="lg:hidden" onClick={() => setMenu(true)}><Menu className="h-5 w-5" /></button>}<div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{admin ? 'Master admin' : sidebar ? 'Company' : 'Crew'} / {title}</p><h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1></div></div><div className="flex shrink-0 items-center gap-2">{actions}</div></header>
      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 pb-24 sm:px-8 sm:py-8 sm:pb-10 [&_.bg-white]:shadow-soft [&_.rounded-xl]:rounded-2xl [&_h2]:tracking-tight [&_h3]:tracking-tight [&_input]:bg-card [&_textarea]:bg-card [&_table]:bg-card [&_table_th]:text-xs [&_table_th]:font-semibold [&_table_th]:text-muted-foreground">{children}</main>
    </div>
    {!admin && sidebar && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden"><Button className="w-full" onClick={() => go('new-show')}><Plus className="mr-2 h-4 w-4" />Post a show</Button></div>}
  </div>
}

export default AppShell
