import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, useGetComfyStatus, getGetComfyStatusQueryKey, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Zap, RefreshCw, CheckCircle2, ServerCrash, Cpu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { data: settings, isLoading: isSettingsLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  
  const { data: status, isFetching: isStatusFetching } = useGetComfyStatus({
    query: {
      queryKey: getGetComfyStatusQueryKey(),
      refetchInterval: 30000 // Poll occasionally just in case
    }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [comfyUrl, setComfyUrl] = useState("");

  useEffect(() => {
    if (settings) {
      setComfyUrl(settings.comfyUrl);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      data: { comfyUrl }
    }, {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetComfyStatusQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Failed to save settings", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleTestConnection = () => {
    toast({ title: "Testing connection..." });
    queryClient.invalidateQueries({ queryKey: getGetComfyStatusQueryKey() });
  };

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your ComfyUI connection.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Server className="h-5 w-5 text-primary" />
            Connection Details
          </CardTitle>
          <CardDescription>
            Enter the URL where your ComfyUI instance is running (e.g. http://127.0.0.1:8188).
            ComfyUI Studio acts as a proxy to this URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comfyUrl">ComfyUI Server URL</Label>
            {isSettingsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Input 
                id="comfyUrl"
                value={comfyUrl}
                onChange={(e) => setComfyUrl(e.target.value)}
                placeholder="http://127.0.0.1:8188"
                className="max-w-md font-mono"
              />
            )}
          </div>
        </CardContent>
        <CardFooter className="bg-muted/30 border-t py-4 flex justify-between items-center">
          <p className="text-xs text-muted-foreground">Changes apply immediately for new jobs.</p>
          <Button 
            onClick={handleSave} 
            disabled={updateSettings.isPending || isSettingsLoading}
          >
            {updateSettings.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </CardFooter>
      </Card>

      <Card className={status?.connected ? "border-green-500/50" : "border-destructive/50"}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5" />
              Live Server Status
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleTestConnection}
              disabled={isStatusFetching}
              className="gap-2"
            >
              <RefreshCw className={`h-3 w-3 ${isStatusFetching ? 'animate-spin' : ''}`} />
              Test Connection
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-4 space-y-4">
            <div className="flex items-center gap-3">
              {status?.connected ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : (
                <ServerCrash className="h-6 w-6 text-destructive" />
              )}
              <div>
                <p className="font-semibold text-foreground">
                  {status?.connected ? "Connected to ComfyUI" : "Connection Failed"}
                </p>
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {status?.serverUrl || comfyUrl || "Unknown URL"}
                </p>
              </div>
            </div>

            {status?.connected && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border mt-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Cpu className="h-4 w-4" /> GPU Name
                  </div>
                  <p className="font-medium text-sm">{status.gpuName || "Unknown"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Server className="h-4 w-4" /> GPU VRAM
                  </div>
                  <p className="font-medium text-sm">{status.gpuVram || "Unknown"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Server className="h-4 w-4" /> System RAM
                  </div>
                  <p className="font-medium text-sm">{status.ramUsed} / {status.ramTotal}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4" /> Queue Remaining
                  </div>
                  <p className="font-medium text-sm">{status.queueRemaining ?? 0} jobs</p>
                </div>
              </div>
            )}

            {!status?.connected && status?.error && (
              <div className="mt-4 pt-4 border-t border-destructive/20 text-sm text-destructive font-mono">
                Error: {status.error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
