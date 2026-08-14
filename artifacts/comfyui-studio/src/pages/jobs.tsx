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
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4caf50]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Completed
        </span>
      );
      case "failed": return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#e05555]">
          <AlertCircle className="h-3.5 w-3.5" /> Failed
        </span>
      );
      case "running": return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#d4e84a]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running
        </span>
      );
      case "pending": return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666]">
          <PlayCircle className="h-3.5 w-3.5" /> Pending
        </span>
      );
      default: return <span className="text-xs text-[#666]">{status}</span>;
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
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Jobs</h1>
          <p className="text-[#555] text-sm mt-0.5">Monitor and manage your generation queue.</p>
        </div>
        <Link href="/generate">
          <Button className="bg-[#d4e84a] text-black hover:bg-[#c8dc3e] rounded-xl font-medium">
            New Generation
          </Button>
        </Link>
      </div>

      <div className="border border-[#2a2a2a] bg-[#1a1a1a] rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-[#111111] border-b border-[#2a2a2a]">
            <TableRow className="border-none hover:bg-[#111111]">
              <TableHead className="w-[80px] text-[#555] text-xs font-medium h-10">ID</TableHead>
              <TableHead className="text-[#555] text-xs font-medium h-10">Workflow</TableHead>
              <TableHead className="text-[#555] text-xs font-medium h-10">Status</TableHead>
              <TableHead className="w-[180px] text-[#555] text-xs font-medium h-10">Progress</TableHead>
              <TableHead className="text-[#555] text-xs font-medium h-10">Created</TableHead>
              <TableHead className="text-right text-[#555] text-xs font-medium h-10">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="border-b border-[#2a2a2a]">
                <TableCell colSpan={6} className="h-32 text-center text-[#444]">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#d4e84a]" />
                  <span className="text-sm">Loading jobs…</span>
                </TableCell>
              </TableRow>
            ) : jobs && jobs.length > 0 ? (
              jobs.map((job) => {
                const progress = getProgress(job);
                return (
                  <TableRow key={job.id} className="border-b border-[#2a2a2a] hover:bg-[#1e1e1e] transition-colors">
                    <TableCell className="font-mono text-xs text-[#444]">#{job.id}</TableCell>
                    <TableCell className="font-medium text-sm text-[#e8e8e8]">{job.workflowId}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>
                      {progress !== null ? (
                        <div className="space-y-1">
                          <Progress value={progress} className="h-1.5 bg-[#252525] rounded-full" />
                          <span className="text-xs text-[#555] font-mono">{progress}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-[#333]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-[#555]">{formatDate(job.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {job.status === "completed" && (
                          <Link href="/gallery">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#555] hover:text-[#d4e84a] rounded-lg">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#555] hover:text-[#e05555] rounded-lg"
                          onClick={() => handleDelete(job.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-[#444] text-sm">
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
