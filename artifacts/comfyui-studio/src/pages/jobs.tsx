import { useState } from "react";
import { useListJobs, useDeleteJob, getListJobsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink, Loader2, PlayCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

export default function Jobs() {
  const { data: jobs, isLoading } = useListJobs(undefined, {
    query: {
      refetchInterval: 5000, // Poll every 5s for progress
      queryKey: getListJobsQueryKey()
    }
  });

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
              jobs.map(job => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{job.id}</TableCell>
                  <TableCell className="font-medium">{job.workflowName}</TableCell>
                  <TableCell>{getStatusBadge(job.status)}</TableCell>
                  <TableCell>
                    {job.status === 'running' ? (
                      <div className="space-y-1">
                        <Progress value={job.progress || 0} className="h-1.5" />
                        <div className="text-[10px] text-right text-muted-foreground">{job.progress || 0}%</div>
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
              ))
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
