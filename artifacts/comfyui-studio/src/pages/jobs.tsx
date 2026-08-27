import { useState, useEffect, useRef, useMemo } from "react";
import { useListJobs, useDeleteJob, getListJobsQueryKey, refreshJob, useListBatches, useCancelBatch, useRetryBatchChild, refreshBatch, getListBatchesQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink, Loader2, PlayCircle, CheckCircle2, AlertCircle, GitBranch, RotateCcw, Square, Search, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

type ProgressMap = Record<string, { value: number; max: number }>;
type PromptJobMap = Record<string, number>;

function useComfyWebSocket(hasRunningJobs: boolean, promptJobMap: PromptJobMap) {
  const queryClient = useQueryClient();
  const [liveProgress, setLiveProgress] = useState<ProgressMap>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptJobMapRef = useRef<PromptJobMap>(promptJobMap);
  promptJobMapRef.current = promptJobMap;

  useEffect(() => {
    if (!hasRunningJobs) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      return;
    }
    let cancelled = false;
    function connect() {
      if (cancelled) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/ws`);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        let msg: { type: string; data?: Record<string, unknown> };
        try { msg = JSON.parse(event.data as string) as typeof msg; } catch { return; }
        if (msg.type === "progress" && msg.data) {
          const promptId = msg.data["prompt_id"] as string | undefined;
          const value = msg.data["value"] as number | undefined;
          const max = msg.data["max"] as number | undefined;
          if (promptId && value != null && max != null) {
            setLiveProgress((prev) => ({ ...prev, [promptId]: { value, max } }));
          }
        } else if (msg.type === "executing" && msg.data && msg.data["node"] == null) {
          const promptId = msg.data["prompt_id"] as string | undefined;
          if (promptId) {
            setLiveProgress((prev) => { const next = { ...prev }; delete next[promptId]; return next; });
            const jobId = promptJobMapRef.current[promptId];
            if (jobId != null) {
              refreshJob(jobId).then(() => queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() }))
                .catch(() => queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() }));
            } else {
              queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
            }
          }
        } else if (msg.type === "status") {
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        }
      };
      ws.onclose = () => { if (!cancelled) { reconnectTimerRef.current = setTimeout(connect, 3000); } };
      ws.onerror = () => { ws.close(); };
    }
    connect();
    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [hasRunningJobs, queryClient]);

  return liveProgress;
}

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobSearch, setJobSearch] = useState("");
  const { data: jobs, isLoading } = useListJobs(undefined, {
    query: { refetchInterval: 30000, queryKey: getListJobsQueryKey() }
  });
  const { data: batches } = useListBatches({ query: { refetchInterval: 5000, queryKey: getListBatchesQueryKey() } });
  const cancelBatch = useCancelBatch();
  const retryBatchChild = useRetryBatchChild();

  const hasRunningJobs = !!jobs?.some((j) => j.status === "running" || j.status === "pending");
  const promptJobMap: PromptJobMap = {};
  if (jobs) {
    for (const job of jobs) {
      if (job.comfyPromptId && (job.status === "running" || job.status === "pending")) {
        promptJobMap[job.comfyPromptId] = job.id;
      }
    }
  }

  const liveProgress = useComfyWebSocket(hasRunningJobs, promptJobMap);
  const deleteJob = useDeleteJob();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const visibleJobs = useMemo(() => {
    const normalizedSearch = jobSearch.trim().toLowerCase();
    return (jobs ?? []).filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      const matchesSearch = !normalizedSearch || job.workflowId.toLowerCase().includes(normalizedSearch) || String(job.id).includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, jobSearch, statusFilter]);

  useEffect(() => {
    const active = batches?.filter((batch) => batch.status === "running" || batch.status === "pending") ?? [];
    if (!active.length) return;
    const refresh = () => {
      void Promise.all(active.map((batch) => refreshBatch(batch.id)))
        .finally(() => queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() }));
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [batches, queryClient]);

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this job?")) {
      deleteJob.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Job deleted" });
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        }
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4caf50]/10 text-[#4caf50] text-xs font-semibold">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </span>
      );
      case "failed": return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#e05555]/10 text-[#e05555] text-xs font-semibold">
          <AlertCircle className="h-3 w-3" /> Failed
        </span>
      );
      case "running": return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#e8f724]/10 text-[#e8f724] text-xs font-semibold">
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </span>
      );
      case "pending": return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2a2448] text-[#7b72a8] text-xs font-semibold">
          <PlayCircle className="h-3 w-3" /> Pending
        </span>
      );
      default: return <span className="text-xs text-[#7b72a8]">{status}</span>;
    }
  };

  const getProgress = (job: { status: string; progress?: number | null; comfyPromptId?: string | null }) => {
    if (job.status !== "running") return null;
    if (job.comfyPromptId && liveProgress[job.comfyPromptId]) {
      const { value, max } = liveProgress[job.comfyPromptId];
      return max > 0 ? Math.round((value / max) * 100) : 0;
    }
    return job.progress ?? 0;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0eeff]">Jobs</h1>
          <p className="text-[#7b72a8] text-sm mt-0.5">Monitor and manage your generation queue.</p>
        </div>
        <Link href="/generate">
          <Button className="bg-[#e8f724] text-[#0d0b1a] hover:bg-[#d4e010] rounded-full font-bold px-5">
            New Generation
          </Button>
        </Link>
      </div>

      {batches && batches.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-[#e8f724]" />
            <h2 className="text-sm font-bold text-[#f0eeff]">Creative batches</h2>
            <span className="text-xs text-[#7b72a8]">One child runs at a time on your GPU</span>
          </div>
          <div className="space-y-3">
            {batches.map((batch) => {
              const done = batch.completedJobs + batch.failedJobs + batch.cancelledJobs;
              const value = batch.totalJobs ? Math.round((done / batch.totalJobs) * 100) : 0;
              return (
                <div key={batch.id} className="overflow-hidden rounded-2xl border border-[#39305f] bg-[#1e1a38]">
                  <div className="flex flex-col gap-3 border-b border-[#39305f] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-semibold text-[#f0eeff]">{batch.name}</p><p className="mt-0.5 text-xs capitalize text-[#7b72a8]">{batch.batchType.replace(/-/g, " ")} · {batch.totalJobs} controlled variations</p></div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${batch.status === "completed" ? "bg-[#4caf50]/10 text-[#7bd47f]" : batch.status === "failed" ? "bg-[#e05555]/10 text-[#e87979]" : batch.status === "cancelled" ? "bg-[#776ca4]/15 text-[#a79dc7]" : "bg-[#e8f724]/10 text-[#e8f724]"}`}>{batch.status}</span>
                      {(batch.status === "pending" || batch.status === "running") && <Button size="sm" variant="ghost" className="h-8 rounded-full text-[#a79dc7] hover:text-[#e87979]" onClick={() => cancelBatch.mutate({ id: batch.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() }) })}><Square className="mr-1 h-3.5 w-3.5 fill-current" /> Stop queue</Button>}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="mb-3 flex items-center gap-3"><Progress value={value} className="h-1.5 flex-1 bg-[#2a2448]" /><span className="whitespace-nowrap font-mono text-xs text-[#a79dc7]">{done}/{batch.totalJobs} complete · {batch.failedJobs} failed</span></div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {batch.children.map((child) => (
                        <div key={child.id} className="rounded-xl border border-[#39305f] bg-[#151127] p-3">
                          <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-[#e8f724]">V{child.batchIndex}</span><span className="text-xs capitalize text-[#a79dc7]">{child.status}</span></div>
                          <p className="mt-1 line-clamp-1 text-xs text-[#d4ceed]">{String((child.params as Record<string, any>).variation?.camera ?? (child.params as Record<string, any>).variation?.aspect ?? child.workflowName)}</p>
                          {child.errorMessage && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#e87979]">{child.errorMessage}</p>}
                          <div className="mt-2 flex items-center gap-2">
                            {child.outputs?.length ? <Link href="/gallery" className="text-[11px] font-bold text-[#e8f724]">View output →</Link> : null}
                            {child.status === "failed" && <button className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-[#e8f724]" onClick={() => retryBatchChild.mutate({ id: batch.id, jobId: child.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() }) })}><RotateCcw className="h-3 w-3" /> Retry</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {["all", "running", "pending", "completed", "failed"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                statusFilter === status
                  ? "border-[#e8f724] bg-[#e8f724] text-[#0d0b1a]"
                  : "border-[#2d2650] bg-[#1e1a38] text-[#7b72a8] hover:border-[#e8f724]/50 hover:text-[#f0eeff]"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="job-search" className="sr-only">Search jobs</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b72a8]" />
          <input
            id="job-search"
            value={jobSearch}
            onChange={(event) => setJobSearch(event.target.value)}
            placeholder="Search workflow or job ID"
            className="h-10 w-full rounded-full border border-[#2d2650] bg-[#1e1a38] pl-10 pr-10 text-sm text-[#f0eeff] outline-none placeholder:text-[#4a4269] focus:border-[#e8f724]/60"
          />
          {jobSearch && (
            <button type="button" aria-label="Clear job search" onClick={() => setJobSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7b72a8] hover:text-[#f0eeff]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="border border-[#2d2650] bg-[#1e1a38] rounded-2xl overflow-hidden">
        <Table>
          <TableHeader className="bg-[#16122a] border-b border-[#2d2650]">
            <TableRow className="border-none hover:bg-[#16122a]">
              {["ID", "Workflow", "Status", "Progress", "Created", "Actions"].map((h, i) => (
                <TableHead key={h} className={`text-[#4a4269] text-xs font-semibold h-10 ${i === 5 ? "text-right" : ""} ${i === 0 ? "w-[80px]" : ""} ${i === 3 ? "w-[180px]" : ""}`}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="border-b border-[#2d2650]">
                <TableCell colSpan={6} className="h-32 text-center text-[#4a4269]">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#e8f724]" />
                  <span className="text-sm">Loading jobs…</span>
                </TableCell>
              </TableRow>
            ) : visibleJobs.length > 0 ? (
              visibleJobs.map((job) => {
                const progress = getProgress(job);
                return (
                  <TableRow key={job.id} className="border-b border-[#2d2650] hover:bg-[#231f42] transition-colors">
                    <TableCell className="font-mono text-xs text-[#4a4269]">#{job.id}</TableCell>
                    <TableCell className="font-medium text-sm text-[#f0eeff]">{job.workflowId}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>
                      {progress !== null ? (
                        <div className="space-y-1">
                          <Progress value={progress} className="h-1.5 bg-[#2a2448] rounded-full" />
                          <span className="text-xs text-[#7b72a8] font-mono">{progress}%</span>
                        </div>
                      ) : <span className="text-xs text-[#2d2650]">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-[#7b72a8]">{formatDate(job.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {job.status === "completed" && (
                          <Link href="/gallery">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#4a4269] hover:text-[#e8f724] rounded-full">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#4a4269] hover:text-[#e05555] rounded-full"
                          onClick={() => handleDelete(job.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-[#4a4269] text-sm">
                No jobs match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
