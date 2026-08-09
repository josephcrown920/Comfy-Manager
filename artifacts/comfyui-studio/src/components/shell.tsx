import * as React from "react"
import { Link, useLocation } from "wouter"
import { Boxes, LayoutDashboard, Settings2, Images, ListVideo, Layers, BrainCircuit, Rocket, Bot } from "lucide-react"

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

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Mobile Nav */}
      <div className="md:hidden border-b border-border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary font-display font-bold text-xl">
          <Layers className="h-6 w-6" />
          <span>ComfyUI Studio</span>
        </div>
      </div>
      <nav className="md:hidden flex overflow-x-auto border-b border-border bg-card/50 px-2 py-2 snap-x scrollbar-hide">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors snap-start",
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="p-6 flex items-center gap-3 text-primary font-display font-bold text-2xl tracking-tight">
          <Layers className="h-7 w-7" />
          <span>Studio</span>
        </div>
        <nav className="flex-1 px-4 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
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
