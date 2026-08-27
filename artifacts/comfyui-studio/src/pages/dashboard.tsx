import { useGetComfyStatus, useGetJobStats, getGetComfyStatusQueryKey, useGetRecentOutputs, getGetRecentOutputsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Activity, CheckCircle2, Play, AlertCircle, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import latentsyncThumbnail from "@/assets/thumbnails/latentsync.jpg";
import animatediffThumbnail from "@/assets/thumbnails/animatediff.jpg";
import reelLoopThumbnail from "@/assets/thumbnails/reel-loop.jpg";
import mimicmotionThumbnail from "@/assets/thumbnails/mimicmotion.jpg";

export default function Dashboard() {
  const { data: status, isLoading: isStatusLoading } = useGetComfyStatus({
    query: { refetchInterval: 10000, queryKey: getGetComfyStatusQueryKey() }
  });
  const { data: stats, isLoading: isStatsLoading } = useGetJobStats();
  const { data: recentOutputs, isLoading: isOutputsLoading } = useGetRecentOutputs({
    query: { queryKey: getGetRecentOutputsQueryKey() }
  });

  return (
    <div className="space-y-10 animate-in fade-in zoom-in-95 duration-300">
      {/* Hero header */}
      <div className="text-center pt-4 pb-2">
        <p className="text-xs font-semibold tracking-widest uppercase text-[#e8f724] mb-3">ComfyUI Studio</p>
        <h1 className="text-4xl md:text-5xl font-bold text-[#f0eeff] tracking-tight leading-tight">
          Your creative<br className="hidden sm:block" /> generation studio
        </h1>
        <p className="text-[#7b72a8] mt-3 text-base max-w-lg mx-auto">
          Connect your ComfyUI server and start generating images and videos from your browser.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <Link href="/generate">
            <button className="px-6 py-2.5 rounded-full bg-[#e8f724] text-[#0d0b1a] font-bold text-sm hover:bg-[#d4e010] transition-colors">
              Browse Workflows
            </button>
          </Link>
          <Link href="/settings">
            <button className="px-6 py-2.5 rounded-full border border-[#2d2650] text-[#f0eeff] font-medium text-sm hover:bg-[#2a2448] transition-colors">
              Connect Server
            </button>
          </Link>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Server Status",
            icon: <Activity className="h-4 w-4 text-[#4a4269]" />,
            value: isStatusLoading ? null : status?.connected ? (
              <div className="flex items-center gap-1.5 text-[#4caf50] font-semibold text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4caf50]" /> Connected
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[#e05555] font-semibold text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#e05555]" /> Offline
              </div>
            ),
          },
          {
            label: "Running",
            icon: <Play className="h-4 w-4 text-[#4a4269]" />,
            value: isStatsLoading ? null : <span className="text-2xl font-bold text-[#f0eeff]">{stats?.running ?? 0}</span>,
          },
          {
            label: "Completed",
            icon: <CheckCircle2 className="h-4 w-4 text-[#4a4269]" />,
            value: isStatsLoading ? null : <span className="text-2xl font-bold text-[#f0eeff]">{stats?.completed ?? 0}</span>,
          },
          {
            label: "Failed",
            icon: <AlertCircle className="h-4 w-4 text-[#e05555]/50" />,
            value: isStatsLoading ? null : <span className="text-2xl font-bold text-[#e05555]">{stats?.failed ?? 0}</span>,
          },
        ].map(({ label, icon, value }) => (
          <div key={label} className="bg-[#1e1a38] border border-[#2d2650] rounded-2xl p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-[#7b72a8]">{label}</p>
              {value === null ? <Skeleton className="h-6 w-16 bg-[#2a2448]" /> : value}
            </div>
            {icon}
          </div>
        ))}
      </div>

      {/* Quick Start */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#2d2650]" />
          <span className="text-xs font-semibold tracking-widest uppercase text-[#4a4269]">Quick Start</span>
          <div className="h-px flex-1 bg-[#2d2650]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { href: "/generate?category=image-generation", image: animatediffThumbnail, label: "Image Generation", sub: "Text to Image, Img2Img" },
            { href: "/generate?category=video-generation", image: reelLoopThumbnail, label: "Video Generation", sub: "Animate, Text to Video" },
            { href: "/generate?category=lip-sync", image: latentsyncThumbnail, label: "Lip Sync", sub: "Audio to Face animation" },
            { href: "/generate?category=motion-control", image: mimicmotionThumbnail, label: "Motion Control", sub: "Advanced controlnets" },
          ].map(({ href, image, label, sub }) => (
            <Link key={href} href={href}>
              <div className="group overflow-hidden bg-[#1e1a38] border border-[#2d2650] rounded-2xl cursor-pointer hover:border-[#e8f724]/50 hover:bg-[#231f42] transition-all">
                <div className="relative aspect-[16/8] overflow-hidden">
                  <img src={image} alt="" className="h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105 group-hover:opacity-100" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111022] via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#e8f724] backdrop-blur-md">
                    Explore workflow
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-sm text-[#f0eeff] leading-tight">{label}</h3>
                  <p className="text-xs text-[#7b72a8] mt-1">{sub}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Outputs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#f0eeff]">Recent Outputs</h2>
          <Link href="/gallery" className="text-xs text-[#e8f724] hover:text-[#d4e010] font-semibold transition-colors">View all →</Link>
        </div>
        {isOutputsLoading ? (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl bg-[#1e1a38]" />
            ))}
          </div>
        ) : recentOutputs && recentOutputs.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {recentOutputs.map((output) => (
              <div
                key={output.id}
                className="relative aspect-square rounded-2xl border border-[#2d2650] overflow-hidden bg-[#1e1a38] group hover:border-[#e8f724]/40 transition-all cursor-pointer"
              >
                {output.outputType === 'video' ? (
                  <video src={output.comfyUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" muted loop playsInline
                    onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => e.currentTarget.pause()} />
                ) : (
                  <img src={output.thumbnailUrl || output.comfyUrl} alt={output.filename}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                )}
                {output.outputType === 'video' && (
                  <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-lg p-0.5 text-white backdrop-blur">
                    <Video className="h-2.5 w-2.5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[#4a4269] bg-[#1e1a38] border border-[#2d2650] rounded-2xl text-sm">
            No recent outputs found. Start generating to see them here.
          </div>
        )}
      </div>
    </div>
  );
}
