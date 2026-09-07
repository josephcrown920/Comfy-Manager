import * as React from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, Settings2, Images, ListVideo, BrainCircuit, Rocket, Bot, Boxes, Menu, X, BookOpen, GitBranch, Zap, Clapperboard } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generate", label: "Workflows", icon: Boxes },
  { href: "/batches", label: "Batch Studio", icon: GitBranch },
  { href: "/perform-anywhere", label: "Perform Anywhere", icon: Clapperboard },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/jobs", label: "Jobs", icon: ListVideo },
  { href: "/gallery", label: "Gallery", icon: Images },
  { href: "/models", label: "Models", icon: BrainCircuit },
  { href: "/launch", label: "Launch GPU", icon: Rocket },
  { href: "/guide", label: "Guide", icon: BookOpen },
]

/** comfy.org wordmark — bold italic yellow-green */
function ComfyWordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(232,247,36,0.3)]">
        <Zap className="w-5 h-5 text-black" strokeWidth={2.5} />
      </div>
      {!collapsed && (
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800,
            fontSize: "20px",
            color: "#ffffff",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          Studio
        </span>
      )}
    </div>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  // Close drawer on navigation
  React.useEffect(() => { setMobileOpen(false) }, [location])

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background selection:bg-primary/30 selection:text-white font-sans text-foreground">
      
      {/* ── Mobile Header ── */}
      <header className="md:hidden sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-between h-16 px-4">
        <Link href="/" className="flex items-center">
          <ComfyWordmark />
        </Link>
        <button
          className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* ── Mobile Nav Overlay ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 top-16 bg-background/95 backdrop-blur-3xl overflow-y-auto">
          <nav className="flex flex-col p-4 gap-2">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(232,247,36,0.2)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              )
            })}
            <div className="h-px bg-border my-2" />
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all",
                location.startsWith("/settings")
                  ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(232,247,36,0.2)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Settings2 className="h-5 w-5" />
              Settings
            </Link>
          </nav>
        </div>
      )}

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-[260px] shrink-0 border-r border-border bg-card/30 backdrop-blur-2xl sticky top-0 h-[100dvh] overflow-y-auto">
        <div className="h-20 flex items-center px-6">
          <Link href="/" className="flex items-center">
            <ComfyWordmark />
          </Link>
        </div>

        <div className="px-4 pb-4">
          <Link href="/generate">
            <button className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-[0_0_20px_rgba(232,247,36,0.15)] hover:shadow-[0_0_30px_rgba(232,247,36,0.3)] hover:scale-[1.02] transition-all duration-300">
              <Zap className="h-4 w-4 fill-current" />
              Run Workflow
            </button>
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto py-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-border mt-auto">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
              location.startsWith("/settings")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Settings2 className={cn("h-4 w-4 transition-colors", location.startsWith("/settings") ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            Settings
          </Link>
        </div>
      </aside>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-y-auto relative">
        <span aria-hidden="true" className="aurora-ambient" />
        <div className="px-4 md:px-10 py-6 md:py-10 max-w-[1600px] mx-auto min-h-full">
          {children}
        </div>
      </main>
    </div>
  )
}
