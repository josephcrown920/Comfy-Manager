import { useState, useEffect } from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useGetSettings, useUpdateSettings, useGetComfyStatus, getGetComfyStatusQueryKey, getGetSettingsQueryKey, useAddSavedGpu, useDeleteSavedGpu } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Zap, RefreshCw, CheckCircle2, Cpu, Bookmark, Trash2, ArrowRightLeft, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/operations-design/PageHeader";

function SettingsVisual() {
  return (
    <div className="absolute inset-0 bg-[#09080D] overflow-hidden flex items-center justify-center">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#BEB2CC 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      
      {/* Visual abstract representation of connection details */}
      <div className="relative z-10 flex items-center gap-4 md:gap-12 w-full px-8 max-w-4xl mx-auto">
        <div className="flex flex-col gap-2 items-end">
          <div className="h-8 border border-[#2d2650] bg-[#171120] rounded-lg flex items-center px-3 text-[#BEB2CC] text-xs font-mono">
            localhost:3000
          </div>
          <div className="px-3 py-1 bg-[#A779F5]/20 text-[#A779F5] text-xs font-bold rounded-lg border border-[#A779F5]/40">
            Studio Frontend
          </div>
        </div>
        
        <div className="flex-1 h-1 bg-gradient-to-r from-[#A779F5]/40 to-[#B7F54A]/40 relative">
          <div className="absolute inset-0 flex justify-around">
            <div className="w-2 h-2 rounded-full bg-[#A779F5] -mt-0.5 shadow-[0_0_10px_#A779F5]" />
            <div className="w-2 h-2 rounded-full bg-[#B7F54A] -mt-0.5 shadow-[0_0_10px_#B7F54A]" />
          </div>
        </div>

        <div className="w-20 h-20 rounded-3xl bg-[#171120] border-2 border-[#B7F54A] flex items-center justify-center shadow-[0_0_30px_rgba(183,245,74,0.15)] z-10 relative">
          <div className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-[#B7F54A] flex items-center justify-center shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-[#09080D]" />
          </div>
          <Server className="w-8 h-8 text-[#B7F54A]" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="h-8 border border-[#B7F54A]/40 bg-[#171120] rounded-lg flex items-center px-3 text-[#B7F54A] text-xs font-mono shadow-[0_0_15px_rgba(183,245,74,0.1)]">
            ComfyUI Instance
          </div>
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded bg-[#2d2650] flex items-center justify-center"><Cpu className="w-3 h-3 text-[#BEB2CC]"/></div>
            <div className="w-6 h-6 rounded bg-[#2d2650] flex items-center justify-center"><Zap className="w-3 h-3 text-[#BEB2CC]"/></div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [routingMode, setRoutingMode] = useState<"auto" | "manual">("auto");
  const [selectedGpuId, setSelectedGpuId] = useState<number | null>(null);

  useEffect(() => {
    if (settings) {
      setComfyUrl(settings.comfyUrl);
      setRoutingMode(settings.routingMode);
      setSelectedGpuId(settings.selectedGpuId);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      data: {
        comfyUrl,
        routingMode,
        selectedGpuId: routingMode === "manual" ? selectedGpuId : null,
      }
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

  const handleSwitchGpu = (id: number, label: string, url: string) => {
    updateSettings.mutate({ data: { comfyUrl: url, routingMode: "manual", selectedGpuId: id } }, {
      onSuccess: () => {
        setComfyUrl(url);
        setRoutingMode("manual");
        setSelectedGpuId(id);
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
    <div className="max-w-4xl mx-auto pb-12">
      <PageHeader 
        title="Infrastructure"
        description="Configure your ComfyUI connection. Connect to your own local or remote GPU runner."
        visual={<SettingsVisual />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500 delay-150 fill-mode-both">
        
        {/* Left Column: Settings */}
        <div className="lg:col-span-8 space-y-8">
          
          <div className="bg-[#171120] border border-[#2d2650] rounded-3xl overflow-hidden group hover:border-[#A779F5]/30 transition-colors">
            <div className="p-6 border-b border-[#2d2650] bg-[#1a1325]">
              <h2 className="flex items-center gap-3 text-xl font-bold text-white">
                <Server className="h-6 w-6 text-[#A779F5]" />
                Connection Endpoint
              </h2>
              <p className="text-[#BEB2CC] text-sm mt-2 max-w-lg">
                Enter the URL where your ComfyUI instance is running. Studio proxies generation through this endpoint.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <Label htmlFor="comfyUrl" className="text-xs font-semibold uppercase tracking-wider text-[#7b72a8]">
                  ComfyUI Server URL
                </Label>
                {isSettingsLoading ? (
                  <Skeleton className="h-12 w-full rounded-xl bg-[#2d2650]" />
                ) : (
                  <Input 
                    id="comfyUrl"
                    value={comfyUrl}
                    onChange={(e) => setComfyUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8188"
                    className="h-12 bg-[#09080D] border-[#2d2650] text-white focus-visible:ring-[#A779F5]/30 rounded-xl font-mono text-sm shadow-inner"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#171120] border border-[#2d2650] rounded-3xl overflow-hidden group hover:border-[#A779F5]/30 transition-colors">
            <div className="p-6 border-b border-[#2d2650] bg-[#1a1325]">
              <h2 className="flex items-center gap-3 text-xl font-bold text-white">
                <ArrowRightLeft className="h-6 w-6 text-[#A779F5]" />
                Job Routing
              </h2>
              <p className="text-[#BEB2CC] text-sm mt-2 max-w-lg">
                Automatically use the healthiest compatible GPU, or pin new jobs to one specific saved worker.
              </p>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setRoutingMode("auto")}
                  className={`rounded-2xl border p-5 text-left transition-all ${routingMode === "auto" ? "border-[#B7F54A] bg-[#B7F54A]/5 shadow-[0_0_15px_rgba(183,245,74,0.05)] ring-1 ring-[#B7F54A]/20" : "border-[#2d2650] bg-[#09080D] hover:border-[#4a4269]"}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-bold text-white text-base">Automatic Pool</p>
                    {routingMode === "auto" && <CheckCircle2 className="w-5 h-5 text-[#B7F54A]" />}
                  </div>
                  <p className="text-sm leading-relaxed text-[#BEB2CC]">Route jobs to a reachable worker with the smallest queue and all required nodes.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRoutingMode("manual")}
                  className={`rounded-2xl border p-5 text-left transition-all ${routingMode === "manual" ? "border-[#B7F54A] bg-[#B7F54A]/5 shadow-[0_0_15px_rgba(183,245,74,0.05)] ring-1 ring-[#B7F54A]/20" : "border-[#2d2650] bg-[#09080D] hover:border-[#4a4269]"}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-bold text-white text-base">Specific GPU</p>
                    {routingMode === "manual" && <CheckCircle2 className="w-5 h-5 text-[#B7F54A]" />}
                  </div>
                  <p className="text-sm leading-relaxed text-[#BEB2CC]">Keep new jobs on one saved endpoint and fail clearly if it becomes unavailable.</p>
                </button>
              </div>
              
              {routingMode === "manual" && (
                <div className="space-y-3 p-5 rounded-2xl bg-[#09080D] border border-[#2d2650]">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[#7b72a8]">Pinned Worker</Label>
                  <Select
                    value={selectedGpuId?.toString() ?? ""}
                    onValueChange={(v) => setSelectedGpuId(v ? Number(v) : null)}
                  >
                    <SelectTrigger className="w-full font-mono text-sm h-12 bg-[#171120] border-[#2d2650] text-[#BEB2CC] focus:ring-[#A779F5]/30 rounded-xl">
                      <SelectValue placeholder="Choose a saved GPU endpoint" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#171120] border-[#2d2650] text-white">
                      {(settings?.savedGpus ?? []).map((gpu) => (
                        <SelectItem key={gpu.id} value={gpu.id.toString()} className="focus:bg-[#2d2650] focus:text-white">
                          <div className="flex items-center justify-between w-full">
                            <span>{gpu.label}</span>
                            <span className="text-xs text-[#7b72a8] ml-4 font-mono">{gpu.url}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedGpuId && <p className="text-sm font-medium text-red-400 mt-2">Choose a saved GPU before saving manual routing.</p>}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#171120] border border-[#2d2650] rounded-3xl overflow-hidden group hover:border-[#A779F5]/30 transition-colors">
            <div className="p-6 border-b border-[#2d2650] bg-[#1a1325]">
              <h2 className="flex items-center gap-3 text-xl font-bold text-white">
                <Bookmark className="h-6 w-6 text-[#A779F5]" />
                Saved GPU Roster
              </h2>
              <p className="text-[#BEB2CC] text-sm mt-2 max-w-lg">
                Save cloud endpoints for 1-click switching — no re-pasting required.
              </p>
            </div>
            <div className="p-6 space-y-4">
              {(settings?.savedGpus ?? []).length === 0 && (
                <div className="border border-dashed border-[#2d2650] rounded-2xl p-8 text-center bg-[#09080D]">
                  <p className="text-sm text-[#7b72a8] font-mono">
                    No saved GPUs yet. Connect a URL above and save it below.
                  </p>
                </div>
              )}
              
              <div className="space-y-3">
                {(settings?.savedGpus ?? []).map((gpu) => {
                  const isActive = routingMode === "manual" && gpu.id === selectedGpuId;
                  const workerStatus = status?.workers?.find((worker) => worker.id === gpu.id);
                  const isHealthy = workerStatus?.connected;
                  
                  return (
                    <div key={gpu.id} className={`flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border p-4 transition-colors ${isActive ? "bg-[#B7F54A]/5 border-[#B7F54A]/30" : "bg-[#09080D] border-[#2d2650] hover:border-[#4a4269]"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full shrink-0 shadow-sm ${isHealthy ? "bg-[#B7F54A] shadow-[#B7F54A]/50" : "bg-red-500 shadow-red-500/50"}`} />
                          <p className="font-bold text-base text-white truncate flex items-center gap-3">
                            {gpu.label}
                            {isActive && <span className="px-2 py-0.5 rounded-md bg-[#B7F54A]/20 text-[#B7F54A] text-[10px] uppercase font-bold tracking-wider">Active</span>}
                          </p>
                        </div>
                        <p className="text-xs text-[#7b72a8] font-mono truncate mt-1.5 ml-6">{gpu.url}</p>
                        <p className="text-xs text-[#BEB2CC] mt-1.5 ml-6 font-medium">
                          {isHealthy ? `${workerStatus.gpuName || "GPU"} · ${workerStatus.queueRemaining} queued` : (workerStatus?.error || "Offline")}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 sm:ml-auto ml-6">
                        {!isActive && (
                          <Button size="sm" variant="outline" className="gap-2 bg-transparent border-[#2d2650] text-white hover:bg-[#2d2650] rounded-xl"
                            onClick={() => handleSwitchGpu(gpu.id, gpu.label, gpu.url)}
                            disabled={updateSettings.isPending}>
                            <ArrowRightLeft className="w-3.5 h-3.5 text-[#B7F54A]" />
                            Switch Target
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-[#7b72a8] hover:text-red-400 hover:bg-red-400/10 rounded-xl"
                          onClick={() => deleteGpu.mutate({ id: gpu.id }, {
                            onSuccess: () => { toast({ title: `Removed "${gpu.label}"` }); refreshAll(); },
                          })}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-[#2d2650]">
                <Input
                  value={newGpuLabel}
                  onChange={(e) => setNewGpuLabel(e.target.value)}
                  placeholder='Label for current URL (e.g. "RunPod A100")'
                  maxLength={50}
                  className="flex-1 h-12 bg-[#09080D] border-[#2d2650] text-white rounded-xl"
                />
                <Button variant="secondary" onClick={handleSaveCurrentGpu} disabled={addGpu.isPending} className="h-12 px-6 bg-[#A779F5]/20 hover:bg-[#A779F5]/30 text-[#A779F5] border border-[#A779F5]/30 rounded-xl font-bold shrink-0">
                  {addGpu.isPending ? "Saving…" : "Save Current URL"}
                </Button>
              </div>
            </div>
          </div>
          
          <div className="bg-[#171120] border border-[#2d2650] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-6 shadow-2xl z-20">
            <p className="text-sm text-[#BEB2CC]">Routing updates apply to new queue submissions.</p>
            <Button
              onClick={handleSave}
              disabled={updateSettings.isPending || isSettingsLoading || (routingMode === "manual" && selectedGpuId == null)}
              className="w-full sm:w-auto h-12 px-8 bg-[#B7F54A] text-[#09080D] hover:bg-[#a4de3a] font-bold rounded-xl"
            >
              {updateSettings.isPending ? "Committing Changes…" : "Save Infrastructure"}
            </Button>
          </div>
        </div>
        
        {/* Right Column: Live Status */}
        <div className="lg:col-span-4 space-y-6">
          <div className={`rounded-3xl border overflow-hidden sticky top-6 transition-colors duration-500 ${status?.connected ? "bg-[#171120] border-[#B7F54A]/30 shadow-[0_0_30px_rgba(183,245,74,0.05)]" : "bg-[#171120] border-red-500/30"}`}>
            <div className={`p-5 border-b ${status?.connected ? "border-[#B7F54A]/20 bg-[#B7F54A]/5" : "border-red-500/20 bg-red-500/5"} flex justify-between items-center`}>
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <Activity className={`w-5 h-5 ${status?.connected ? "text-[#B7F54A]" : "text-red-500"}`} />
                Live Status
              </h2>
              <Button 
                size="icon"
                variant="ghost"
                onClick={handleTestConnection}
                disabled={isStatusFetching}
                className="h-8 w-8 text-[#BEB2CC] hover:text-white hover:bg-[#2d2650] rounded-lg"
              >
                <RefreshCw className={`w-4 h-4 ${isStatusFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            
            <div className="p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${status?.connected ? "bg-[#B7F54A] shadow-[0_0_10px_#B7F54A]" : "bg-red-500 shadow-[0_0_10px_red]"}`} />
                <div>
                  <p className="font-bold text-lg text-white">
                    {status?.connected ? "Online & Ready" : "Connection Failed"}
                  </p>
                  <p className="text-xs text-[#7b72a8] font-mono mt-1 break-all">
                    {status?.serverUrl || comfyUrl || "No endpoint configured"}
                  </p>
                </div>
              </div>

              {status?.connected && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#09080D] border border-[#2d2650] space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#7b72a8]">GPU Hardware</p>
                    <p className="font-mono text-sm text-[#B7F54A]">{status.gpuName || "Unknown"}</p>
                    <p className="text-xs text-[#BEB2CC]">{status.gpuVram || "Unknown VRAM"}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-[#09080D] border border-[#2d2650] space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#7b72a8]">System RAM</p>
                      <p className="font-mono text-sm text-white">{status.ramUsed}</p>
                      <p className="text-xs text-[#BEB2CC]">of {status.ramTotal}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#09080D] border border-[#2d2650] space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#7b72a8]">Active Queue</p>
                      <p className="font-mono text-2xl text-white">{status.queueRemaining ?? 0}</p>
                      <p className="text-xs text-[#BEB2CC]">jobs pending</p>
                    </div>
                  </div>
                </div>
              )}

              {!status?.connected && status?.error && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 font-mono">
                  {status.error}
                </div>
              )}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
