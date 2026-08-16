import * as React from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, Settings2, Images, ListVideo, BrainCircuit, Rocket, Bot, Boxes, Menu, X, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generate", label: "Workflows", icon: Boxes },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/jobs", label: "Jobs", icon: ListVideo },
  { href: "/gallery", label: "Gallery", icon: Images },
  { href: "/models", label: "Models", icon: BrainCircuit },
  { href: "/launch", label: "Launch GPU", icon: Rocket },
  { href: "/guide", label: "Guide", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings2 },
]

/** comfy.org wordmark — bold italic yellow-green */
function ComfyWordmark() {
  return (
    <span
      style={{
        fontFamily: "'Inter', sans-serif",
        fontWeight: 800,
        fontStyle: "italic",
        fontSize: "22px",
        color: "#e8f724",
        letterSpacing: "-0.03em",
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      Comfy
    </span>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  // Close drawer on navigation
  React.useEffect(() => { setMobileOpen(false) }, [location])

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#16122a]">

      {/* ── Top nav bar ── */}
      <header className="sticky top-0 z-40 border-b border-[#2d2650] bg-[#16122a]/95 backdrop-blur-sm">
        <div className="flex items-center h-14 px-4 md:px-6 gap-4 max-w-[1400px] mx-auto">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 mr-2">
            <ComfyWordmark />
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                    isActive
                      ? "bg-[#e8f724]/15 text-[#e8f724]"
                      : "text-[#7b72a8] hover:text-[#f0eeff] hover:bg-[#2a2448]"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden md:flex items-center gap-2 ml-auto">
            <Link href="/settings">
              <button className="px-4 py-1.5 rounded-full border border-[#2d2650] text-sm text-[#f0eeff] hover:bg-[#2a2448] transition-colors font-medium">
                Settings
              </button>
            </Link>
            <Link href="/generate">
              <button className="px-4 py-1.5 rounded-full bg-[#e8f724] text-[#0d0b1a] text-sm font-bold hover:bg-[#d4e010] transition-colors">
                Run Workflow
              </button>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden ml-auto p-2 rounded-lg text-[#7b72a8] hover:text-[#f0eeff] hover:bg-[#2a2448] transition-colors"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile dropdown nav */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-[#2d2650] bg-[#1a163a] px-4 py-3 flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isActive
                      ? "bg-[#e8f724]/15 text-[#e8f724]"
                      : "text-[#7b72a8] hover:text-[#f0eeff] hover:bg-[#2a2448]"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
            <div className="pt-2 mt-1 border-t border-[#2d2650] flex gap-2">
              <Link href="/generate" className="flex-1">
                <button className="w-full px-4 py-2 rounded-full bg-[#e8f724] text-[#0d0b1a] text-sm font-bold hover:bg-[#d4e010] transition-colors">
                  Run Workflow
                </button>
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
