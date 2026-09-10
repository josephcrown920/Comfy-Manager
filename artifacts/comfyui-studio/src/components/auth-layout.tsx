import type { ReactNode } from "react";
import { Link } from "wouter";
import portrait from "@/assets/thumbnails/cinematic-portrait.jpg";
import motion from "@/assets/thumbnails/mimicmotion.jpg";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-10">
        <Link href="/" className="text-xl font-bold tracking-[-0.04em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          AURORA<span className="ml-2 text-primary">/</span>
        </Link>
        <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Back to studio</Link>
      </header>
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-12 pt-3 sm:px-10 lg:grid-cols-2 lg:gap-16 lg:py-12">
        <section className="min-w-0">
          <div className="relative mb-6 grid aspect-[16/8] grid-cols-[1.3fr_1fr] gap-3 overflow-hidden rounded-2xl border border-border bg-card sm:aspect-[16/10]">
            <img src={portrait} alt="Cinematic portrait workflow example" className="h-full min-h-0 w-full object-cover" />
            <img src={motion} alt="Motion transfer workflow example" className="h-full min-h-0 w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-5 pb-4 pt-14">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">Workflow examples · portrait / motion</p>
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Your creative workspace</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">One idea.<br />Every possibility.</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Direct your next image, build a performance, and keep your generation work together.
          </p>
        </section>
        <section aria-label="Account access" className="min-w-0">{children}</section>
      </div>
    </main>
  );
}