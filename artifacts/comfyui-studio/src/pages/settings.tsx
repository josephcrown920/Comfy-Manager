import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, useGetComfyStatus, getGetComfyStatusQueryKey, getGetSettingsQueryKey, useAddSavedGpu, useDeleteSavedGpu } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Zap, RefreshCw, CheckCircle2, ServerCrash, Cpu, Bookmark, Trash2, ArrowRightLeft } from "lucide-react";
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

  const addGpu = useAddSavedGpu();
  const deleteGpu = useDeleteSavedGpu();
  const [newGpuLabel, setNewGpuLabel] = useState("");

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetComfyStatusQueryKey() });
  };

  const handleSaveCurrentGpu = () => {
    if (!newGpuLabel.trim() || !comfyUrl.trim()) {
      toast({ title: "Enter a label (e.g. Colab, Kaggle) and make sure the URL above is filled in", variant: "destructive" });
      return;
    }
    addGpu.mutate({ data: { label: newGpuLabel.trim(), url: comfyUrl.trim() } }, {
      onSuccess: () => {
        toast({ title: `Saved "${newGpuLabel.trim()}"` });
        setNewGpuLabel("");
        refreshAll();
      },
      onError: (err: any) => toast({ title: "Failed to save GPU", description: err.message, variant: "destructive" }),
    });
  };

  const handleSwitchGpu = (label: string, url: string) => {
    updateSettings.mutate({ data: { comfyUrl: url } }, {
      onSuccess: () => {
        setComfyUrl(url);
        toast({ title: `Switched to ${label}`, description: "Testing connection…" });
        refreshAll();
      },
      onError: (err: any) => toast({ title: "Failed to switch", description: err.message, variant: "destructive" }),
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bookmark className="h-5 w-5 text-primary" />
            Saved GPUs
          </CardTitle>
          <CardDescription>
            Keep your Colab and Kaggle URLs here and switch between them with one click — no re-pasting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(settings?.savedGpus ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
              No saved GPUs yet. Paste a URL above, give it a label below, and save it.
            </p>
          )}
          {(settings?.savedGpus ?? []).map((gpu) => {
            const isActive = gpu.url === settings?.comfyUrl;
            return (
              <div key={gpu.id} className={`flex items-center gap-3 rounded-lg border p-3 ${isActive ? "border-primary/60 bg-primary/5" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm flex items-center gap-2">
                    {gpu.label}
                    {isActive && <span className="text-xs text-primary font-normal">• active</span>}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{gpu.url}</p>
                </div>
                {!isActive && (
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
                    onClick={() => handleSwitchGpu(gpu.label, gpu.url)}
                    disabled={updateSettings.isPending}>
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Switch
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete saved GPU ${gpu.label}`}
                  onClick={() => deleteGpu.mutate({ id: gpu.id }, {
                    onSuccess: () => { toast({ title: `Removed "${gpu.label}"` }); refreshAll(); },
                    onError: (err: any) => toast({ title: "Failed to remove", description: err.message, variant: "destructive" }),
                  })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <div className="flex gap-2 pt-2 border-t">
            <Input
              value={newGpuLabel}
              onChange={(e) => setNewGpuLabel(e.target.value)}
              placeholder='Label for current URL (e.g. "Colab T4")'
              maxLength={50}
              className="max-w-xs"
            />
            <Button variant="secondary" onClick={handleSaveCurrentGpu} disabled={addGpu.isPending}>
              {addGpu.isPending ? "Saving…" : "Save current URL"}
            </Button>
          </div>
        </CardContent>
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
