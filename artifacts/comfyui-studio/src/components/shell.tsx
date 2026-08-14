import * as React from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, Settings2, Images, ListVideo, BrainCircuit, Rocket, Bot, Boxes } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generate", label: "Generate", icon: Boxes },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/jobs", label: "Jobs", icon: ListVideo },
  { href: "/gallery", label: "Gallery", icon: Images },
  { href: "/models", label: "Models", icon: BrainCircuit },
  { href: "/launch", label: "Launch GPU", icon: Rocket },
  { href: "/settings", label: "Settings", icon: Settings2 },
]

/** The "C" logomark — matches Comfy's chunky letter icon style */
function ComfyLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 700,
          fontSize: "20px",
          color: "#d4e84a",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          fontStyle: "italic",
        }}
      >
        C
      </span>
    </div>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-[#0d0d0d]">

      {/* ── Mobile top bar ── */}
      <div className="md:hidden border-b border-[#2a2a2a] bg-[#0d0d0d] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ComfyLogo className="w-7 h-7" />
          <span className="text-[#e8e8e8] font-semibold text-sm tracking-tight">ComfyUI Studio</span>
        </div>
      </div>

      {/* ── Mobile horizontal scroll nav ── */}
      <nav className="md:hidden flex overflow-x-auto border-b border-[#2a2a2a] bg-[#111111] px-2 py-1.5 snap-x scrollbar-hide gap-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-medium transition-all snap-start shrink-0",
                isActive
                  ? "bg-[#d4e84a]/10 text-[#d4e84a]"
                  : "text-[#666] hover:text-[#aaa] hover:bg-[#1a1a1a]"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* ── Desktop icon-only sidebar ── */}
      <aside className="hidden md:flex w-[52px] flex-col items-center border-r border-[#1e1e1e] bg-[#111111] py-3 gap-1">
        {/* Logo */}
        <Link href="/" className="w-9 h-9 flex items-center justify-center mb-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <ComfyLogo className="w-9 h-9" />
        </Link>

        <div className="w-6 h-px bg-[#2a2a2a] mb-1" />

        {/* Nav icons */}
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-lg transition-all relative group",
                isActive
                  ? "bg-[#d4e84a]/15 text-[#d4e84a]"
                  : "text-[#555] hover:text-[#bbb] hover:bg-[#1a1a1a]"
              )}
            >
              <Icon className="h-4 w-4" />
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md bg-[#1e1e1e] border border-[#2a2a2a] text-xs text-[#e8e8e8] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                {item.label}
              </span>
            </Link>
          )
        })}
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
