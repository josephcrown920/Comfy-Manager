import { useGetComfyStatus, useGetJobStats, getGetComfyStatusQueryKey, useGetRecentOutputs, getGetRecentOutputsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Activity, CheckCircle2, Play, AlertCircle, Image as ImageIcon, Video, Mic, Wand2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: status, isLoading: isStatusLoading } = useGetComfyStatus({
    query: {
      refetchInterval: 10000,
      queryKey: getGetComfyStatusQueryKey()
    }
  });

  const { data: stats, isLoading: isStatsLoading } = useGetJobStats();

  const { data: recentOutputs, isLoading: isOutputsLoading } = useGetRecentOutputs({
    query: { queryKey: getGetRecentOutputsQueryKey() }
  });

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#e8e8e8]">Dashboard</h1>
        <p className="text-[#555] mt-0.5 text-sm">Your creative generation studio.</p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Status */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-[#555]">Server Status</p>
            {isStatusLoading ? (
              <Skeleton className="h-5 w-20 bg-[#252525]" />
            ) : status?.connected ? (
              <div className="flex items-center gap-1.5 text-[#4caf50] font-medium text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4caf50]" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[#e05555] font-medium text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#e05555]" />
                Offline
              </div>
            )}
          </div>
          <Activity className="h-4 w-4 text-[#444]" />
        </div>

        {/* Running */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-[#555]">Running</p>
            <div className="text-xl font-semibold text-[#e8e8e8]">
              {isStatsLoading ? <Skeleton className="h-6 w-8 bg-[#252525]" /> : stats?.running ?? 0}
            </div>
          </div>
          <Play className="h-4 w-4 text-[#444]" />
        </div>

        {/* Completed */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-[#555]">Completed</p>
            <div className="text-xl font-semibold text-[#e8e8e8]">
              {isStatsLoading ? <Skeleton className="h-6 w-8 bg-[#252525]" /> : stats?.completed ?? 0}
            </div>
          </div>
          <CheckCircle2 className="h-4 w-4 text-[#444]" />
        </div>

        {/* Failed */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-[#555]">Failed</p>
            <div className="text-xl font-semibold text-[#e05555]">
              {isStatsLoading ? <Skeleton className="h-6 w-8 bg-[#252525]" /> : stats?.failed ?? 0}
            </div>
          </div>
          <AlertCircle className="h-4 w-4 text-[#e05555]/50" />
        </div>
      </div>

      {/* Quick Start */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-[#444] font-medium">Quick Start</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: "/generate?category=image-generation", icon: ImageIcon, label: "Image Generation", sub: "Text to Image, Img2Img" },
            { href: "/generate?category=video-generation", icon: Video, label: "Video Generation", sub: "Animate, Text to Video" },
            { href: "/generate?category=lip-sync", icon: Mic, label: "Lip Sync", sub: "Audio to Face animation" },
            { href: "/generate?category=motion-control", icon: Wand2, label: "Motion Control", sub: "Advanced controlnets" },
          ].map(({ href, icon: Icon, label, sub }) => (
            <Link key={href} href={href}>
              <div className="group p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl cursor-pointer hover:border-[#d4e84a]/40 hover:bg-[#1e1e1e] transition-all flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#252525] flex items-center justify-center shrink-0 group-hover:bg-[#d4e84a]/10 transition-colors">
                  <Icon className="h-4 w-4 text-[#555] group-hover:text-[#d4e84a] transition-colors" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-[#e8e8e8] leading-tight">{label}</h3>
                  <p className="text-xs text-[#444] mt-0.5">{sub}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Outputs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-[#444] font-medium">Recent Outputs</h2>
          <Link href="/gallery" className="text-xs text-[#d4e84a] hover:text-[#c8dc3e] font-medium transition-colors">View all</Link>
        </div>
        {isOutputsLoading ? (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl bg-[#1a1a1a]" />
            ))}
          </div>
        ) : recentOutputs && recentOutputs.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {recentOutputs.map((output) => (
              <div
                key={output.id}
                className="relative aspect-square rounded-xl border border-[#2a2a2a] overflow-hidden bg-[#1a1a1a] group hover:border-[#d4e84a]/50 transition-all cursor-pointer"
              >
                {output.outputType === 'video' ? (
                  <video
                    src={output.comfyUrl}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                    muted loop playsInline
                    onMouseEnter={e => e.currentTarget.play()}
                    onMouseLeave={e => e.currentTarget.pause()}
                  />
                ) : (
                  <img
                    src={output.thumbnailUrl || output.comfyUrl}
                    alt={output.filename}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                )}
                {output.outputType === 'video' && (
                  <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-md p-0.5 text-white backdrop-blur">
                    <Video className="h-2.5 w-2.5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[#444] bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl text-sm">
            No recent outputs found. Start generating to see them here.
          </div>
        )}
      </div>
    </div>
  );
}
