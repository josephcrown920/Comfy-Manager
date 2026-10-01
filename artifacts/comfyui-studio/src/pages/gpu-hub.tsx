import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Cloud, Cpu, ExternalLink, Gauge, HardDrive, Settings2, Sparkles } from "lucide-react";
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

export default function GpuHub() {
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [providers, setProviders] = useState<FreeGpuProvider[]>([]);

  useEffect(() => {
    fetch("/api/free-gpus")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load free GPU catalog")))
      .then((data) => setProviders(data.providers ?? []))
      .catch(() => setProviders([]));
  }, []);

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
