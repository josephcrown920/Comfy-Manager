import * as React from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, Settings2, Images, ListVideo, BrainCircuit, Rocket, Bot, Boxes, Menu, X, BookOpen, GitBranch, Aperture, Clapperboard, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import { AccountControl } from "@/components/account-control"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generate", label: "Workflows", icon: Boxes },
  { href: "/batches", label: "Batch Studio", icon: GitBranch },
  { href: "/perform-anywhere", label: "Perform Anywhere", icon: Clapperboard },
  { href: "/gpu-hub", label: "GPU Hub", icon: Cpu },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/jobs", label: "Jobs", icon: ListVideo },
  { href: "/gallery", label: "Gallery", icon: Images },
  { href: "/models", label: "Models", icon: BrainCircuit },
  { href: "/launch", label: "Launch GPU", icon: Rocket },
  { href: "/guide", label: "Guide", icon: BookOpen },
]

function AuroraWordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(183,245,74,0.2)]">
        <Aperture className="w-5 h-5 text-background" strokeWidth={2.5} />
      </div>
      {!collapsed && (
        <span className="font-sans font-bold text-2xl tracking-tight text-foreground select-none">
          Aurora
        </span>
      )}
    </div>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => { setMobileOpen(false) }, [location])

  const handleSettingsClick = () => {
    setLocation("/settings")
    setMobileOpen(false)
  }

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background selection:bg-primary/30 selection:text-white font-sans text-foreground">
      <header className="md:hidden sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-between h-16 px-4">
        <Link href="/" className="flex items-center"><AuroraWordmark /></Link>
        <div className="flex items-center gap-2">
          <AccountControl compact onSettings={handleSettingsClick} />
          <button type="button" className="p-2 -mr-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setMobileOpen(o => !o)} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen}>{mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
        </div>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 top-16 bg-background/95 backdrop-blur-3xl overflow-y-auto animate-in slide-in-from-top-2 duration-300">
          <nav className="flex flex-col p-4 gap-2">
            <AccountControl onSettings={handleSettingsClick} />
            <div className="h-4" />
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
              return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={cn("flex items-center gap-4 px-4 py-3.5 rounded-2xl text-base font-bold transition-all", isActive ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(183,245,74,0.2)]" : "text-muted-foreground hover:text-foreground hover:bg-card")}><item.icon className="h-5 w-5" />{item.label}</Link>
            })}
          </nav>
        </div>
      )}

      <aside className="hidden md:flex flex-col w-[280px] shrink-0 border-r border-border bg-background sticky top-0 h-[100dvh]">
        <div className="h-28 flex items-center px-8"><Link href="/" className="flex items-center"><AuroraWordmark /></Link></div>
        <div className="px-6 pb-6"><Link href="/generate"><button className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-[0_0_20px_rgba(183,245,74,0.15)] hover:shadow-[0_0_30px_rgba(183,245,74,0.3)] hover:-translate-y-0.5 transition-all duration-300"><Aperture className="h-4 w-4" />Run Workflow</button></Link></div>
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto py-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 group relative", isActive ? "bg-card text-foreground border border-border shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-card/50 border border-transparent")}><item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />{item.label}{isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />}</Link>
          })}
        </nav>
        <div className="p-6 mt-auto"><AccountControl onSettings={handleSettingsClick} /></div>
      </aside>

      <main className="flex-1 overflow-y-auto relative min-h-[100dvh] bg-background">
        <span aria-hidden="true" className="aurora-ambient" />
        <div className="px-4 sm:px-6 md:px-12 py-8 md:py-12 max-w-[1600px] mx-auto min-h-full relative z-10">{children}</div>
      </main>
    </div>
  )
}
