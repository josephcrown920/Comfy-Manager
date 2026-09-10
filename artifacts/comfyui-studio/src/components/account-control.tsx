import * as React from "react"
import { useClerk, useUser } from "@clerk/react"
import { Settings2, ChevronDown, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"

export function AccountControl({
  compact = false,
  onSettings,
}: {
  compact?: boolean
  onSettings: () => void
}) {
  const { isLoaded, isSignedIn, user } = useUser()
  const { signOut } = useClerk()
  const [isSigningOut, setIsSigningOut] = React.useState(false)
  const { toast } = useToast()

  if (!isLoaded || !isSignedIn || !user) return null

  const displayName =
    user.fullName?.trim() ||
    user.username?.trim() ||
    user.primaryEmailAddress?.emailAddress ||
    "Aurora Creator"
  const email = user.primaryEmailAddress?.emailAddress
  const initials =
    user.firstName?.[0] ||
    user.lastName?.[0] ||
    displayName.slice(0, 1).toUpperCase()
  const homePath = import.meta.env.BASE_URL || "/"

  async function handleSignOut() {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      await signOut({ redirectUrl: homePath })
    } catch {
      toast({
        title: "Sign out failed",
        description: "An error occurred while signing out. Please try again.",
        variant: "destructive",
      })
      setIsSigningOut(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isSigningOut}
          aria-label={`Open account menu for ${displayName}`}
          className={cn(
            "group flex items-center gap-3 rounded-xl border border-transparent text-left transition-all hover:bg-card hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60",
            compact ? "px-1.5 py-1.5" : "w-full px-3 py-2.5",
          )}
        >
          <Avatar className="h-9 w-9 border border-border bg-background">
            <AvatarImage src={user.imageUrl} alt={`${displayName} avatar`} />
            <AvatarFallback className="bg-background text-xs font-bold text-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className={cn("min-w-0 flex-1", compact ? "hidden sm:block max-w-[120px] md:max-w-[150px]" : "block")}>
            <span className="block truncate text-sm font-bold text-foreground group-hover:text-primary transition-colors">{displayName}</span>
            {!compact && email && (
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180", compact ? "hidden sm:block" : "block")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={compact ? "end" : "start"}
        sideOffset={8}
        className="z-[60] w-full max-w-[calc(100vw-2rem)] sm:max-w-64 border-border bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl"
      >
        <DropdownMenuLabel className="px-3 py-3">
          <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
          {email && <p className="truncate text-xs font-normal text-muted-foreground mt-0.5">{email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem onSelect={onSettings} className="cursor-pointer px-3 py-3 rounded-xl focus:bg-background focus:text-foreground">
          <Settings2 className="h-4 w-4 mr-2 text-muted-foreground" />
          <span className="font-medium">Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            void handleSignOut()
          }}
          disabled={isSigningOut}
          className="cursor-pointer px-3 py-3 rounded-xl text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4 mr-2" />
          <span className="font-medium">{isSigningOut ? "Signing out…" : "Sign out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
