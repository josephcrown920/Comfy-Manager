import { useState, useEffect, useRef } from "react";
import { useListJobs, useDeleteJob, getListJobsQueryKey, refreshJob } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink, Loader2, PlayCircle, CheckCircle2, AlertCircle } from "lucide-react";
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
  const { data: jobs, isLoading } = useListJobs(undefined, {
    query: { refetchInterval: 30000, queryKey: getListJobsQueryKey() }
  });

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
            ) : jobs && jobs.length > 0 ? (
              jobs.map((job) => {
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
                  No jobs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
