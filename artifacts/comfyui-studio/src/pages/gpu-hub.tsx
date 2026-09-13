import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Cloud, Cpu, DollarSign, ExternalLink, Gauge, HardDrive, Power, Settings2, Sparkles, Zap } from "lucide-react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/operations-design/PageHeader";

type FreeGpuProvider = {
  id: string;
  name: string;
  gpu: string;
  protocol: string;
  capabilities: string[];
  launcherUrl: string;
  notebookUrl?: string;
  notes: string[];
};

type VastStatus = {
  configured: boolean;
  config: {
    enabled: boolean;
    maxHourlyRate: number;
    minGpuRamGb: number;
    minReliability: number;
    idleMinutes: number;
    diskGb: number;
    startupTimeoutMinutes: number;
    templateHashId: string;
  };
  state: {
    instanceId: number | null;
    status: string;
    gpuName: string | null;
    hourlyRate: number | null;
    startedAt: string | null;
    idleSince: string | null;
    lastError: string | null;
  };
};

export default function GpuHub() {
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [providers, setProviders] = useState<FreeGpuProvider[]>([]);
  const [vast, setVast] = useState<VastStatus | null>(null);
  const [vastAccessError, setVastAccessError] = useState<string | null>(null);
  const [savingVast, setSavingVast] = useState(false);
  const [maxHourlyRate, setMaxHourlyRate] = useState("0.35");
  const [idleMinutes, setIdleMinutes] = useState("10");
  const [minGpuRamGb, setMinGpuRamGb] = useState("16");

  useEffect(() => {
    fetch("/api/free-gpus")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load free GPU catalog")))
      .then((data) => setProviders(data.providers ?? []))
      .catch(() => setProviders([]));
  }, []);

  const loadVast = () => {
    fetch("/api/gpu/vast/autoscaler")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load Vast autoscaler")))
      .then((data: VastStatus) => {
        setVast(data);
        setVastAccessError(null);
        setMaxHourlyRate(String(data.config.maxHourlyRate));
        setIdleMinutes(String(data.config.idleMinutes));
        setMinGpuRamGb(String(data.config.minGpuRamGb));
      })
      .catch((error) => {
        setVast(null);
        setVastAccessError(error instanceof Error ? error.message : "Sign in with an administrator account to manage Vast autoscaling.");
      });
  };

  useEffect(() => {
    loadVast();
    const timer = window.setInterval(loadVast, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const saveVast = async (enabled = vast?.config.enabled ?? false) => {
    setSavingVast(true);
    try {
      const response = await fetch("/api/gpu/vast/autoscaler", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          maxHourlyRate: Number(maxHourlyRate),
          idleMinutes: Number(idleMinutes),
          minGpuRamGb: Number(minGpuRamGb),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save autoscaler");
      setVast(data);
      toast({ title: enabled ? "Vast autoscaling enabled" : "Vast autoscaling disabled", description: enabled ? "Aurora will rent a GPU only when no healthy worker is available." : "No new Vast workers will be created." });
    } catch (error) {
      toast({ title: "Could not save autoscaler", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingVast(false);
    }
  };

  const controlVast = async (action: "start" | "stop") => {
    setSavingVast(true);
    try {
      const response = await fetch(`/api/gpu/vast/autoscaler/${action}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Could not ${action} worker`);
      setVast(data);
      toast({ title: action === "start" ? "Vast worker is ready" : "Vast worker stopped", description: action === "start" ? "Aurora can now route ComfyUI jobs to it." : "Billing for the destroyed instance has stopped." });
    } catch (error) {
      toast({ title: `Could not ${action} Vast worker`, description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingVast(false);
    }
  };

  const selectWorker = (id: number, label: string, url: string) => {
    updateSettings.mutate({ data: { comfyUrl: url, routingMode: "manual", selectedGpuId: id } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: `${label} selected`, description: "New jobs are now pinned to this worker." });
      },
      onError: (error: any) => toast({ title: "Could not select worker", description: error?.message ?? "Try Settings instead.", variant: "destructive" }),
    });
  };

  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-8">
      <PageHeader
        title="GPU Hub"
        description="Launch free GPU workers or select any connected worker for the same ComfyUI job queue."
        visual={
          <div className="absolute inset-0 flex items-center justify-center bg-[#09080D] overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(#BEB2CC 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
            <div className="relative grid grid-cols-3 gap-4 opacity-60">
              {["Free GPU", "Manager", "ComfyUI"].map((label, i) => (
                <div key={label} className="rounded-2xl border border-[#2d2650] bg-[#171120] px-5 py-4 text-center">
                  {i === 0 ? <Cloud className="w-6 h-6 mx-auto text-[#B7F54A]" /> : i === 1 ? <Gauge className="w-6 h-6 mx-auto text-[#A779F5]" /> : <Cpu className="w-6 h-6 mx-auto text-[#BEB2CC]" />}
                  <p className="mt-2 text-xs font-bold text-white">{label}</p>
                </div>
              ))}
            </div>
          </div>
        }
      />

      <section className="overflow-hidden rounded-3xl border border-[#A779F5]/30 bg-[#171120]">
        <div className="grid min-h-44 grid-cols-3 gap-3 border-b border-[#2d2650] bg-[#09080D] p-5 sm:p-7">
          <div className="flex flex-col justify-between rounded-2xl border border-[#2d2650] bg-[#171120] p-4">
            <Zap className="h-6 w-6 text-[#B7F54A]" />
            <div><p className="text-2xl font-bold text-white">{vast?.state.gpuName ?? "On demand"}</p><p className="text-xs text-[#7b72a8]">Cheapest compatible GPU</p></div>
          </div>
          <div className="flex flex-col justify-between rounded-2xl border border-[#2d2650] bg-[#171120] p-4">
            <DollarSign className="h-6 w-6 text-[#A779F5]" />
            <div><p className="text-2xl font-bold text-white">{vast?.state.hourlyRate == null ? `≤ $${maxHourlyRate}` : `$${vast.state.hourlyRate.toFixed(3)}`}</p><p className="text-xs text-[#7b72a8]">Hourly ceiling</p></div>
          </div>
          <div className="flex flex-col justify-between rounded-2xl border border-[#2d2650] bg-[#171120] p-4">
            <Power className={`h-6 w-6 ${vast?.state.status === "running" ? "text-[#B7F54A]" : "text-[#7b72a8]"}`} />
            <div><p className="text-2xl font-bold capitalize text-white">{vast?.state.status ?? "Unavailable"}</p><p className="text-xs text-[#7b72a8]">Instance lifecycle</p></div>
          </div>
        </div>
        <div className="p-6 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Vast.ai automatic GPU</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#BEB2CC]">When no healthy worker is available, Aurora searches verified Vast offers, rents the cheapest GPU under your ceiling, waits for ComfyUI, routes the job, and destroys the instance after it stays idle.</p>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${vast?.config.enabled ? "border-[#B7F54A]/30 bg-[#B7F54A]/10 text-[#B7F54A]" : "border-[#2d2650] text-[#7b72a8]"}`}>{vast?.config.enabled ? "Automatic" : "Disabled"}</span>
          </div>

          {vastAccessError && <p className="mt-5 rounded-xl border border-[#2d2650] bg-[#09080D] p-3 text-sm text-[#BEB2CC]">{vastAccessError}</p>}
          {vast && !vast.configured && <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">The server does not have a Vast.ai API key configured.</p>}
          {vast?.state.lastError && <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{vast.state.lastError}</p>}

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-bold uppercase tracking-wider text-[#7b72a8]">Maximum $/hour<input value={maxHourlyRate} onChange={(e) => setMaxHourlyRate(e.target.value)} type="number" min="0.05" max="5" step="0.01" className="mt-2 w-full rounded-xl border border-[#2d2650] bg-[#09080D] px-3 py-2.5 text-sm text-white outline-none focus:border-[#A779F5]" /></label>
            <label className="text-xs font-bold uppercase tracking-wider text-[#7b72a8]">Minimum VRAM<input value={minGpuRamGb} onChange={(e) => setMinGpuRamGb(e.target.value)} type="number" min="8" max="96" step="1" className="mt-2 w-full rounded-xl border border-[#2d2650] bg-[#09080D] px-3 py-2.5 text-sm text-white outline-none focus:border-[#A779F5]" /></label>
            <label className="text-xs font-bold uppercase tracking-wider text-[#7b72a8]">Stop after idle minutes<input value={idleMinutes} onChange={(e) => setIdleMinutes(e.target.value)} type="number" min="2" max="60" step="1" className="mt-2 w-full rounded-xl border border-[#2d2650] bg-[#09080D] px-3 py-2.5 text-sm text-white outline-none focus:border-[#A779F5]" /></label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button disabled={savingVast || !vast?.configured} onClick={() => saveVast(!vast?.config.enabled)} className={vast?.config.enabled ? "bg-[#2d2650] text-white hover:bg-[#4a4269]" : "bg-[#B7F54A] text-black hover:bg-[#c9ff6b]"}>{vast?.config.enabled ? "Disable autoscaling" : "Enable autoscaling"}</Button>
            <Button disabled={savingVast || !vast?.config.enabled || vast?.state.status === "running"} onClick={() => controlVast("start")} variant="outline" className="border-[#2d2650] bg-transparent text-white">Start worker now</Button>
            <Button disabled={savingVast || !vast?.state.instanceId} onClick={() => controlVast("stop")} variant="outline" className="border-red-500/30 bg-transparent text-red-300 hover:bg-red-500/10">Stop and destroy</Button>
          </div>
          <p className="mt-4 text-xs text-[#7b72a8]">Only administrators can change these controls. Enabling autoscaling authorizes Aurora to spend from your Vast.ai balance up to the hourly ceiling shown above.</p>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {providers.map((provider) => (
          <article key={provider.id} className="rounded-3xl border border-[#2d2650] bg-[#171120] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-[#B7F54A]" />
                  <h2 className="text-xl font-bold text-white">{provider.name}</h2>
                </div>
                <p className="mt-2 text-sm text-[#BEB2CC]">{provider.gpu}</p>
              </div>
              <span className="rounded-full border border-[#B7F54A]/30 bg-[#B7F54A]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#B7F54A]">Free</span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {provider.capabilities.map((capability) => (
                <span key={capability} className="rounded-lg bg-[#09080D] px-2.5 py-1 text-xs text-[#BEB2CC]">{capability}</span>
              ))}
            </div>

            <ul className="mt-5 space-y-2 text-sm text-[#BEB2CC]">
              {provider.notes.map((note) => <li key={note} className="flex gap-2"><span className="text-[#B7F54A]">•</span>{note}</li>)}
            </ul>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href={provider.launcherUrl} download>
                <Button className="bg-[#B7F54A] text-black hover:bg-[#c9ff6b]">Get launcher</Button>
              </a>
              {provider.notebookUrl && (
                <a href={provider.notebookUrl} download>
                  <Button variant="outline" className="border-[#2d2650] bg-transparent text-white">Notebook</Button>
                </a>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[#2d2650] bg-[#171120] p-6">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-[#A779F5]" />
          <h2 className="text-xl font-bold text-white">Connected GPU roster</h2>
        </div>
        <p className="mt-2 text-sm text-[#BEB2CC]">Free workers become first-class Manager workers once their ComfyUI endpoint is connected. They use the same queue, health checks and manual/automatic routing as paid or local workers.</p>
        <div className="mt-5 space-y-3">
          {(settings?.savedGpus ?? []).length === 0 && <p className="rounded-2xl border border-dashed border-[#2d2650] p-6 text-sm text-[#7b72a8]">No saved workers yet. Launch a worker above, then add its ComfyUI endpoint in Settings.</p>}
          {(settings?.savedGpus ?? []).map((gpu) => {
            const active = settings?.routingMode === "manual" && settings.selectedGpuId === gpu.id;
            return (
              <div key={gpu.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#2d2650] bg-[#09080D] p-4">
                <div className="min-w-0">
                  <p className="font-bold text-white">{gpu.label}</p>
                  <p className="mt-1 truncate font-mono text-xs text-[#7b72a8]">{gpu.url}</p>
                </div>
                <Button size="sm" variant={active ? "default" : "outline"} disabled={active || updateSettings.isPending} onClick={() => selectWorker(gpu.id, gpu.label, gpu.url)} className={active ? "bg-[#B7F54A] text-black hover:bg-[#B7F54A]" : "border-[#2d2650] bg-transparent text-white"}>
                  {active ? "Selected" : "Select"}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/settings"><Button variant="outline" className="border-[#2d2650] bg-transparent text-white"><Settings2 className="mr-2 h-4 w-4" />Manage workers</Button></Link>
          <Link href="/launch"><Button variant="outline" className="border-[#2d2650] bg-transparent text-white"><HardDrive className="mr-2 h-4 w-4" />Launch infrastructure</Button></Link>
          <a href="https://colab.research.google.com" target="_blank" rel="noreferrer"><Button variant="ghost" className="text-[#BEB2CC]"><ExternalLink className="mr-2 h-4 w-4" />Open Colab</Button></a>
        </div>
      </section>
    </div>
  );
}
