import * as React from "react"
import { Link, useLocation } from "wouter"
import { Boxes, LayoutDashboard, Settings2, Images, ListVideo, BrainCircuit, Rocket, Bot } from "lucide-react"

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
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-[#1a1a1a]">
      {/* Mobile Nav */}
      <div className="md:hidden border-b border-[#3a3a3a] bg-[#1a1a1a] p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-semibold text-lg tracking-tight">
          <div className="w-2 h-2 bg-[#ff9500]" />
          <span>ComfyUI Studio</span>
        </div>
      </div>
      <nav className="md:hidden flex overflow-x-auto border-b border-[#3a3a3a] bg-[#1a1a1a] px-2 py-2 snap-x scrollbar-hide">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-[2px] whitespace-nowrap text-sm font-medium transition-colors snap-start",
                isActive ? "bg-[#242424] text-[#e0e0e0] border-l-[3px] border-[#ff9500]" : "text-[#888] hover:text-[#e0e0e0]"
              )}
            >
              <Icon className={cn("h-[14px] w-[14px]", isActive ? "text-[#e0e0e0]" : "text-[#666]")} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[200px] flex-col border-r border-[#3a3a3a] bg-[#1a1a1a]">
        <div className="p-4 flex items-center gap-2 text-white font-semibold text-sm tracking-tight mb-2">
          <div className="w-2 h-2 bg-[#ff9500]" />
          <span>ComfyUI Studio</span>
        </div>
        <nav className="flex-1 flex flex-col">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive ? "bg-[#242424] text-[#e0e0e0] border-l-[3px] border-[#ff9500] pl-[9px]" : "text-[#888888] hover:text-[#e0e0e0] border-l-[3px] border-transparent"
                )}
              >
                <Icon className={cn("h-[14px] w-[14px]", isActive ? "text-[#e0e0e0]" : "text-[#666]")} />
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
