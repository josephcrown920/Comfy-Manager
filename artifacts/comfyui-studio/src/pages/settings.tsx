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
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-[#7b72a8] mt-1 text-sm">Configure your ComfyUI connection.</p>
      </div>

      <div className="bg-[#1e1a38] border border-[#2d2650] rounded-xl">
        <div className="p-6 border-b border-[#2d2650]">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Server className="h-5 w-5 text-[#e8f724]" />
            Connection Details
          </h2>
          <p className="text-[#7b72a8] text-sm mt-1">
            Enter the URL where your ComfyUI instance is running (e.g. http://127.0.0.1:8188).
            ComfyUI Studio acts as a proxy to this URL.
          </p>
        </div>
        <div className="p-6">
          <div className="space-y-2">
            <Label htmlFor="comfyUrl" className="text-sm font-medium">ComfyUI Server URL</Label>
            {isSettingsLoading ? (
              <Skeleton className="h-10 w-full rounded-xl" />
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
        </div>
        <div className="bg-[#1e1a38] border-t border-[#2d2650] p-4 flex justify-between items-center">
          <p className="text-xs text-[#7b72a8]">Changes apply immediately for new jobs.</p>
          <Button 
            onClick={handleSave} 
            disabled={updateSettings.isPending || isSettingsLoading}
            className="bg-[#e8f724] text-black hover:bg-[#d4e010]"
          >
            {updateSettings.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </div>

      <div className="bg-[#1e1a38] border border-[#2d2650] rounded-xl">
        <div className="p-6 border-b border-[#2d2650]">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Bookmark className="h-5 w-5 text-[#e8f724]" />
            Saved GPUs
          </h2>
          <p className="text-[#7b72a8] text-sm mt-1">
            Keep your Colab and Kaggle URLs here and switch between them with one click — no re-pasting.
          </p>
        </div>
        <div className="p-6 space-y-4">
          {(settings?.savedGpus ?? []).length === 0 && (
            <p className="text-sm text-[#7b72a8] border border-dashed border-[#2d2650] rounded-xl p-4 text-center font-mono">
              No saved GPUs yet. Paste a URL above, give it a label below, and save it.
            </p>
          )}
          {(settings?.savedGpus ?? []).map((gpu) => {
            const isActive = gpu.url === settings?.comfyUrl;
            return (
              <div key={gpu.id} className={`flex items-center gap-3 rounded-xl border border-[#2d2650] p-3 ${isActive ? "bg-[#2a2448] border-[#e8f724]" : "bg-[#1e1a38]"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm flex items-center gap-2 text-[#f0eeff]">
                    {gpu.label}
                    {isActive && <span className="text-xs text-[#e8f724] font-normal uppercase tracking-wider">active</span>}
                  </p>
                  <p className="text-xs text-[#7b72a8] font-mono truncate mt-0.5">{gpu.url}</p>
                </div>
                {!isActive && (
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0 bg-transparent border-[#2d2650] hover:bg-[#2a2448]"
                    onClick={() => handleSwitchGpu(gpu.label, gpu.url)}
                    disabled={updateSettings.isPending}>
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Switch
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-[#7b72a8] hover:text-[#e05555] hover:bg-[#2a2448]"
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
          <div className="flex gap-2 pt-4 border-t border-[#2d2650]">
            <Input
              value={newGpuLabel}
              onChange={(e) => setNewGpuLabel(e.target.value)}
              placeholder='Label for current URL (e.g. "Colab T4")'
              maxLength={50}
              className="max-w-xs font-mono"
            />
            <Button variant="secondary" onClick={handleSaveCurrentGpu} disabled={addGpu.isPending} className="bg-[#2a2448] hover:bg-[#3a3a3a] border border-[#2d2650]">
              {addGpu.isPending ? "Saving…" : "Save current URL"}
            </Button>
          </div>
        </div>
      </div>

      <div className={`bg-[#1e1a38] border rounded-xl ${status?.connected ? "border-[#4a4]/50" : "border-[#dd4444]/50"}`}>
        <div className="p-6 border-b border-[#2d2650]">
          <div className="flex justify-between items-center">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Zap className="h-5 w-5" />
              Live Server Status
            </h2>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleTestConnection}
              disabled={isStatusFetching}
              className="gap-2 bg-transparent border-[#2d2650] hover:bg-[#2a2448]"
            >
              <RefreshCw className={`h-3 w-3 ${isStatusFetching ? 'animate-spin' : ''}`} />
              Test Connection
            </Button>
          </div>
        </div>
        <div className="p-6">
          <div className="rounded-xl bg-[#1e1a38] border border-[#2d2650] p-4 space-y-4">
            <div className="flex items-center gap-3">
              {status?.connected ? (
                <div className="w-4 h-4 rounded-full bg-[#4a4]" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-[#dd4444]" />
              )}
              <div>
                <p className="font-semibold text-foreground">
                  {status?.connected ? "Connected to ComfyUI" : "Connection Failed"}
                </p>
                <p className="text-sm text-[#7b72a8] font-mono mt-1">
                  {status?.serverUrl || comfyUrl || "Unknown URL"}
                </p>
              </div>
            </div>

            {status?.connected && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#2d2650] mt-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#7b72a8] uppercase tracking-wider">
                    <Cpu className="h-3 w-3" /> GPU Name
                  </div>
                  <p className="font-medium text-sm font-mono">{status.gpuName || "Unknown"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#7b72a8] uppercase tracking-wider">
                    <Server className="h-3 w-3" /> GPU VRAM
                  </div>
                  <p className="font-medium text-sm font-mono">{status.gpuVram || "Unknown"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#7b72a8] uppercase tracking-wider">
                    <Server className="h-3 w-3" /> System RAM
                  </div>
                  <p className="font-medium text-sm font-mono">{status.ramUsed} / {status.ramTotal}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#7b72a8] uppercase tracking-wider">
                    <RefreshCw className="h-3 w-3" /> Queue Remaining
                  </div>
                  <p className="font-medium text-sm font-mono">{status.queueRemaining ?? 0} jobs</p>
                </div>
              </div>
            )}

            {!status?.connected && status?.error && (
              <div className="mt-4 pt-4 border-t border-[#2d2650] text-sm text-[#e05555] font-mono">
                Error: {status.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
