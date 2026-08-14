import { useGetComfyStatus, useGetJobStats, getGetComfyStatusQueryKey, useGetRecentOutputs, getGetRecentOutputsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Activity, ServerCrash, CheckCircle2, Play, AlertCircle, Image as ImageIcon, Video, Mic, Wand2 } from "lucide-react";
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
      <div className="flex flex-col md:flex-row gap-4 md:items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your creative generation studio.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status Card */}
        <Card className="border-l-4 border-l-[#3a3a3a]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Server Status</p>
              <div className="flex items-center gap-2">
                {isStatusLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : status?.connected ? (
                  <div className="flex items-center gap-2 text-[#4a4] font-medium text-lg">
                    <div className="w-2 h-2 rounded-full bg-[#4a4]" />
                    Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[#d44] font-medium text-lg">
                    <div className="w-2 h-2 rounded-full bg-[#d44]" />
                    Offline
                  </div>
                )}
              </div>
            </div>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>

        {/* Running Jobs */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Running</p>
              <div className="text-2xl font-semibold">
                {isStatsLoading ? <Skeleton className="h-8 w-12" /> : stats?.running || 0}
              </div>
            </div>
            <Play className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>

        {/* Completed Jobs */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Completed</p>
              <div className="text-2xl font-semibold">
                {isStatsLoading ? <Skeleton className="h-8 w-12" /> : stats?.completed || 0}
              </div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>

        {/* Failed Jobs */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Failed</p>
              <div className="text-2xl font-semibold text-[#d44]">
                {isStatsLoading ? <Skeleton className="h-8 w-12" /> : stats?.failed || 0}
              </div>
            </div>
            <AlertCircle className="h-5 w-5 text-[#d44]" />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-[#e0e0e0] font-medium">Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link href="/generate?category=image-generation">
            <div className="p-4 bg-[#242424] hover:bg-[#2d2d2d] hover:border-l-[2px] hover:border-[#ff9500] hover:pl-[14px] border-l-[2px] border-transparent transition-all cursor-pointer flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium text-sm text-[#e0e0e0]">Image Generation</h3>
                <p className="text-xs text-[#555555]">Text to Image, Img2Img</p>
              </div>
            </div>
          </Link>
          <Link href="/generate?category=video-generation">
            <div className="p-4 bg-[#242424] hover:bg-[#2d2d2d] hover:border-l-[2px] hover:border-[#ff9500] hover:pl-[14px] border-l-[2px] border-transparent transition-all cursor-pointer flex items-center gap-3">
              <Video className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium text-sm text-[#e0e0e0]">Video Generation</h3>
                <p className="text-xs text-[#555555]">Animate, Text to Video</p>
              </div>
            </div>
          </Link>
          <Link href="/generate?category=lip-sync">
            <div className="p-4 bg-[#242424] hover:bg-[#2d2d2d] hover:border-l-[2px] hover:border-[#ff9500] hover:pl-[14px] border-l-[2px] border-transparent transition-all cursor-pointer flex items-center gap-3">
              <Mic className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium text-sm text-[#e0e0e0]">Lip Sync</h3>
                <p className="text-xs text-[#555555]">Audio to Face animation</p>
              </div>
            </div>
          </Link>
          <Link href="/generate?category=motion-control">
            <div className="p-4 bg-[#242424] hover:bg-[#2d2d2d] hover:border-l-[2px] hover:border-[#ff9500] hover:pl-[14px] border-l-[2px] border-transparent transition-all cursor-pointer flex items-center gap-3">
              <Wand2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium text-sm text-[#e0e0e0]">Motion Control</h3>
                <p className="text-xs text-[#555555]">Advanced controlnets</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-widest text-[#e0e0e0] font-medium">Recent Outputs</h2>
          <Link href="/gallery" className="text-xs text-[#ff9500] hover:underline font-medium">View all</Link>
        </div>
        {isOutputsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-[2px]" />)}
          </div>
        ) : recentOutputs && recentOutputs.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {recentOutputs.map((output) => (
              <div key={output.id} className="relative aspect-square rounded-[2px] border border-[#3a3a3a] overflow-hidden bg-[#242424] group hover:border-[#ff9500] transition-colors">
                {output.outputType === 'video' ? (
                  <video src={output.comfyUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" muted loop playsInline onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => e.currentTarget.pause()} />
                ) : (
                  <img src={output.thumbnailUrl || output.comfyUrl} alt={output.filename} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                )}
                {output.outputType === 'video' && (
                  <div className="absolute top-2 right-2 bg-black/60 rounded-[2px] p-1 text-white backdrop-blur">
                    <Video className="h-3 w-3" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-[#555555] bg-[#242424] border border-[#3a3a3a] text-sm">
            No recent outputs found. Start generating to see them here.
          </div>
        )}
      </div>
    </div>
  );
}
