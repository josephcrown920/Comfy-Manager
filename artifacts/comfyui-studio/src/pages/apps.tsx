import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWorkflows, useGetWorkflow, useListWorkflowApps, useSaveWorkflowApp, useDeleteWorkflowApp,
  getListWorkflowAppsQueryKey, getGetWorkflowQueryKey, getGetWorkflowAppQueryKey,
} from "@workspace/api-client-react";
import type { WorkflowApp, WorkflowAppInput, WorkflowParam } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AppWindow, Code2, Copy, Download, ExternalLink, FileUp, Loader2, Pencil, Plus, Trash2, AlertCircle, ArrowLeft, Lock } from "lucide-react";
import sdxl from "@/assets/thumbnails/sdxl-image.jpg";
import animatediff from "@/assets/thumbnails/animatediff.jpg";
import svd from "@/assets/thumbnails/svd.jpg";
import latentsync from "@/assets/thumbnails/latentsync.jpg";
import mimic from "@/assets/thumbnails/mimicmotion.jpg";
import film from "@/assets/thumbnails/film-grade.jpg";
import portrait from "@/assets/thumbnails/cinematic-portrait.jpg";
import slowmo from "@/assets/thumbnails/slowmo-upscale.jpg";
import landscape from "@/assets/thumbnails/epic-landscape.jpg";
import hero from "@/assets/thumbnails/blog-hero.jpg";
import paCity from "@/assets/thumbnails/perform-anywhere-city.jpeg";

export const APP_FORMAT = "aurora-studio/app";
export const COMPLETE_ID = "perform-anywhere-complete";
const COMPLETE_KEYS = ["scene_description", "visual_direction", "motion_context"];
const PROVIDER_IDS = ["seedance", "mimicmotion", "kling", "omnihuman"] as const;
const PROVIDER_NAMES: Record<string, string> = { seedance: "Seedance", mimicmotion: "MimicMotion", kling: "Kling", omnihuman: "OmniHuman" };
const allowedFrom = (v: unknown): string[] => { const ids = String(v ?? "").split(",").map((s) => s.trim()).filter((s) => (PROVIDER_IDS as readonly string[]).includes(s)); return ids.length ? PROVIDER_IDS.filter((id) => ids.includes(id)) : [...PROVIDER_IDS]; };
const HIDDEN = ["custom-workflow", "perform-anywhere-angles"];
const MAX_IMPORT = 100 * 1024;

