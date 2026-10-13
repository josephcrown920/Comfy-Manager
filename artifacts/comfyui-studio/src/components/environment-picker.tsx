import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Undo2 } from "lucide-react";
import { getListEnvironmentsQueryKey, useAttachEnvironment, useListEnvironments, type EnvironmentPreset } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "studio", label: "Studio" },
  { id: "outdoor", label: "Outdoor" },
  { id: "sport", label: "Sport" },
  { id: "interior", label: "Interior" },
] as const;

const assetUrl = (url: string) => {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return url.startsWith("/") && !(base && url.startsWith(`${base}/`)) ? `${base}${url}` : url;
};

export function EnvironmentPicker({
  enabled,
  selected,
  onAttached,
  onClear,
  onPendingChange,
}: {
  enabled: boolean;
  selected: { id: string; name: string } | null;
  onAttached: (env: EnvironmentPreset, filename: string) => void;
  onClear: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const list = useListEnvironments({ query: { enabled, queryKey: getListEnvironmentsQueryKey() } });
  const attach = useAttachEnvironment();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["id"]>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => { onPendingChange(pendingId !== null); }, [pendingId, onPendingChange]);

  const items = useMemo(() => (list.data ?? []).filter((e) => category === "all" || e.category === category), [list.data, category]);

  const choose = async (env: EnvironmentPreset) => {
    if (pendingId) return;
    setPendingId(env.id);
    setFailure(null);
    try {
      const result = await attach.mutateAsync({ id: env.id });
      onAttached(env, result.name);
    } catch (error) {
      setFailure(`Could not attach ${env.name}${error instanceof Error && error.message ? `: ${error.message}` : "."}`);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div data-testid="environment-picker" className="mb-8 rounded-2xl border border-[#A779F5]/30 bg-[#09080D] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#B7F54A]">Environment library</p>
          <p className="mt-1 text-sm text-[#BEB2CC]">Start from a ready-made location, or upload your own in the Location card below. Backgrounds cleaned from references are AI reconstructed. Attaching needs an active GPU worker.</p>
        </div>
        {selected && (
          <div data-testid="status-selected-environment" className="flex items-center gap-2 rounded-full border border-[#B7F54A]/30 bg-[#B7F54A]/10 py-1 pl-3 pr-1 text-xs font-bold text-[#B7F54A]">
            <CheckCircle2 className="h-4 w-4" />Using {selected.name}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-white" onClick={onClear} disabled={pendingId !== null}><Undo2 className="mr-1 h-3 w-3" />Use my own</Button>
          </div>
        )}
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Environment categories">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={category === c.id} data-testid={`tab-environment-${c.id}`} onClick={() => setCategory(c.id)} className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold ${category === c.id ? "border-[#B7F54A] bg-[#B7F54A] text-[#09080D]" : "border-[#A779F5]/30 text-[#BEB2CC] hover:text-white"}`}>{c.label}</button>
        ))}
      </div>
      {failure && <p role="alert" data-testid="error-environment-attach" className="mb-4 flex items-center gap-2 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-white"><CircleAlert className="h-4 w-4 shrink-0 text-[#EF4444]" />{failure}</p>}
      {!enabled ? (
        <p className="text-sm text-[#BEB2CC]">Sign in to browse environments.</p>
      ) : list.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" data-testid="loading-environments">
          {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-video animate-pulse rounded-2xl bg-[#171120]" />)}
        </div>
      ) : list.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-4 text-sm text-white">
          <span>Could not load the environment library.</span>
          <Button size="sm" variant="outline" onClick={() => list.refetch()}>Retry</Button>
        </div>
      ) : items.length === 0 ? (
        <p data-testid="empty-environments" className="rounded-xl border border-dashed border-[#A779F5]/30 p-6 text-center text-sm text-[#BEB2CC]">{(list.data ?? []).length === 0 ? "No environments have been published yet." : "No environments in this category."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map((env) => {
            const active = selected?.id === env.id;
            const loading = pendingId === env.id;
            return (
              <button key={env.id} type="button" data-testid={`button-environment-${env.id}`} disabled={pendingId !== null} onClick={() => { void choose(env); }} title={env.description} className={`group overflow-hidden rounded-2xl border text-left transition-all disabled:opacity-60 ${active ? "border-[#B7F54A] bg-[#B7F54A]/10" : "border-[#A779F5]/30 bg-[#171120] hover:border-[#A779F5]/70"}`}>
                <div className="relative aspect-video overflow-hidden bg-[#171120]">
                  <img src={assetUrl(env.imageUrl)} alt={`${env.name} environment`} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  {loading && <span className="absolute inset-0 flex items-center justify-center bg-[#09080D]/60"><Loader2 className="h-6 w-6 animate-spin text-[#B7F54A]" /></span>}
                  {active && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#B7F54A] text-[#09080D]"><CheckCircle2 className="h-4 w-4" /></span>}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-bold text-white">{env.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#BEB2CC]">{env.category} · {env.source === "generated" ? "Generated" : "From your photos"}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
