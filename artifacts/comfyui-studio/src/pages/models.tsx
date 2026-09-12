import { useState, useEffect } from "react";
import {
  useGetModelAssignments,
  useUpdateModelAssignments,
  useGetComfyModels,
  useGetModelArkModels,
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
import { Cpu, Globe, ShieldCheck, RefreshCw, AlertTriangle, Layers, Server, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/operations-design/PageHeader";

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
  if (loading) return <Skeleton className="h-10 w-full rounded-xl bg-[#1e1a38]" />;

  const selectValue = value || NONE_VALUE;

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}
    >
      <SelectTrigger className="w-full font-mono text-xs h-10 bg-[#09080D] border-[#2d2650] text-[#BEB2CC] focus:ring-[#A779F5]/30 rounded-xl">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-[#171120] border-[#2d2650] text-[#BEB2CC]">
        <SelectItem value={NONE_VALUE} className="text-[#7b72a8] italic focus:bg-[#2d2650]">
          {placeholder}
        </SelectItem>
        {checkpoints.map((ckpt) => (
          <SelectItem key={ckpt} value={ckpt} className="font-mono text-xs focus:bg-[#2d2650] focus:text-white">
            {ckpt}
          </SelectItem>
        ))}
        {checkpoints.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-[#7b72a8]">
            No checkpoints found — connect your server first.
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
    <div className="space-y-4 p-5 rounded-2xl bg-[#171120] border border-[#2d2650] hover:border-[#A779F5]/30 transition-colors">
      <div>
        <p className="text-base font-bold text-white flex items-center gap-2">
          {label}
        </p>
        {description && (
          <p className="text-sm text-[#BEB2CC] mt-1">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs font-semibold tracking-wider uppercase text-[#7b72a8]">Primary Checkpoint</Label>
          <ModelSelect
            value={assignment.checkpoint}
            onChange={(v) => onChange({ ...assignment, checkpoint: v })}
            checkpoints={checkpoints}
            placeholder="Use workflow default"
            loading={modelsLoading}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold tracking-wider uppercase text-[#7b72a8] flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#B7F54A]" />
            Fallback Checkpoint
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

function ModelsVisual() {
  return (
    <div className="absolute inset-0 bg-[#09080D] overflow-hidden flex items-center justify-center pointer-events-none" aria-hidden="true">
      <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 border border-white/10 rounded-md z-20">
        <span className="text-[10px] font-mono text-[#7b72a8] uppercase tracking-wider">Illustrative example (NOT live)</span>
      </div>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#BEB2CC 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      
      {/* Visual abstract representation of routing models */}
      <div className="relative z-10 flex items-center gap-8 md:gap-16 w-full px-12 max-w-4xl mx-auto">
        <div className="flex flex-col gap-4 w-1/3">
          <div className="h-12 border border-[#A779F5]/40 bg-[#171120] rounded-xl flex items-center px-4 gap-3 shadow-[0_0_15px_rgba(167,121,245,0.15)] relative">
            <div className="absolute right-0 top-1/2 w-8 border-b-2 border-dashed border-[#A779F5]/50 translate-x-full"></div>
            <Sparkles className="w-4 h-4 text-[#A779F5]" />
            <div className="h-2 bg-[#BEB2CC]/20 rounded w-full"></div>
          </div>
          <div className="h-12 border border-[#2d2650] bg-[#171120] rounded-xl flex items-center px-4 gap-3 relative opacity-50">
            <div className="absolute right-0 top-1/2 w-8 border-b-2 border-dashed border-[#2d2650] translate-x-full"></div>
            <Layers className="w-4 h-4 text-[#BEB2CC]" />
            <div className="h-2 bg-[#BEB2CC]/20 rounded w-full"></div>
          </div>
        </div>
        
        <div className="w-16 h-16 rounded-2xl bg-[#B7F54A] flex items-center justify-center shadow-[0_0_30px_rgba(183,245,74,0.3)] z-10 shrink-0">
          <Cpu className="w-8 h-8 text-[#09080D]" />
        </div>
        
        <div className="flex flex-col gap-3 w-1/3">
          <div className="h-16 border-2 border-[#A779F5] bg-[#A779F5]/10 rounded-xl flex items-center px-4 gap-3 relative">
            <div className="absolute left-0 top-1/2 w-8 border-b-2 border-[#A779F5] -translate-x-full"></div>
            <Server className="w-5 h-5 text-[#A779F5]" />
            <div className="flex-1">
              <div className="h-2 bg-[#A779F5] rounded w-3/4 mb-2"></div>
              <div className="h-1.5 bg-[#A779F5]/50 rounded w-1/2"></div>
            </div>
            <ShieldCheck className="w-4 h-4 text-[#B7F54A] ml-auto" />
          </div>
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
  const { data: modelArkCatalog, isLoading: modelArkLoading, refetch: refetchModelArk, isFetching: modelArkFetching } =
    useGetModelArkModels();
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
    <div className="max-w-4xl mx-auto pb-12">
      <PageHeader 
        title="Model Orchestrator"
        description="Assign checkpoints per workflow and configure robust fallbacks for when primary models are unavailable."
        visual={<ModelsVisual />}
      />

      <div className="space-y-8 animate-in fade-in duration-500 delay-150 fill-mode-both">
        {/* Available model counts */}
        <div className="flex flex-wrap gap-2 items-center p-4 bg-[#171120] border border-[#2d2650] rounded-2xl">
          {modelsLoading ? (
            <Skeleton className="h-8 w-64 bg-[#2d2650] rounded-xl" />
          ) : (
            <>
              <div className="flex gap-2 items-center bg-[#09080D] px-3 py-1.5 rounded-xl border border-[#2d2650]">
                <Cpu className="h-4 w-4 text-[#A779F5]" />
                <span className="text-sm font-bold text-white">{checkpoints.length} <span className="text-[#BEB2CC] font-normal">Checkpoints</span></span>
              </div>
              <div className="flex gap-2 items-center bg-[#09080D] px-3 py-1.5 rounded-xl border border-[#2d2650]">
                <span className="text-sm font-bold text-white">{models?.loras.length ?? 0} <span className="text-[#BEB2CC] font-normal">LoRAs</span></span>
              </div>
              <div className="flex gap-2 items-center bg-[#09080D] px-3 py-1.5 rounded-xl border border-[#2d2650]">
                <span className="text-sm font-bold text-white">{models?.vaes.length ?? 0} <span className="text-[#BEB2CC] font-normal">VAEs</span></span>
              </div>
              <div className="flex gap-2 items-center bg-[#09080D] px-3 py-1.5 rounded-xl border border-[#2d2650]">
                <span className="text-sm font-bold text-white">{models?.controlnets.length ?? 0} <span className="text-[#BEB2CC] font-normal">ControlNets</span></span>
              </div>
              
              {checkpoints.length === 0 && (
                <span className="flex items-center gap-2 text-sm text-red-400 font-medium ml-2">
                  <AlertTriangle className="h-4 w-4" />
                  Connect server to see available models
                </span>
              )}
              
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-2 bg-transparent border-[#2d2650] text-[#BEB2CC] hover:bg-[#2d2650] hover:text-white rounded-xl h-9"
                onClick={() => refetchModels()}
                disabled={modelsFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${modelsFetching ? "animate-spin text-[#B7F54A]" : ""}`} />
                Refresh
              </Button>
            </>
          )}
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 px-1">
            <div>
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-[#B7F54A]" />
                <h2 className="text-xl font-bold text-white">Hosted ModelArk Catalog</h2>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-[#BEB2CC]">
                Hosted text, image, and video models. These do not require a connected ComfyUI GPU.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent border-[#2d2650] text-[#BEB2CC] hover:bg-[#2d2650] hover:text-white rounded-xl h-9"
              onClick={() => refetchModelArk()}
              disabled={modelArkFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${modelArkFetching ? "animate-spin text-[#B7F54A]" : ""}`} />
              Refresh
            </Button>
          </div>

          {modelArkLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl bg-[#171120] border border-[#2d2650]" />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {(["text", "image", "video"] as const).map((capability) => {
                const hostedModels = (modelArkCatalog?.models ?? []).filter((model) => model.capability === capability);
                return (
                  <div key={capability} className="rounded-2xl border border-[#2d2650] bg-[#171120] p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-[#7b72a8]">{capability} models</p>
                        <p className="mt-1 text-sm text-[#BEB2CC]">{hostedModels.length} hosted options</p>
                      </div>
                      <span className="rounded-lg border border-[#B7F54A]/30 bg-[#B7F54A]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#B7F54A]">
                        API
                      </span>
                    </div>
                    <div className="space-y-2">
                      {hostedModels.map((model) => (
                        <div key={model.id} className="rounded-xl border border-[#2d2650] bg-[#09080D] p-3">
                          <p className="text-sm font-semibold text-white">{model.name}</p>
                          <p className="mt-1 break-all font-mono text-[10px] text-[#A779F5]">{model.id}</p>
                          <p className="mt-2 text-xs leading-relaxed text-[#BEB2CC]">{model.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className={`text-xs ${modelArkCatalog?.configured ? "text-[#B7F54A]" : "text-[#EF4444]"}`}>
            {modelArkCatalog?.configured
              ? "ModelArk credentials are configured for server-side requests."
              : "ModelArk credentials are not configured. The catalog is visible, but hosted generation is unavailable."}
          </p>
        </section>

        {/* Global defaults */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <Globe className="h-5 w-5 text-[#A779F5]" />
            <h2 className="text-xl font-bold text-white">Global Routing Defaults</h2>
          </div>
          <p className="text-sm text-[#BEB2CC] px-1 max-w-2xl">
            Applies to any workflow that doesn't have a specific assignment explicitly configured below.
          </p>
          
          {isLoading ? (
            <Skeleton className="h-32 w-full rounded-2xl bg-[#171120] border border-[#2d2650]" />
          ) : (
            <AssignmentRow
              label="Default Checkpoint Pipeline"
              assignment={state.global}
              checkpoints={checkpoints}
              modelsLoading={modelsLoading}
              onChange={(a) => setState((prev) => ({ ...prev, global: a }))}
            />
          )}
        </div>

        {/* Per-workflow assignments */}
        <div className="space-y-4 pt-6 border-t border-[#2d2650]">
          <div className="flex items-center gap-3 px-1">
            <Layers className="h-5 w-5 text-[#B7F54A]" />
            <h2 className="text-xl font-bold text-white">Per-Workflow Overrides</h2>
          </div>
          <p className="text-sm text-[#BEB2CC] px-1 max-w-2xl">
            Specify alternative pipelines for particular workflows. Leaving an assignment empty gracefully falls back to the global routing default.
          </p>
          
          <div className="grid grid-cols-1 gap-4 mt-4">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-2xl bg-[#171120] border border-[#2d2650]" />
                ))
              : (workflows ?? []).map((wf) => (
                  <AssignmentRow
                    key={wf.id}
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
                ))}
            {workflows && workflows.length === 0 && !isLoading && (
              <div className="p-8 text-center border border-dashed border-[#2d2650] rounded-2xl bg-[#171120]/50">
                <p className="text-[#7b72a8]">No workflows discovered yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Floating Save Action */}
        <div className="sticky bottom-6 z-20 flex justify-end">
          <div className="bg-[#171120]/90 backdrop-blur-md border border-[#2d2650] p-4 rounded-2xl shadow-2xl flex items-center gap-6 max-w-lg w-full sm:w-auto mt-8">
            <p className="text-xs text-[#BEB2CC] hidden sm:block">
              Changes apply to new jobs only.<br />Running queues remain unaffected.
            </p>
            <Button
              onClick={handleSave}
              disabled={updateAssignments.isPending || isLoading}
              className="bg-[#B7F54A] text-[#09080D] hover:bg-[#a4de3a] font-bold rounded-xl px-8 h-12 w-full sm:w-auto flex-shrink-0"
            >
              {updateAssignments.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : "Save Architecture"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