export function thumbFor(id: string): string {
  const t: [string, string][] = [["perform-anywhere", paCity], ["latentsync", latentsync], ["mimic", mimic], ["animatediff", animatediff], ["svd", svd], ["film", film], ["cinematic", portrait], ["slow", slowmo], ["sdxl", sdxl], ["landscape", landscape]];
  return t.find(([k]) => id.includes(k))?.[1] ?? hero;
}
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
const rand = () => Math.random().toString(36).slice(2, 6);
export const appUrl = (slug: string) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/a/${slug}`;
const embedCode = (slug: string) => `<iframe src="${appUrl(slug)}?embed=1" width="100%" height="760" style="border:0;border-radius:16px" allow="clipboard-write"></iframe>`;

type Draft = { existing: boolean; slug: string; name: string; description: string; workflowId: string; fixed: Record<string, unknown>; exposed: string[]; isPublished: boolean; allowEmbed: boolean };

function errMsg(e: unknown): string {
  const x = e as { message?: string; data?: { error?: string } } | undefined;
  return x?.data?.error ?? x?.message ?? "Something went wrong.";
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function SignInGate({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center" data-testid="gate-signin">
      <Lock className="mx-auto mb-4 h-8 w-8 text-primary" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Sign in to Aurora to continue.</p>
      <Link href="/sign-in" className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground" data-testid="link-sign-in">Sign in</Link>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" data-testid="status-error">
      <AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{message}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry">Retry</Button>}
    </div>
  );
}

function FixedField({ p, value, onChange }: { p: WorkflowParam; value: unknown; onChange: (v: unknown) => void }) {
  const id = `fixed-${p.key}`;
  const v = value === undefined || value === null ? "" : String(value);
  if (p.type === "select") {
    return (
      <Select value={v || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={p.label}><SelectValue placeholder="Choose a value" /></SelectTrigger>
        <SelectContent>{(p.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    );
  }
  if (p.type === "slider") {
    const min = p.min ?? 0, max = p.max ?? 100; const n = v === "" ? Number(p.defaultValue ?? min) : Number(v);
    return <div className="flex items-center gap-3"><Slider id={id} min={min} max={max} step={(max - min) > 10 ? 1 : 0.05} value={[n]} onValueChange={([x]) => onChange(x)} /><span className="w-12 text-right font-mono text-xs">{n}</span></div>;
  }
  if (p.type === "number") return <Input id={id} type="number" min={p.min ?? undefined} max={p.max ?? undefined} value={v} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />;
  return <Textarea id={id} rows={2} value={v} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />;
}

function Editor({ draft, onChange, onCancel, onSaved }: { draft: Draft; onChange: (d: Draft) => void; onCancel: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const save = useSaveWorkflowApp();
  const complete = draft.workflowId === COMPLETE_ID;
  const wf = useGetWorkflow(draft.workflowId, { query: { enabled: !complete, queryKey: getGetWorkflowQueryKey(draft.workflowId) } });
  const params: WorkflowParam[] = wf.data?.params ?? [];
  const d = draft;
  const fixedComplete = d.fixed as Record<string, string>;
  const allowedProviders: string[] = allowedFrom(fixedComplete.motion_providers);
  const defaultProvider = allowedProviders.includes(String(fixedComplete.motion_provider)) ? fixedComplete.motion_provider : allowedProviders[0];
  const setAllowed = (id: string, on: boolean) => {
    const next = PROVIDER_IDS.filter((x) => (x === id ? on : allowedProviders.includes(x)));
    if (next.length === 0) { toast({ title: "Keep at least one provider", variant: "destructive" }); return; }
    const f = { ...d.fixed, motion_providers: next.join(",") } as Record<string, unknown>;
    if (!(next as string[]).includes(String(f.motion_provider))) f.motion_provider = next[0];
    onChange({ ...d, fixed: f });
  };

  const toggle = (k: string, on: boolean) => onChange({ ...d, exposed: on ? [...d.exposed, k] : d.exposed.filter((x) => x !== k) });
  const setFixed = (k: string, v: unknown) => { const f = { ...d.fixed }; if (v === undefined) delete f[k]; else f[k] = v; onChange({ ...d, fixed: f }); };

  const submit = () => {
    if (!d.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(d.slug)) { toast({ title: "Link may use lowercase letters, numbers and dashes", variant: "destructive" }); return; }
    let presetParams: Record<string, unknown>; let exposedKeys: string[];
    if (complete) {
      presetParams = { preset: fixedComplete.preset === "luxury-interior" ? "luxury-interior" : "perform-anywhere", motion_providers: allowedProviders.join(","), motion_provider: defaultProvider };
      for (const k of COMPLETE_KEYS) if (typeof d.fixed[k] === "string" && d.fixed[k]) presetParams[k] = d.fixed[k];
      exposedKeys = COMPLETE_KEYS.filter((k) => d.exposed.includes(k));
    } else {
      if (!wf.data) { toast({ title: "Workflow still loading", variant: "destructive" }); return; }
      presetParams = {}; exposedKeys = [];
      for (const p of params) {
        if (p.type === "file" || d.exposed.includes(p.key)) exposedKeys.push(p.key);
        else {
          const value = d.fixed[p.key] ?? p.defaultValue;
          if (value !== undefined && value !== null && value !== "") presetParams[p.key] = value;
        }
      }
    }
    const data: WorkflowAppInput = { slug: d.slug, name: d.name.trim(), description: d.description, workflowId: d.workflowId, presetParams, exposedKeys, isPublished: d.isPublished, allowEmbed: d.allowEmbed };
    save.mutate({ data }, {
      onSuccess: (app) => {
        qc.invalidateQueries({ queryKey: getListWorkflowAppsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetWorkflowAppQueryKey(app.slug) });
        toast({ title: d.existing ? "App updated" : "App created" }); onSaved();
      },
      onError: (e) => toast({ title: "Could not save app", description: errMsg(e), variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6" data-testid="editor-app">
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground" data-testid="button-back"><ArrowLeft className="h-4 w-4" />All apps</button>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <img src={thumbFor(d.workflowId)} alt="" className="h-48 w-full object-cover" />
            <div className="p-5"><p className="text-xs font-bold uppercase tracking-widest text-primary">{complete ? "Complete multi-stage app" : "Single workflow"}</p><p className="font-mono text-xs text-muted-foreground">{d.workflowId}</p></div>
          </div>
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-bold">Fields</h2>
            {complete ? (
              <>
                <p className="text-sm text-muted-foreground">Choose which directions visitors can edit. The rest stay locked to the values you set.</p>
                {COMPLETE_KEYS.map((k) => (
                  <div key={k} className="space-y-2 rounded-xl border border-border p-3">
                    <label className="flex items-center gap-2 text-sm font-bold"><Checkbox checked={d.exposed.includes(k)} onCheckedChange={(c) => toggle(k, c === true)} data-testid={`check-expose-${k}`} />{k.replace(/_/g, " ")} <span className="font-normal text-muted-foreground">{d.exposed.includes(k) ? "visitor edits" : "locked"}</span></label>
                    <Textarea rows={2} aria-label={`Default ${k}`} placeholder={d.exposed.includes(k) ? "Optional starting value" : "Locked value"} value={String(d.fixed[k] ?? "")} onChange={(e) => setFixed(k, e.target.value || undefined)} />
                  </div>
                ))}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Style preset (fixed)</Label>
                    <Select value={fixedComplete.preset ?? "perform-anywhere"} onValueChange={(v) => setFixed("preset", v)}><SelectTrigger data-testid="select-preset"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="perform-anywhere">Perform Anywhere</SelectItem><SelectItem value="luxury-interior">Luxury interior</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Starting provider</Label>
                    <Select value={defaultProvider} onValueChange={(v) => setFixed("motion_provider", v)}><SelectTrigger data-testid="select-provider"><SelectValue /></SelectTrigger><SelectContent>{allowedProviders.map((id) => <SelectItem key={id} value={id}>{PROVIDER_NAMES[id]}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2 sm:col-span-2"><Label>Providers visitors may use</Label>
                    <div className="grid gap-2 sm:grid-cols-2">{PROVIDER_IDS.map((id) => <label key={id} className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-bold"><Checkbox checked={allowedProviders.includes(id)} onCheckedChange={(c) => setAllowed(id, c === true)} data-testid={`check-provider-${id}`} />{PROVIDER_NAMES[id]}</label>)}</div>
                    <p className="text-xs text-muted-foreground">Visitors choose one or more of these. The server enforces the list. Depth map, audio and video files are always editable.</p></div>
                </div>
              </>
            ) : wf.isLoading ? <Skeleton className="h-40 w-full" /> : wf.isError ? <ErrorBox message="Could not load workflow parameters." onRetry={() => wf.refetch()} /> : (
              <>
                <p className="text-sm text-muted-foreground">Exposed fields appear in the app. Others are fixed to the value here. File inputs are always exposed and never stored.</p>
                {params.map((p) => {
                  const isFile = p.type === "file"; const on = isFile || d.exposed.includes(p.key);
                  return (
                    <div key={p.key} className="space-y-2 rounded-xl border border-border p-3" data-testid={`param-${p.key}`}>
                      <label className="flex items-center gap-2 text-sm font-bold"><Checkbox checked={on} disabled={isFile} onCheckedChange={(c) => toggle(p.key, c === true)} data-testid={`check-expose-${p.key}`} />{p.label}<span className="font-normal text-muted-foreground">{isFile ? "file, always exposed" : on ? "visitor edits" : "fixed"}</span></label>
                      {!on && <FixedField p={p} value={d.fixed[p.key] ?? p.defaultValue} onChange={(v) => setFixed(p.key, v)} />}
                    </div>
                  );
                })}
              </>
            )}
          </section>
        </div>
        <aside className="h-fit space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-2"><Label htmlFor="app-name">App name</Label><Input id="app-name" maxLength={100} value={d.name} onChange={(e) => onChange({ ...d, name: e.target.value })} data-testid="input-app-name" /></div>
          <div className="space-y-2"><Label htmlFor="app-slug">Link</Label><div className="flex items-center gap-1 text-sm"><span className="text-muted-foreground">/a/</span><Input id="app-slug" disabled={d.existing} value={d.slug} onChange={(e) => onChange({ ...d, slug: slugify(e.target.value) })} data-testid="input-app-slug" /></div></div>
          <div className="space-y-2"><Label htmlFor="app-desc">Description</Label><Textarea id="app-desc" rows={3} maxLength={1000} value={d.description} onChange={(e) => onChange({ ...d, description: e.target.value })} data-testid="input-app-description" /></div>
          <label className="flex items-center justify-between text-sm font-bold">Published<Switch checked={d.isPublished} onCheckedChange={(v) => onChange({ ...d, isPublished: v })} data-testid="switch-published" /></label>
          <label className="flex items-center justify-between text-sm font-bold">Allow embed<Switch checked={d.allowEmbed} onCheckedChange={(v) => onChange({ ...d, allowEmbed: v })} data-testid="switch-embed" /></label>
          <p className="text-xs text-muted-foreground">Visitors must sign in to run an app. Published pages never show owner details or your files.</p>
          <div className="flex gap-2"><Button className="flex-1" onClick={submit} disabled={save.isPending} data-testid="button-save-app">{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{d.existing ? "Save changes" : "Create app"}</Button><Button variant="outline" onClick={onCancel} data-testid="button-cancel">Cancel</Button></div>
        </aside>
      </div>
    </div>
  );
}

function draftFromApp(a: WorkflowApp): Draft {
  const complete = a.workflowId === COMPLETE_ID;
  const fixed: Record<string, unknown> = { ...a.presetParams };
  return { existing: true, slug: a.slug, name: a.name, description: a.description, workflowId: a.workflowId, fixed, exposed: a.exposedKeys, isPublished: a.isPublished, allowEmbed: a.allowEmbed, ...(complete ? {} : {}) };
}

export default function Apps() {
  const { isLoaded, isSignedIn } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const signed = !!isSignedIn;
  const apps = useListWorkflowApps({ query: { enabled: signed, queryKey: getListWorkflowAppsQueryKey() } });
  const wfs = useListWorkflows();
  const del = useDeleteWorkflowApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [toDelete, setToDelete] = useState<WorkflowApp | null>(null);
  const [embedFor, setEmbedFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const choices = useMemo(() => (wfs.data ?? []).filter((w) => !HIDDEN.includes(w.id) && !/five angles/i.test(w.name) && w.id !== COMPLETE_ID), [wfs.data]);
  const mine = (apps.data ?? []).filter((a) => a.isOwner);
  const openedFromWorkflow = useRef(false);
  useEffect(() => {
    if (!signed || openedFromWorkflow.current) return;
    const requested = new URLSearchParams(window.location.search).get("workflow");
    if (requested !== COMPLETE_ID) return;
    openedFromWorkflow.current = true;
    setDraft({
      existing: false, slug: `perform-anywhere-${rand()}`, name: "Perform Anywhere",
      description: "", workflowId: COMPLETE_ID, fixed: {}, exposed: [...COMPLETE_KEYS],
      isPublished: true, allowEmbed: true,
    });
  }, [signed]);

  if (!isLoaded) return <Skeleton className="h-64 w-full" />;
  if (!isSignedIn) return <SignInGate title="Workflow Apps" />;

  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast({ title: `${what} copied` }), () => toast({ title: "Copy failed", variant: "destructive" }));
  const start = (workflowId: string, name: string, exposed: string[]) => { setPicking(false); setDraft({ existing: false, slug: `${slugify(name)}-${rand()}`, name, description: "", workflowId, fixed: {}, exposed, isPublished: true, allowEmbed: true }); };
  const pick = (id: string, name: string) => {
    if (id === COMPLETE_ID) return start(id, name, [...COMPLETE_KEYS]);
    const w = wfs.data?.find((x) => x.id === id);
    start(id, name, (w?.params ?? []).filter((p) => p.type === "file" || p.key.includes("prompt")).map((p) => p.key));
  };

  async function importApp(file: File) {
    try {
      if (file.size > MAX_IMPORT) throw new Error("Import files are limited to 100KB.");
      const j = JSON.parse(await file.text()) as Record<string, unknown>;
      if (!j || typeof j !== "object" || j.format !== APP_FORMAT || j.version !== 1) throw new Error("That is not an Aurora app file (version 1).");
      const name = typeof j.name === "string" && j.name.trim() ? j.name.trim().slice(0, 100) : "Imported app";
      const workflowId = typeof j.workflowId === "string" ? j.workflowId : "";
      const exposed = Array.isArray(j.exposedKeys) ? j.exposedKeys.filter((k): k is string => typeof k === "string") : [];
      const preset = j.presetParams && typeof j.presetParams === "object" && !Array.isArray(j.presetParams) ? (j.presetParams as Record<string, unknown>) : null;
      if (!workflowId || !preset) throw new Error("File is missing a workflow or preset values.");
      if (HIDDEN.includes(workflowId)) throw new Error("That workflow cannot be used as a single app.");
      if (workflowId !== COMPLETE_ID && !wfs.data?.some((w) => w.id === workflowId)) throw new Error("That workflow is not available here.");
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(preset)) if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") clean[k] = v;
      setDraft({ existing: false, slug: `${slugify(name) || "app"}-${rand()}`, name, description: typeof j.description === "string" ? j.description.slice(0, 1000) : "", workflowId, fixed: clean, exposed, isPublished: true, allowEmbed: true });
      toast({ title: "Imported", description: "Review the app, then create it." });
    } catch (e) { toast({ title: "Import failed", description: errMsg(e), variant: "destructive" }); }
  }

  if (draft) return <Editor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSaved={() => setDraft(null)} />;

  return (
    <div className="space-y-8" data-testid="page-apps">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-primary">Workflow Apps</p><h1 className="text-4xl font-bold tracking-tight">Share a shot as a simple form</h1></div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="input-import-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importApp(f); }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={wfs.isLoading} data-testid="button-import"><FileUp className="mr-2 h-4 w-4" />Import</Button>
          <Button onClick={() => setPicking(true)} data-testid="button-new-app"><Plus className="mr-2 h-4 w-4" />New app</Button>
        </div>
      </header>

      {picking && (
        <section className="space-y-4" aria-label="Choose a workflow" data-testid="section-picker">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Start from</h2><Button variant="ghost" size="sm" onClick={() => setPicking(false)}>Close</Button></div>
          {wfs.isError && <ErrorBox message="Could not load workflows." onRetry={() => wfs.refetch()} />}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[{ id: COMPLETE_ID, name: "Perform Anywhere Complete", description: "Full multi-stage app: scene, performer, motion and angles." }, ...choices].map((w) => (
              <button key={w.id} type="button" onClick={() => pick(w.id, w.name)} className="group overflow-hidden rounded-2xl border border-border bg-card text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid={`pick-${w.id}`}>
                <img src={thumbFor(w.id)} alt="" className="h-36 w-full object-cover transition group-hover:scale-[1.02]" />
                <div className="p-4"><p className="font-bold">{w.name}</p><p className="line-clamp-2 text-xs text-muted-foreground">{w.description}</p></div>
              </button>
            ))}
          </div>
        </section>
      )}

      {apps.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
      ) : apps.isError ? <ErrorBox message="Could not load your apps." onRetry={() => apps.refetch()} /> : mine.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-card" data-testid="empty-apps">
          <img src={paCity} alt="" className="h-56 w-full object-cover opacity-80" />
          <div className="p-8 text-center"><AppWindow className="mx-auto mb-3 h-8 w-8 text-primary" /><p className="text-lg font-bold">No apps yet</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Turn a workflow into a link a collaborator can run with a few fields.</p><Button className="mt-4" onClick={() => setPicking(true)}>Create your first app</Button></div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {mine.map((a) => (
            <article key={a.slug} className="overflow-hidden rounded-2xl border border-border bg-card" data-testid={`card-app-${a.slug}`}>
              <img src={thumbFor(a.workflowId)} alt="" className="h-44 w-full object-cover" />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2"><h3 className="font-bold">{a.name}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.isPublished ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{a.isPublished ? "Published" : "Draft"}</span></div>
                {a.description && <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p>}
                <p className="font-mono text-[11px] text-muted-foreground">/a/{a.slug} · {a.exposedKeys.length} fields</p>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/a/${a.slug}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-bold hover:bg-muted" data-testid={`link-open-${a.slug}`}><ExternalLink className="h-3 w-3" />Open</Link>
                  <Button size="sm" variant="outline" onClick={() => copy(appUrl(a.slug), "Link")} data-testid={`button-copy-${a.slug}`}><Copy className="mr-1 h-3 w-3" />Link</Button>
                  {a.allowEmbed && <Button size="sm" variant="outline" onClick={() => setEmbedFor(embedFor === a.slug ? null : a.slug)} data-testid={`button-embed-${a.slug}`}><Code2 className="mr-1 h-3 w-3" />Embed</Button>}
                  <Button size="sm" variant="outline" onClick={() => download(`${a.slug}.aurora-app.json`, { format: APP_FORMAT, version: 1, name: a.name, description: a.description, workflowId: a.workflowId, presetParams: a.presetParams, exposedKeys: a.exposedKeys })} data-testid={`button-export-${a.slug}`}><Download className="mr-1 h-3 w-3" />Export</Button>
                  <Button size="sm" variant="outline" onClick={() => setDraft(draftFromApp(a))} data-testid={`button-edit-${a.slug}`}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setToDelete(a)} aria-label={`Delete ${a.name}`} data-testid={`button-delete-${a.slug}`}><Trash2 className="h-3 w-3" /></Button>
                </div>
                {embedFor === a.slug && <div className="space-y-2"><code className="block break-all rounded-lg bg-background p-2 text-[11px]">{embedCode(a.slug)}</code><Button size="sm" onClick={() => copy(embedCode(a.slug), "Embed code")}>Copy embed code</Button></div>}
              </div>
            </article>
          ))}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle><AlertDialogDescription>The shared link stops working immediately. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete" onClick={() => { if (!toDelete) return; del.mutate({ slug: toDelete.slug }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListWorkflowAppsQueryKey() }); toast({ title: "App deleted" }); }, onError: (e) => toast({ title: "Could not delete", description: errMsg(e), variant: "destructive" }) }); setToDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
