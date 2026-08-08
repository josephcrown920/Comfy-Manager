import { useState, useEffect } from "react";
import {
  useGetModelAssignments,
  useUpdateModelAssignments,
  useGetComfyModels,
  useListWorkflows,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetModelAssignmentsQueryKey,
} from "@workspace/api-client-react";
import { Cpu, Globe, ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";

// The unset sentinel shown in the select
const NONE_VALUE = "__none__";

interface WorkflowAssignment {
  checkpoint: string;
  checkpointFallback: string;
}

interface AssignmentsState {
  global: WorkflowAssignment;
  workflows: Record<string, WorkflowAssignment>;
}

function ModelSelect({
  value,
  onChange,
  checkpoints,
  placeholder,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  checkpoints: string[];
  placeholder: string;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-9 w-full" />;

  const selectValue = value || NONE_VALUE;

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}
    >
      <SelectTrigger className="w-full font-mono text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE} className="text-muted-foreground italic">
          {placeholder}
        </SelectItem>
        {checkpoints.map((ckpt) => (
          <SelectItem key={ckpt} value={ckpt} className="font-mono text-xs">
            {ckpt}
          </SelectItem>
        ))}
        {checkpoints.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No checkpoints found — connect your ComfyUI server first.
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

function AssignmentRow({
  label,
  description,
  assignment,
  checkpoints,
  modelsLoading,
  onChange,
}: {
  label: string;
  description?: string;
  assignment: WorkflowAssignment;
  checkpoints: string[];
  modelsLoading: boolean;
  onChange: (a: WorkflowAssignment) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Primary Checkpoint</Label>
          <ModelSelect
            value={assignment.checkpoint}
            onChange={(v) => onChange({ ...assignment, checkpoint: v })}
            checkpoints={checkpoints}
            placeholder="Use workflow default"
            loading={modelsLoading}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-amber-500" />
            Fallback (if primary unavailable)
          </Label>
          <ModelSelect
            value={assignment.checkpointFallback}
            onChange={(v) => onChange({ ...assignment, checkpointFallback: v })}
            checkpoints={checkpoints}
            placeholder="No fallback"
            loading={modelsLoading}
          />
        </div>
      </div>
    </div>
  );
}

export default function Models() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: savedAssignments, isLoading: assignmentsLoading } =
    useGetModelAssignments();
  const { data: models, isLoading: modelsLoading, refetch: refetchModels, isFetching: modelsFetching } =
    useGetComfyModels();
  const { data: workflows, isLoading: workflowsLoading } = useListWorkflows();
  const updateAssignments = useUpdateModelAssignments();

  const [state, setState] = useState<AssignmentsState>({
    global: { checkpoint: "", checkpointFallback: "" },
    workflows: {},
  });

  useEffect(() => {
    if (savedAssignments) {
      setState({
        global: {
          checkpoint: savedAssignments.global?.checkpoint ?? "",
          checkpointFallback: savedAssignments.global?.checkpointFallback ?? "",
        },
        workflows: Object.fromEntries(
          Object.entries(savedAssignments.workflows ?? {}).map(([id, wf]) => [
            id,
            {
              checkpoint: wf?.checkpoint ?? "",
              checkpointFallback: wf?.checkpointFallback ?? "",
            },
          ])
        ),
      });
    }
  }, [savedAssignments]);

  const checkpoints = models?.checkpoints ?? [];
  const isLoading = assignmentsLoading || workflowsLoading;

  const handleSave = () => {
    updateAssignments.mutate(
      { data: state },
      {
        onSuccess: () => {
          toast({ title: "Model assignments saved" });
          queryClient.invalidateQueries({
            queryKey: getGetModelAssignmentsQueryKey(),
          });
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to save",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        },
      }
    );
  };

  const setWorkflowAssignment = (wfId: string, a: WorkflowAssignment) => {
    setState((prev) => ({
      ...prev,
      workflows: { ...prev.workflows, [wfId]: a },
    }));
  };

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-display font-bold">Model Orchestrator</h1>
        <p className="text-muted-foreground mt-1">
          Assign which checkpoint to use per workflow and configure fallbacks
          for when a model isn't available.
        </p>
      </div>

      {/* Available model counts */}
      <div className="flex flex-wrap gap-2 items-center">
        {modelsLoading ? (
          <Skeleton className="h-6 w-48" />
        ) : (
          <>
            <Badge variant="secondary" className="gap-1.5">
              <Cpu className="h-3 w-3" />
              {checkpoints.length} checkpoints
            </Badge>
            <Badge variant="secondary">{models?.loras.length ?? 0} LoRAs</Badge>
            <Badge variant="secondary">{models?.vaes.length ?? 0} VAEs</Badge>
            <Badge variant="secondary">
              {models?.controlnets.length ?? 0} ControlNets
            </Badge>
            {checkpoints.length === 0 && (
              <span className="flex items-center gap-1.5 text-xs text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                Connect your ComfyUI server to see available models
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto gap-1.5 text-xs"
              onClick={() => refetchModels()}
              disabled={modelsFetching}
            >
              <RefreshCw className={`h-3 w-3 ${modelsFetching ? "animate-spin" : ""}`} />
              Refresh models
            </Button>
          </>
        )}
      </div>

      {/* Global defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-primary" />
            Global Defaults
          </CardTitle>
          <CardDescription>
            Applies to any workflow that doesn't have a specific assignment
            below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <AssignmentRow
              label="Default checkpoint"
              assignment={state.global}
              checkpoints={checkpoints}
              modelsLoading={modelsLoading}
              onChange={(a) => setState((prev) => ({ ...prev, global: a }))}
            />
          )}
        </CardContent>
      </Card>

      {/* Per-workflow assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cpu className="h-5 w-5 text-primary" />
            Per-Workflow Assignments
          </CardTitle>
          <CardDescription>
            Override the global default for specific workflows. Leaving a field
            empty falls back to the global default.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="py-5">
                  <Skeleton className="h-4 w-32 mb-3" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-9" />
                    <Skeleton className="h-9" />
                  </div>
                </div>
              ))
            : (workflows ?? []).map((wf) => (
                <div key={wf.id} className="py-5 first:pt-0 last:pb-0">
                  <AssignmentRow
                    label={wf.name}
                    description={wf.description}
                    assignment={
                      state.workflows[wf.id] ?? {
                        checkpoint: "",
                        checkpointFallback: "",
                      }
                    }
                    checkpoints={checkpoints}
                    modelsLoading={modelsLoading}
                    onChange={(a) => setWorkflowAssignment(wf.id, a)}
                  />
                </div>
              ))}
        </CardContent>
        <CardFooter className="bg-muted/30 border-t py-4 flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            Changes apply to new jobs only — existing running jobs are
            unaffected.
          </p>
          <Button
            onClick={handleSave}
            disabled={updateAssignments.isPending || isLoading}
          >
            {updateAssignments.isPending ? "Saving…" : "Save Assignments"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
