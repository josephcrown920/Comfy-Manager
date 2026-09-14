import { useGetComfyStatus, useGetJobStats, getGetComfyStatusQueryKey, useGetRecentOutputs, getGetRecentOutputsQueryKey, getGetJobStatsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, Play, AlertCircle, Video, Server, ArrowRight, Images } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import latentsyncThumbnail from "@/assets/thumbnails/latentsync.jpg";
import animatediffThumbnail from "@/assets/thumbnails/animatediff.jpg";
import reelLoopThumbnail from "@/assets/thumbnails/reel-loop.jpg";
import mimicmotionThumbnail from "@/assets/thumbnails/mimicmotion.jpg";

type LandingContent = {
  slots: Array<{
    id: string;
    title: string;
    description: string;
    mediaId: string | null;
    ctaLabel: string;
    ctaHref: string;
  }>;
  media: Array<{
    id: string;
    kind: "image" | "video";
    url: string;
    altText: string;
  }>;
};

export default function Dashboard() {
  const { isSignedIn, isLoaded } = useAuth();

  const { data: status, isLoading: isStatusLoading } = useGetComfyStatus({
    query: { refetchInterval: 10000, queryKey: getGetComfyStatusQueryKey(), enabled: !!isSignedIn }
  });
  const { data: stats, isLoading: isStatsLoading } = useGetJobStats({
    query: { enabled: !!isSignedIn, queryKey: getGetJobStatsQueryKey() }
  });
  const { data: recentOutputs, isLoading: isOutputsLoading } = useGetRecentOutputs({
    query: { queryKey: getGetRecentOutputsQueryKey(), enabled: !!isSignedIn }
  });
  const { data: landingContent } = useQuery<LandingContent>({
    queryKey: ["landing-content"],
    queryFn: async () => {
      const response = await fetch("/api/content/landing");
      if (!response.ok) throw new Error("Could not load landing content");
      return response.json() as Promise<LandingContent>;
    },
    staleTime: 60_000,
  });
  const landingMedia = new Map((landingContent?.media ?? []).map((asset) => [asset.id, asset]));

  return (
    <div className="space-y-16 animate-in fade-in duration-700 ease-out">
      {/* Hero Section */}
      <div className="flex flex-col gap-8">
        <div className="relative w-full rounded-[2rem] overflow-hidden aspect-[16/10] md:aspect-[24/9] bg-card border border-border group">
          <img 
            src={animatediffThumbnail} 
            alt="Hero visual" 
            className="w-full h-full object-cover opacity-60 group-hover:scale-105 group-hover:opacity-70 transition-all duration-[2000ms] ease-out" 
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          
          <div className="absolute bottom-0 left-0 p-8 md:p-14 w-full max-w-4xl">
            {isSignedIn && status?.connected && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/60 backdrop-blur-md border border-border mb-6 shadow-xl">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(183,245,74,0.8)]" />
                <span className="text-xs font-bold tracking-wide uppercase text-foreground">ComfyUI Ready</span>
              </div>
            )}
            <h1 className="text-4xl md:text-7xl font-bold text-foreground tracking-tight leading-[1.1] mb-6">
              Visual Direction, <br/> Rendered.
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mb-10 leading-relaxed font-medium">
              The professional workspace for advanced image and video generation. 
              Produce assets, sync audio, and control motion with precision.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/generate">
                <button className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-bold hover:brightness-110 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(183,245,74,0.15)]">
                  Start Creating <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
              {!isSignedIn ? (
                <Link href="/guide">
                  <button className="px-8 py-4 rounded-xl bg-card border border-border text-foreground font-bold hover:bg-secondary hover:text-secondary-foreground hover:border-secondary transition-all">
                    Read the Guide
                  </button>
                </Link>
              ) : (
                <Link href="/batches">
                  <button className="px-8 py-4 rounded-xl bg-card border border-border text-foreground font-bold hover:bg-secondary hover:text-secondary-foreground hover:border-secondary transition-all">
                    Batch Studio
                  </button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {landingContent?.slots.length ? (
        <section className="space-y-8">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-primary">Studio stories</p>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">See Aurora in motion</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {landingContent.slots.map((slot) => {
              const asset = slot.mediaId ? landingMedia.get(slot.mediaId) : undefined;
              return (
                <article key={slot.id} className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
                  <div className="aspect-[16/9] bg-background">
                    {asset?.kind === "video" ? (
                      <video
                        src={asset.url}
                        className="h-full w-full object-cover"
                        muted
                        loop
                        autoPlay
                        playsInline
                        preload="none"
                        aria-label={asset.altText}
                      />
                    ) : asset ? (
                      <img src={asset.url} alt={asset.altText} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Add a visual in Admin Studio</div>
                    )}
                  </div>
                  <div className="space-y-3 p-6 md:p-8">
                    <h3 className="text-xl font-bold tracking-tight">{slot.title}</h3>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">{slot.description}</p>
                    {slot.ctaHref && (
                      <Link href={slot.ctaHref} className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:brightness-110">
                        {slot.ctaLabel || "Explore"} <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Featured Workflows */}
      <div className="space-y-8">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Core Capabilities</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { href: "/generate?category=video-generation", image: reelLoopThumbnail, label: "Video Generation", desc: "Animate compositions natively." },
            { href: "/generate?category=lip-sync", image: latentsyncThumbnail, label: "Lip Sync", desc: "Audio-driven facial animation." },
            { href: "/generate?category=motion-control", image: mimicmotionThumbnail, label: "Motion Control", desc: "Temporal consistency & posing." },
            { href: "/generate?category=image-generation", image: animatediffThumbnail, label: "Image Generation", desc: "High fidelity text-to-image." },
          ].map((item, idx) => (
            <Link key={idx} href={item.href}>
              <div className="group flex flex-col gap-5 cursor-pointer">
                <div className="relative aspect-video rounded-3xl overflow-hidden bg-card border border-border shadow-xl">
                  <img 
                    src={item.image} 
                    alt={item.label} 
                    className="w-full h-full object-cover opacity-70 group-hover:scale-105 group-hover:opacity-100 transition-all duration-700 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none" />
                </div>
                <div className="px-1">
                  <h3 className="text-lg font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">{item.label}</h3>
                  <p className="text-sm font-medium text-muted-foreground mt-1.5">{item.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Stats - Rendered if authenticated */}
      {isSignedIn && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 p-8 rounded-[2rem] bg-card border border-border flex flex-col justify-between min-h-[180px] shadow-xl">
            <div className="flex items-center gap-3 text-muted-foreground mb-4">
              <Server className="w-5 h-5 text-secondary" />
              <span className="text-sm font-bold tracking-wide uppercase">Connection</span>
            </div>
            {isStatusLoading ? (
              <Skeleton className="h-10 w-32 bg-muted rounded-lg" />
            ) : status?.connected ? (
              <div>
                <div className="text-4xl font-bold text-foreground tracking-tight">Online</div>
                <div className="text-sm text-primary font-bold mt-2">GPU processing available</div>
              </div>
            ) : (
              <div>
                <div className="text-4xl font-bold text-foreground tracking-tight">Offline</div>
                <div className="text-sm text-destructive font-bold mt-2">Check server status</div>
              </div>
            )}
          </div>

          <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6 p-8 rounded-[2rem] bg-card border border-border shadow-xl">
            <div className="flex flex-col justify-between">
              <div className="flex items-center gap-3 text-muted-foreground mb-4">
                <Play className="w-5 h-5 text-secondary" />
                <span className="text-sm font-bold tracking-wide uppercase">Running</span>
              </div>
              {isStatsLoading ? <Skeleton className="h-10 w-20 bg-muted rounded-lg" /> : <div className="text-5xl font-bold text-foreground tracking-tight">{stats?.running ?? 0}</div>}
            </div>
            <div className="flex flex-col justify-between">
              <div className="flex items-center gap-3 text-muted-foreground mb-4">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold tracking-wide uppercase">Completed</span>
              </div>
              {isStatsLoading ? <Skeleton className="h-10 w-20 bg-muted rounded-lg" /> : <div className="text-5xl font-bold text-foreground tracking-tight">{stats?.completed ?? 0}</div>}
            </div>
            <div className="flex flex-col justify-between">
              <div className="flex items-center gap-3 text-muted-foreground mb-4">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <span className="text-sm font-bold tracking-wide uppercase">Failed</span>
              </div>
              {isStatsLoading ? <Skeleton className="h-10 w-20 bg-muted rounded-lg" /> : <div className="text-5xl font-bold text-destructive tracking-tight">{stats?.failed ?? 0}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Recent Outputs */}
      {isSignedIn && (
        <div className="space-y-8 pb-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Recent Renders</h2>
            <Link href="/gallery" className="text-sm text-secondary font-bold hover:text-primary transition-colors flex items-center gap-1">
              View Gallery <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          {isOutputsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-[2rem] bg-card border border-border" />
              ))}
            </div>
          ) : recentOutputs && recentOutputs.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {recentOutputs.slice(0, 10).map((output) => (
                <div key={output.id} className="group relative aspect-square rounded-[2rem] bg-card border border-border overflow-hidden shadow-lg">
                  {output.outputType === 'video' ? (
                    <video
                      src={output.comfyUrl}
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-500"
                      controls playsInline preload="none"
                      poster={output.thumbnailUrl || undefined}
                      aria-label={`Preview ${output.filename}`}
                    />
                  ) : (
                    <img 
                      src={output.thumbnailUrl || output.comfyUrl} 
                      alt={output.filename}
                      loading="lazy"
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-500" 
                    />
                  )}
                  {output.outputType === 'video' && (
                    <div className="absolute top-4 right-4 bg-background/80 backdrop-blur-md rounded-full p-2 text-foreground shadow-lg">
                      <Video className="h-4 w-4" />
                    </div>
                  )}
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2rem] pointer-events-none" />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 rounded-[2rem] bg-card border border-border text-center flex flex-col items-center shadow-xl">
              <Images className="w-16 h-16 text-muted-foreground mb-6 opacity-30" />
              <p className="text-xl text-foreground font-bold mb-2">No recent renders</p>
              <p className="text-muted-foreground mb-8 font-medium">Your canvas is completely empty.</p>
              <Link href="/generate">
                <button className="px-8 py-4 rounded-xl bg-secondary text-secondary-foreground font-bold hover:brightness-110 transition-all">
                  Start a Workflow
                </button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
