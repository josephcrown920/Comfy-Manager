import { useState, useEffect, useRef, useMemo } from "react";
import { useListJobs, useDeleteJob, getListJobsQueryKey, refreshJob, useListBatches, useCancelBatch, useRetryBatchChild, refreshBatch, getListBatchesQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink, Loader2, PlayCircle, CheckCircle2, AlertCircle, GitBranch, RotateCcw, Square, Search, X, ListOrdered } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageHeader } from "@/components/operations-design/PageHeader";

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

function JobsVisual() {
  return (
    <div className="absolute inset-0 bg-[#09080D] overflow-hidden flex items-center justify-center pointer-events-none" aria-hidden="true">
      <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 border border-white/10 rounded-md z-20">
        <span className="text-[10px] font-mono text-[#7b72a8] uppercase tracking-wider">Illustrative example (NOT live)</span>
      </div>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#BEB2CC 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="relative z-10 flex gap-4 overflow-hidden w-full px-12">
        <div className="h-16 w-32 border border-[#B7F54A]/40 bg-[#171120] rounded-xl flex items-center justify-center relative translate-x-12 opacity-30 shadow-[0_0_15px_rgba(183,245,74,0.1)]">
          <div className="h-2 w-16 bg-[#B7F54A]/30 rounded-full" />
        </div>
        <div className="h-16 w-32 border border-[#A779F5]/40 bg-[#171120] rounded-xl flex items-center justify-center relative translate-x-6 opacity-60 shadow-[0_0_15px_rgba(167,121,245,0.1)]">
          <div className="h-2 w-16 bg-[#A779F5]/50 rounded-full" />
        </div>
        <div className="h-16 w-48 border-2 border-[#B7F54A] bg-[#B7F54A]/10 rounded-xl flex items-center justify-center relative shadow-[0_0_30px_rgba(183,245,74,0.2)]">
          <div className="absolute top-0 left-0 h-1 bg-[#B7F54A] shadow-[0_0_10px_#B7F54A] transition-all" style={{ width: '60%' }} />
          <Loader2 className="w-5 h-5 text-[#B7F54A] animate-spin mr-3" />
          <div className="h-2 w-16 bg-[#B7F54A] rounded-full" />
        </div>
        <div className="h-16 w-32 border border-[#2d2650] bg-[#171120] rounded-xl flex items-center justify-center relative -translate-x-6 opacity-60">
          <div className="h-2 w-16 bg-[#BEB2CC]/30 rounded-full" />
        </div>
        <div className="h-16 w-32 border border-[#2d2650] bg-[#171120] rounded-xl flex items-center justify-center relative -translate-x-12 opacity-30">
          <div className="h-2 w-16 bg-[#BEB2CC]/20 rounded-full" />
        </div>
      </div>
    </div>
  );
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
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#B7F54A]/10 border border-[#B7F54A]/20 text-[#B7F54A] text-[10px] uppercase font-bold tracking-wider">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </span>
      );
      case "failed": return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] uppercase font-bold tracking-wider">
          <AlertCircle className="h-3 w-3" /> Failed
        </span>
      );
      case "running": return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#A779F5]/10 border border-[#A779F5]/20 text-[#A779F5] text-[10px] uppercase font-bold tracking-wider">
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </span>
      );
      case "pending": return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#171120] border border-[#2d2650] text-[#7b72a8] text-[10px] uppercase font-bold tracking-wider">
          <PlayCircle className="h-3 w-3" /> Pending
        </span>
      );
      default: return <span className="text-[10px] uppercase font-bold tracking-wider text-[#7b72a8]">{status}</span>;
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
    <div className="max-w-[1400px] mx-auto pb-12">
      <PageHeader 
        title="Generation Queue"
        description="Monitor processing status, batch variations, and review logs for all your active and past generation jobs."
        visual={<JobsVisual />}
        actions={
          <Link href="/generate">
            <Button className="bg-[#B7F54A] text-[#09080D] hover:bg-[#a4de3a] font-bold rounded-xl h-12 px-6 shadow-lg shadow-[#B7F54A]/20">
              New Generation
            </Button>
          </Link>
        }
      />

      <div className="space-y-8 animate-in fade-in duration-500 delay-150 fill-mode-both">
        {batches && batches.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <GitBranch className="h-5 w-5 text-[#A779F5]" />
              <h2 className="text-xl font-bold text-white">Creative Batches</h2>
            </div>
            <div className="space-y-4">
              {batches.map((batch) => {
                const done = batch.completedJobs + batch.failedJobs + batch.cancelledJobs;
                const value = batch.totalJobs ? Math.round((done / batch.totalJobs) * 100) : 0;
                return (
                  <div key={batch.id} className="overflow-hidden rounded-3xl border border-[#2d2650] bg-[#171120] hover:border-[#A779F5]/30 transition-colors group">
                    <div className="flex flex-col gap-4 border-b border-[#2d2650] p-6 bg-[#1a1325] sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-lg text-white">{batch.name}</p>
                        <p className="mt-1 text-xs text-[#BEB2CC] capitalize">{batch.batchType.replace(/-/g, " ")} · {batch.totalJobs} controlled variations</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-3 py-1 text-[10px] uppercase font-bold tracking-wider ${batch.status === "completed" ? "bg-[#B7F54A]/10 text-[#B7F54A] border border-[#B7F54A]/20" : batch.status === "failed" ? "bg-red-500/10 text-red-400 border border-red-500/20" : batch.status === "cancelled" ? "bg-[#2d2650]/50 text-[#7b72a8] border border-[#2d2650]" : "bg-[#A779F5]/10 text-[#A779F5] border border-[#A779F5]/20"}`}>{batch.status}</span>
                        {(batch.status === "pending" || batch.status === "running") && <Button size="sm" variant="outline" className="h-8 rounded-xl bg-transparent border-[#2d2650] text-[#BEB2CC] hover:bg-[#2d2650] hover:text-white" onClick={() => cancelBatch.mutate({ id: batch.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() }) })}><Square className="mr-2 h-3.5 w-3.5 fill-current" /> Stop Queue</Button>}
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="mb-6 flex items-center gap-4">
                        <Progress value={value} className="h-2 flex-1 bg-[#09080D] border border-[#2d2650]" />
                        <span className="whitespace-nowrap font-mono text-xs text-[#7b72a8]">{done}/{batch.totalJobs} complete {batch.failedJobs > 0 && <span className="text-red-400 ml-1">· {batch.failedJobs} failed</span>}</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {batch.children.map((child) => (
                          <div key={child.id} className="rounded-2xl border border-[#2d2650] bg-[#09080D] p-4 group/child hover:border-[#A779F5]/30 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#A779F5] bg-[#A779F5]/10 px-2 py-0.5 rounded-md">Var {child.batchIndex}</span>
                              <span className="text-[10px] uppercase font-bold tracking-wider text-[#7b72a8]">{child.status}</span>
                            </div>
                            <p className="mt-3 truncate text-xs text-[#7b72a8] font-mono">{child.workerLabel || "Waiting for a compatible GPU"}</p>
                            <p className="mt-1 line-clamp-1 text-sm text-white font-medium">{String((child.params as Record<string, any>).variation?.camera ?? (child.params as Record<string, any>).variation?.aspect ?? child.workflowName)}</p>
                            {child.errorMessage && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-red-400 bg-red-500/5 p-2 rounded-lg border border-red-500/10">{child.errorMessage}</p>}
                            <div className="mt-4 flex items-center gap-2">
                              {child.outputs?.length ? <Link href="/gallery" className="text-xs font-bold text-[#B7F54A] hover:underline underline-offset-4">View Output →</Link> : null}
                              {child.status === "failed" && <button className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-white hover:text-[#B7F54A] transition-colors bg-[#2d2650]/50 px-3 py-1.5 rounded-lg" onClick={() => retryBatchChild.mutate({ id: batch.id, jobId: child.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() }) })}><RotateCcw className="h-3 w-3" /> Retry</button>}
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

        <section className="space-y-4 pt-4 border-t border-[#2d2650]">
          <div className="flex items-center gap-3 px-1 mb-6">
            <ListOrdered className="h-5 w-5 text-[#B7F54A]" />
            <h2 className="text-xl font-bold text-white">All Jobs</h2>
          </div>
          
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-[#171120] p-4 rounded-3xl border border-[#2d2650]">
            <div className="flex flex-wrap gap-2">
              {["all", "running", "pending", "completed", "failed"].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    statusFilter === status
                      ? "border-[#A779F5] bg-[#A779F5]/10 text-[#A779F5]"
                      : "border-[#2d2650] bg-[#09080D] text-[#7b72a8] hover:border-[#A779F5]/50 hover:text-white"
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
                placeholder="Search workflow or ID..."
                className="h-10 w-full rounded-xl border border-[#2d2650] bg-[#09080D] pl-10 pr-10 text-sm text-white outline-none placeholder:text-[#7b72a8] focus:border-[#A779F5]/60 focus:ring-1 focus:ring-[#A779F5]/30 transition-all"
              />
              {jobSearch && (
                <button type="button" aria-label="Clear job search" onClick={() => setJobSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7b72a8] hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="border border-[#2d2650] bg-[#171120] rounded-3xl overflow-hidden shadow-xl shadow-[#09080D]">
            <Table>
              <TableHeader className="bg-[#1a1325] border-b border-[#2d2650]">
                <TableRow className="border-none hover:bg-[#1a1325]">
                  {["ID", "Workflow", "GPU", "Status", "Progress", "Created", "Actions"].map((h, i) => (
                    <TableHead key={h} className={`text-[#7b72a8] text-[10px] uppercase font-bold tracking-wider h-12 ${i === 6 ? "text-right pr-6" : ""} ${i === 0 ? "w-[80px] pl-6" : ""} ${i === 4 ? "w-[180px]" : ""}`}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow className="border-b border-[#2d2650]">
                    <TableCell colSpan={7} className="h-48 text-center text-[#7b72a8]">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-[#A779F5]" />
                      <span className="text-sm font-medium">Fetching jobs...</span>
                    </TableCell>
                  </TableRow>
                ) : visibleJobs.length > 0 ? (
                  visibleJobs.map((job) => {
                    const progress = getProgress(job);
                    return (
                      <TableRow key={job.id} className="border-b border-[#2d2650] hover:bg-[#231f42]/50 transition-colors">
                        <TableCell className="font-mono text-xs text-[#BEB2CC] pl-6">#{job.id}</TableCell>
                        <TableCell className="font-medium text-sm text-white">{job.workflowId}</TableCell>
                        <TableCell className="max-w-[150px]">
                          <span className="inline-flex max-w-full items-center rounded-lg border border-[#2d2650] bg-[#09080D] px-3 py-1 text-xs text-[#BEB2CC] font-mono shadow-inner">
                            <span className="truncate">{job.workerLabel || "External Pool"}</span>
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell>
                          {progress !== null ? (
                            <div className="space-y-2">
                              <Progress value={progress} className="h-1.5 bg-[#09080D] border border-[#2d2650]" />
                              <span className="text-[10px] uppercase font-bold tracking-wider text-[#A779F5]">{progress}%</span>
                            </div>
                          ) : <span className="text-xs text-[#2d2650]">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-[#7b72a8]">{formatDate(job.createdAt)}</TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {job.status === "completed" && (
                              <Link href="/gallery">
                                <Button variant="ghost" size="icon" aria-label="View output" className="h-9 w-9 text-[#BEB2CC] hover:text-[#B7F54A] hover:bg-[#B7F54A]/10 rounded-xl transition-colors">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                            <Button variant="ghost" size="icon" aria-label="Delete job" className="h-9 w-9 text-[#BEB2CC] hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                              onClick={() => handleDelete(job.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center text-[#7b72a8] text-sm">
                      <div className="border border-dashed border-[#2d2650] rounded-2xl p-8 max-w-md mx-auto bg-[#09080D]">
                        No jobs match the current filters.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
