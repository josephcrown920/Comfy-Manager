import { useState, useEffect, useRef } from "react";
import { useListJobs, useDeleteJob, getListJobsQueryKey, refreshJob } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink, Loader2, PlayCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

// Live progress state keyed by comfyPromptId
type ProgressMap = Record<string, { value: number; max: number }>;

// Map of comfyPromptId → job id for dispatching refresh on completion
type PromptJobMap = Record<string, number>;

function useComfyWebSocket(hasRunningJobs: boolean, promptJobMap: PromptJobMap) {
  const queryClient = useQueryClient();
  const [liveProgress, setLiveProgress] = useState<ProgressMap>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep latest promptJobMap accessible inside the stable WS callback
  const promptJobMapRef = useRef<PromptJobMap>(promptJobMap);
  promptJobMapRef.current = promptJobMap;

  useEffect(() => {
    if (!hasRunningJobs) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
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
        try {
          msg = JSON.parse(event.data as string) as typeof msg;
        } catch {
          return;
        }

        if (msg.type === "progress" && msg.data) {
          const promptId = msg.data["prompt_id"] as string | undefined;
          const value = msg.data["value"] as number | undefined;
          const max = msg.data["max"] as number | undefined;
          if (promptId && value != null && max != null) {
            setLiveProgress((prev) => ({
              ...prev,
              [promptId]: { value, max },
            }));
          }
        } else if (msg.type === "executing" && msg.data && msg.data["node"] == null) {
          // node === null signals execution finished for this prompt
          const promptId = msg.data["prompt_id"] as string | undefined;
          if (promptId) {
            // Remove stale live-progress entry
            setLiveProgress((prev) => {
              const next = { ...prev };
              delete next[promptId];
              return next;
            });

            // Look up the corresponding job and trigger server-side reconciliation
            // so the DB status flips to completed and outputs are saved
            const jobId = promptJobMapRef.current[promptId];
            if (jobId != null) {
              refreshJob(jobId)
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
                })
                .catch(() => {
                  // Fallback: at least refresh the list so polling can catch up
                  queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
                });
            } else {
              queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
            }
          }
        } else if (msg.type === "status") {
          // Queue state changes (new job queued, queue emptied, etc.)
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [hasRunningJobs, queryClient]);

  return liveProgress;
}

export default function Jobs() {
  const { data: jobs, isLoading } = useListJobs(undefined, {
    query: {
      // Slow fallback poll; WS-driven updates handle the real-time case
      refetchInterval: 15000,
      queryKey: getListJobsQueryKey()
    }
  });

  const hasRunningJobs = !!jobs?.some((j) => j.status === "running" || j.status === "pending");

  // Build a stable map from comfyPromptId → job id so the WS hook can trigger refresh
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
      case 'completed': return <Badge variant="default" className="bg-green-500/20 text-green-500 hover:bg-green-500/30"><CheckCircle2 className="mr-1 h-3 w-3" /> Completed</Badge>;
      case 'failed': return <Badge variant="destructive" className="bg-destructive/20 text-destructive hover:bg-destructive/30"><AlertCircle className="mr-1 h-3 w-3" /> Failed</Badge>;
      case 'running': return <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-500 hover:bg-cyan-500/30 border-cyan-500/30"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Running</Badge>;
      case 'pending': return <Badge variant="outline" className="text-muted-foreground"><PlayCircle className="mr-1 h-3 w-3" /> Pending</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getProgress = (job: { status: string; progress?: number | null; comfyPromptId?: string | null }) => {
    if (job.status !== "running") return null;
    // Prefer live WS progress over DB value
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
          <h1 className="text-3xl font-display font-bold">Jobs</h1>
          <p className="text-muted-foreground">Monitor and manage your generation queue.</p>
        </div>
        <Link href="/generate">
          <Button>New Generation</Button>
        </Link>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[200px]">Progress</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading jobs...
                </TableCell>
              </TableRow>
            ) : jobs && jobs.length > 0 ? (
              jobs.map(job => {
                const progress = getProgress(job);
                return (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">#{job.id}</TableCell>
                    <TableCell className="font-medium">{job.workflowName}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>
                      {progress != null ? (
                        <div className="space-y-1">
                          <Progress value={progress} className="h-1.5" />
                          <div className="text-[10px] text-right text-muted-foreground">{progress}%</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(job.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {job.status === 'completed' && job.outputs && job.outputs.length > 0 && (
                          <Link href={`/gallery`}>
                            <Button variant="ghost" size="icon" title="View Outputs">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(job.id)} disabled={deleteJob.isPending}>
                          <Trash2 className="h-4 w-4 text-destructive opacity-70 hover:opacity-100" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
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
