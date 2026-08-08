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
          <h1 className="text-4xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-lg">Your creative generation studio.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status Card */}
        <Card className="border-l-4 border-l-primary hover-elevate">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Server Status</p>
              <div className="flex items-center gap-2">
                {isStatusLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : status?.connected ? (
                  <div className="flex items-center gap-2 text-green-500 font-semibold text-lg">
                    <CheckCircle2 className="h-5 w-5" />
                    Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive font-semibold text-lg">
                    <ServerCrash className="h-5 w-5" />
                    Offline
                  </div>
                )}
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Activity className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Running Jobs */}
        <Card className="hover-elevate">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Running</p>
              <div className="text-3xl font-display font-bold">
                {isStatsLoading ? <Skeleton className="h-8 w-12" /> : stats?.running || 0}
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-500">
              <Play className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Completed Jobs */}
        <Card className="hover-elevate">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Completed</p>
              <div className="text-3xl font-display font-bold">
                {isStatsLoading ? <Skeleton className="h-8 w-12" /> : stats?.completed || 0}
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Failed Jobs */}
        <Card className="hover-elevate">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Failed</p>
              <div className="text-3xl font-display font-bold text-destructive">
                {isStatsLoading ? <Skeleton className="h-8 w-12" /> : stats?.failed || 0}
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-display font-bold">Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link href="/generate?category=image-generation">
            <div className="p-6 rounded-xl border bg-card hover:bg-secondary transition-colors cursor-pointer group flex flex-col items-center justify-center text-center gap-3">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <ImageIcon className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Image Generation</h3>
                <p className="text-xs text-muted-foreground">Text to Image, Img2Img</p>
              </div>
            </div>
          </Link>
          <Link href="/generate?category=video-generation">
            <div className="p-6 rounded-xl border bg-card hover:bg-secondary transition-colors cursor-pointer group flex flex-col items-center justify-center text-center gap-3">
              <div className="h-16 w-16 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-transform">
                <Video className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Video Generation</h3>
                <p className="text-xs text-muted-foreground">Animate, Text to Video</p>
              </div>
            </div>
          </Link>
          <Link href="/generate?category=lip-sync">
            <div className="p-6 rounded-xl border bg-card hover:bg-secondary transition-colors cursor-pointer group flex flex-col items-center justify-center text-center gap-3">
              <div className="h-16 w-16 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-500 group-hover:scale-110 transition-transform">
                <Mic className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Lip Sync</h3>
                <p className="text-xs text-muted-foreground">Audio to Face animation</p>
              </div>
            </div>
          </Link>
          <Link href="/generate?category=motion-control">
            <div className="p-6 rounded-xl border bg-card hover:bg-secondary transition-colors cursor-pointer group flex flex-col items-center justify-center text-center gap-3">
              <div className="h-16 w-16 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                <Wand2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Motion Control</h3>
                <p className="text-xs text-muted-foreground">Advanced controlnets</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold">Recent Outputs</h2>
          <Link href="/gallery" className="text-sm text-primary hover:underline font-medium">View all</Link>
        </div>
        {isOutputsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : recentOutputs && recentOutputs.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {recentOutputs.map((output) => (
              <div key={output.id} className="relative aspect-square rounded-xl border overflow-hidden bg-muted group hover-elevate">
                {output.outputType === 'video' ? (
                  <video src={output.comfyUrl} className="w-full h-full object-cover" muted loop playsInline onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => e.currentTarget.pause()} />
                ) : (
                  <img src={output.thumbnailUrl || output.comfyUrl} alt={output.filename} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                )}
                {output.outputType === 'video' && (
                  <div className="absolute top-2 right-2 bg-black/60 rounded p-1 text-white backdrop-blur">
                    <Video className="h-3 w-3" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Card className="bg-transparent border-dashed">
            <CardContent className="p-12 text-center text-muted-foreground">
              No recent outputs found. Start generating to see them here.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
