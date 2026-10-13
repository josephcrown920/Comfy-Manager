import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useAuth } from "@clerk/react";
import { useGetWorkflowApp, useGetWorkflow, useRunWorkflowApp, useRefreshJob, getJob, getGetWorkflowAppQueryKey, getGetWorkflowQueryKey } from "@workspace/api-client-react";
import type { Job, WorkflowApp, WorkflowParam } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, Play } from "lucide-react";
import PerformAnywhere from "@/pages/perform-anywhere";
import { COMPLETE_ID, ErrorBox, SignInGate, thumbFor } from "@/pages/apps";

function msg(e: unknown) {
  const x = e as { message?: string; data?: { error?: string } } | undefined;
  return x?.data?.error ?? x?.message ?? "Something went wrong.";
}

function Field({ p, value, onChange }: { p: WorkflowParam; value: unknown; onChange: (v: unknown) => void }) {
  const v = value === undefined || value === null ? "" : String(value);
  const id = `f-${p.key}`;
  let input;
  if (p.type === "file") input = <FileUpload accept={p.accept ?? undefined} label={p.label} description={p.description ?? undefined} onFileSelect={(n) => onChange(n)} previouslyUploadedName={v || undefined} />;
  else if (p.type === "select") input = <Select value={v || undefined} onValueChange={onChange}><SelectTrigger id={id}><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(p.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>;
  else if (p.type === "slider") { const min = p.min ?? 0, max = p.max ?? 100; const n = v === "" ? min : Number(v); input = <div className="flex items-center gap-3"><Slider id={id} min={min} max={max} step={(max - min) > 10 ? 1 : 0.05} value={[n]} onValueChange={([x]) => onChange(x)} /><span className="w-12 text-right font-mono text-xs">{n}</span></div>; }
  else if (p.type === "number") input = <Input id={id} type="number" min={p.min ?? undefined} max={p.max ?? undefined} value={v} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />;
  else input = <Textarea id={id} rows={3} value={v} onChange={(e) => onChange(e.target.value)} />;
  return (
    <div className="space-y-2" data-testid={`field-${p.key}`}>
      {p.type !== "file" && <Label htmlFor={id}>{p.label}{p.required ? " *" : ""}</Label>}
      {input}
      {p.type !== "file" && p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
    </div>
  );
}

function SingleRunner({ app }: { app: WorkflowApp }) {
  const { userId } = useAuth();
  const storageKey = `aurora-app-run:${userId}:${app.slug}`;
  const { toast } = useToast();
  const wf = useGetWorkflow(app.workflowId, { query: { queryKey: getGetWorkflowQueryKey(app.workflowId) } });
  const run = useRunWorkflowApp();
  const refresh = useRefreshJob();
  const refreshRef = useRef(refresh.mutateAsync);
  refreshRef.current = refresh.mutateAsync;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [job, setJob] = useState<Job | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const active = job && (job.status === "pending" || job.status === "running");
  const jobId = job?.id;

  useEffect(() => {
    let alive = true;
    try {
      const saved = Number(sessionStorage.getItem(storageKey));
      if (saved > 0) getJob(saved).then((j) => { if (alive) setJob(j); }).catch(() => {
        if (alive) setPollError("Could not restore the previous run. See Jobs for its status.");
      });
    } catch { /* Session storage can be unavailable in embedded browsers. */ }
    return () => { alive = false; };
  }, [storageKey]);

  useEffect(() => {
    if (jobId) try { sessionStorage.setItem(storageKey, String(jobId)); } catch { /* Optional reload recovery. */ }
  }, [jobId, storageKey]);

  useEffect(() => {
    if (!jobId || !active) return;
    const t = setInterval(() => {
      refreshRef.current({ id: jobId }).then((j) => { setJob(j); setPollError(null); }).catch((e) => setPollError(msg(e)));
    }, 4000);
    return () => clearInterval(t);
  }, [jobId, active]);

  const fields = (wf.data?.params ?? []).filter((p) => app.exposedKeys.includes(p.key) || p.type === "file");
  const fieldValue = (p: WorkflowParam) => values[p.key] ?? p.defaultValue;
  const missing = fields.filter((p) => p.required && (fieldValue(p) === undefined || fieldValue(p) === null || fieldValue(p) === ""));

  const start = () => {
    if (missing.length) { toast({ title: "Missing fields", description: missing.map((m) => m.label).join(", "), variant: "destructive" }); return; }
    const params: Record<string, unknown> = {};
    for (const p of fields) if (fieldValue(p) !== undefined && fieldValue(p) !== null && fieldValue(p) !== "") params[p.key] = fieldValue(p);
    run.mutate({ slug: app.slug, data: { workflowId: app.workflowId, params } }, { onSuccess: (j) => { setJob(j); setPollError(null); }, onError: (e) => toast({ title: "Could not start", description: msg(e), variant: "destructive" }) });
  };

  if (wf.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (wf.isError) return <ErrorBox message="Could not load this app's fields." onRetry={() => wf.refetch()} />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-5 rounded-2xl border border-border bg-card p-5" aria-label="Inputs">
        {fields.map((p) => <Field key={p.key} p={p} value={values[p.key] ?? p.defaultValue} onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))} />)}
        <Button className="w-full" onClick={start} disabled={run.isPending || !!active} data-testid="button-run-app">{run.isPending || active ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}{active ? "Running" : "Run"}</Button>
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-live="polite" aria-label="Result" data-testid="section-result">
        {!job && <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted-foreground">Results appear here.</div>}
        {job && active && <div className="space-y-2"><p className="text-sm font-bold">{job.status === "pending" ? "Queued" : "Generating"}</p><Progress value={job.progress ?? 5} /><p className="text-xs text-muted-foreground">{job.progress ?? 0}%</p></div>}
        {pollError && <ErrorBox message={`Status check failed: ${pollError}`} />}
        {job?.status === "failed" && <ErrorBox message={job.errorMessage ?? "The run failed."} onRetry={start} />}
        {job?.status === "cancelled" && <ErrorBox message="This run was cancelled." onRetry={start} />}
        {job?.status === "completed" && (job.outputs?.length ? (
          <div className="space-y-4">{job.outputs.map((o) => (
            <div key={o.id} className="space-y-2">
              {o.outputType === "video" ? <video src={o.comfyUrl} controls className="w-full rounded-xl" /> : o.outputType === "audio" ? <audio src={o.comfyUrl} controls className="w-full" /> : <img src={o.comfyUrl} alt={o.filename} className="w-full rounded-xl" />}
              <a href={o.comfyUrl} download={o.filename} className="inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid={`link-download-${o.id}`}><Download className="h-4 w-4" />Download {o.filename}</a>
            </div>))}</div>
        ) : <p className="text-sm text-muted-foreground">Completed with no outputs.</p>)}
      </section>
    </div>
  );
}

export default function WorkflowAppPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const embed = new URLSearchParams(window.location.search).get("embed") === "1";
  const q = useGetWorkflowApp(slug, { query: { enabled: !!isSignedIn && !!slug, queryKey: getGetWorkflowAppQueryKey(slug), retry: false } });

  if (!isLoaded) return <Skeleton className="h-64 w-full" />;
  if (!isSignedIn) return <SignInGate title="Sign in to use this app" />;
  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError || !q.data) return <ErrorBox message="This app was not found or is not published." onRetry={() => q.refetch()} />;
  const app = q.data;
  if (embed && !app.allowEmbed) return <ErrorBox message="This app does not allow embedding." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="page-workflow-app">
      <header className="overflow-hidden rounded-2xl border border-border bg-card">
        <img src={thumbFor(app.workflowId)} alt="" className="h-48 w-full object-cover sm:h-64" />
        <div className="p-5"><h1 className="text-3xl font-bold tracking-tight" data-testid="text-app-name">{app.name}</h1>{app.description && <p className="mt-1 text-sm text-muted-foreground">{app.description}</p>}</div>
      </header>
      {app.workflowId === COMPLETE_ID ? <PerformAnywhere key={app.slug} appConfig={app} /> : <SingleRunner key={app.slug} app={app} />}
    </div>
  );
}
