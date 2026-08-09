import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { 
  useListWorkflows, 
  useGetWorkflow, 
  useCreateJob, 
  getGetWorkflowQueryKey,
  useListSavedWorkflows,
  useCreateSavedWorkflow,
  useDeleteSavedWorkflow,
  getListSavedWorkflowsQueryKey,
  useValidateComfyNodes,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { FileUpload } from "@/components/ui/file-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Play, LayoutGrid, Code, AlertCircle, Bookmark, Trash2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import sdxlImageTemplate from "@/assets/templates/sdxl-image.workflow.json";
import animatediffTemplate from "@/assets/templates/animatediff-text-to-video.workflow.json";
import svdTemplate from "@/assets/templates/svd-image-to-video.workflow.json";
import latentsyncTemplate from "@/assets/templates/latentsync-lipsync.workflow.json";
import mimicmotionTemplate from "@/assets/templates/mimicmotion-motion.workflow.json";

const CUSTOM_WORKFLOW_ID = "custom-workflow";

export default function Generate() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const categoryFilter = searchParams.get('category');
  
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [initialCustomJson, setInitialCustomJson] = useState<string>("");
  
  const { data: workflows, isLoading: isListLoading } = useListWorkflows();
  const { data: savedWorkflows } = useListSavedWorkflows();
  const deleteSaved = useDeleteSavedWorkflow();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredWorkflows = useMemo(() => {
    if (!workflows) return [];
    if (!categoryFilter) return workflows;
    return workflows.filter(w => w.category === categoryFilter);
  }, [workflows, categoryFilter]);

  // Saved custom workflows only make sense in the unfiltered view or "custom" category
  const visibleSaved = (!categoryFilter || categoryFilter === "custom") ? (savedWorkflows ?? []) : [];

  if (selectedWorkflowId === CUSTOM_WORKFLOW_ID) {
    return <CustomWorkflowForm onBack={() => setSelectedWorkflowId(null)} initialJson={initialCustomJson} />;
  }

  if (selectedWorkflowId) {
    return <WorkflowForm 
      workflowId={selectedWorkflowId} 
      onBack={() => setSelectedWorkflowId(null)} 
    />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <LayoutGrid className="h-8 w-8 text-primary" />
          Templates
        </h1>
        <p className="text-muted-foreground mt-2">
          Select a workflow template to begin generating.
        </p>
      </div>

      {isListLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkflows.map(workflow => (
            <Card 
              key={workflow.id} 
              className="cursor-pointer hover:border-primary transition-colors hover-elevate overflow-hidden group"
              onClick={() => setSelectedWorkflowId(workflow.id)}
            >
              <div className="h-2 bg-gradient-to-r from-primary to-accent opacity-50 group-hover:opacity-100 transition-opacity" />
              <CardHeader>
                <CardTitle className="flex justify-between items-start">
                  <span>{workflow.name}</span>
                </CardTitle>
                <CardDescription className="line-clamp-2 mt-2 text-sm">{workflow.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mt-4 text-xs font-medium text-muted-foreground">
                  <span className="bg-secondary px-2 py-1 rounded capitalize">{workflow.category.replace('-', ' ')}</span>
                  {workflow.estimatedTime && (
                    <span className="flex items-center gap-1">⏱ {workflow.estimatedTime}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {visibleSaved.map(saved => (
            <Card
              key={`saved-${saved.id}`}
              className="cursor-pointer hover:border-primary transition-colors hover-elevate overflow-hidden group"
              onClick={() => {
                setInitialCustomJson(saved.json);
                setSelectedWorkflowId(CUSTOM_WORKFLOW_ID);
              }}
            >
              <div className="h-2 bg-gradient-to-r from-accent to-primary opacity-50 group-hover:opacity-100 transition-opacity" />
              <CardHeader>
                <CardTitle className="flex justify-between items-start gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <Bookmark className="h-4 w-4 shrink-0 text-primary fill-primary/30" />
                    <span className="truncate">{saved.name}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete saved workflow ${saved.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSaved.mutate({ id: saved.id }, {
                        onSuccess: () => {
                          queryClient.invalidateQueries({ queryKey: getListSavedWorkflowsQueryKey() });
                          toast({ title: `Deleted "${saved.name}"` });
                        },
                        onError: (err: any) => {
                          toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
                        },
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardTitle>
                <CardDescription className="line-clamp-2 mt-2 text-sm">
                  Your saved custom workflow — click to load and run.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mt-4 text-xs font-medium text-muted-foreground">
                  <span className="bg-secondary px-2 py-1 rounded">saved</span>
                  <span>{new Date(saved.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {filteredWorkflows.length === 0 && !isListLoading && (
         <div className="text-center p-12 border border-dashed rounded-xl text-muted-foreground">
           No workflows found for this category.
         </div>
      )}
    </div>
  );
}

const WORKFLOW_TEMPLATES: { id: string; label: string; description: string; json: Record<string, unknown> }[] = [
  { id: "sdxl-image", label: "SDXL Image", description: "Text-to-image (SDXL base, core nodes only)", json: sdxlImageTemplate },
  { id: "animatediff", label: "AnimateDiff Video", description: "Text-to-video (SD1.5 + AnimateDiff)", json: animatediffTemplate },
  { id: "svd", label: "SVD Image-to-Video", description: "Animate a still image (SVD XT)", json: svdTemplate },
  { id: "latentsync", label: "LatentSync Lip Sync", description: "Sync a video's mouth to audio", json: latentsyncTemplate },
  { id: "mimicmotion", label: "MimicMotion", description: "Drive an image with a motion video", json: mimicmotionTemplate },
];

function CustomWorkflowForm({ onBack, initialJson = "" }: { onBack: () => void; initialJson?: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createJob = useCreateJob();
  const createSaved = useCreateSavedWorkflow();
  const queryClient = useQueryClient();
  const [workflowJson, setWorkflowJson] = useState(initialJson);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");

  // Debounced missing-node check (informational, never blocks Run)
  const validateNodes = useValidateComfyNodes();
  const [nodeCheck, setNodeCheck] = useState<{ reachable: boolean; missingNodes: string[] } | null>(null);
  const checkSeq = useRef(0);
  useEffect(() => {
    setNodeCheck(null);
    // Invalidate any in-flight check on EVERY edit, so a stale response
    // can never resurface a warning for content that changed since.
    const seq = ++checkSeq.current;
    const value = workflowJson.trim();
    if (!value) return;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return;
    } catch {
      return; // not valid JSON yet — validateJson handles messaging
    }
    const t = setTimeout(() => {
      validateNodes.mutate(
        { data: { json: value } },
        {
          onSuccess: (result) => {
            if (seq === checkSeq.current) {
              setNodeCheck({ reachable: result.reachable, missingNodes: result.missingNodes });
            }
          },
          // Silently ignore errors — this check is best-effort.
        }
      );
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowJson]);

  const onSave = () => {
    if (!validateJson(workflowJson)) return;
    if (!saveName.trim()) {
      toast({ title: "Give your workflow a name first", variant: "destructive" });
      return;
    }
    createSaved.mutate(
      { data: { name: saveName.trim(), json: workflowJson } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSavedWorkflowsQueryKey() });
          toast({ title: `Saved "${saveName.trim()}"`, description: "It now appears in your template grid." });
          setSaveName("");
        },
        onError: (err: any) => {
          toast({ title: "Failed to save workflow", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const validateJson = (value: string): boolean => {
    if (!value.trim()) {
      setJsonError("Workflow JSON is required.");
      return false;
    }
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setJsonError("Workflow JSON must be an object (the ComfyUI API-format prompt graph).");
        return false;
      }
      setJsonError(null);
      return true;
    } catch (err: any) {
      setJsonError(`Invalid JSON: ${err.message}`);
      return false;
    }
  };

  const handleChange = (value: string) => {
    setWorkflowJson(value);
    if (jsonError) validateJson(value);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateJson(workflowJson)) return;

    createJob.mutate(
      { data: { workflowId: CUSTOM_WORKFLOW_ID, params: { workflow_json: workflowJson } } },
      {
        onSuccess: () => {
          toast({ title: "Job created successfully!" });
          setLocation("/jobs");
        },
        onError: (err: any) => {
          toast({ title: "Failed to create job", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="animate-in slide-in-from-right-8 duration-300">
      <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <Card className="border-border">
          <CardHeader className="bg-secondary/30 border-b">
            <CardTitle className="text-2xl flex items-center gap-2">
              <Code className="h-6 w-6 text-primary" />
              Custom Workflow
            </CardTitle>
            <CardDescription>
              Paste your ComfyUI API-format workflow JSON and run it directly on your server.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Alert className="mb-6 border-primary/30 bg-primary/5">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                Export your workflow from ComfyUI using <strong>Save (API format)</strong> in the settings menu, then paste the resulting JSON below. The workflow is submitted unchanged to your ComfyUI server.
              </AlertDescription>
            </Alert>

            <div className="mb-6 space-y-2">
              <Label className="text-base">Start from a template</Label>
              <div className="flex flex-wrap gap-2">
                {WORKFLOW_TEMPLATES.map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    title={t.description}
                    onClick={() => {
                      setWorkflowJson(JSON.stringify(t.json, null, 2));
                      setJsonError(null);
                    }}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Templates reference specific models and custom nodes — edit prompts, filenames, and inputs to match what's installed on your server.
              </p>
            </div>

            <form id="custom-workflow-form" onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base">
                  Workflow JSON <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={workflowJson}
                  onChange={(e) => handleChange(e.target.value)}
                  placeholder={'{\n  "1": {\n    "class_type": "KSampler",\n    "inputs": { ... }\n  }\n}'}
                  className={`font-mono text-xs min-h-[400px] resize-y ${jsonError ? "border-destructive" : ""}`}
                  spellCheck={false}
                />
                {jsonError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {jsonError}
                  </p>
                )}
                {!jsonError && nodeCheck && nodeCheck.missingNodes.length > 0 && (
                  <Alert className="border-yellow-500/40 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-sm">
                      <strong>Missing nodes:</strong> {nodeCheck.missingNodes.join(", ")}
                      <span className="block mt-1 text-xs text-muted-foreground">
                        These node types aren't installed on your ComfyUI server. The job will likely fail
                        unless you install the matching node packs (or the node exists under another name).
                        You can still run it.
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
                {!jsonError && nodeCheck && !nodeCheck.reachable && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Couldn't check nodes — ComfyUI server is unreachable right now.
                  </p>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Ready?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="submit"
                form="custom-workflow-form"
                size="lg"
                className="w-full text-base py-6 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all"
                disabled={createJob.isPending}
              >
                {createJob.isPending ? "Starting Job..." : (
                  <>
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Run Workflow
                  </>
                )}
              </Button>
              <div className="text-xs text-muted-foreground text-center">
                This job will be added to your queue.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-primary" />
                Save for later
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Workflow name"
                maxLength={100}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={onSave}
                disabled={createSaved.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {createSaved.isPending ? "Saving..." : "Save as…"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Saved workflows appear in the template grid so you can rerun them without re-pasting.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function WorkflowForm({ workflowId, onBack }: { workflowId: string, onBack: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: workflow, isLoading } = useGetWorkflow(workflowId, {
    query: {
      enabled: !!workflowId,
      queryKey: getGetWorkflowQueryKey(workflowId)
    }
  });

  const createJob = useCreateJob();
  const [formData, setFormData] = useState<Record<string, any>>({});

  const handleParamChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflow) return;

    // Validate required fields
    for (const param of workflow.params) {
      if (param.required && formData[param.key] === undefined && param.defaultValue === undefined) {
        toast({ title: `Missing required field: ${param.label}`, variant: "destructive" });
        return;
      }
    }

    // Merge defaults
    const finalParams = { ...formData };
    for (const param of workflow.params) {
      if (finalParams[param.key] === undefined && param.defaultValue !== undefined) {
        finalParams[param.key] = param.defaultValue;
      }
    }

    createJob.mutate({
      data: {
        workflowId: workflow.id,
        params: finalParams
      }
    }, {
      onSuccess: (job) => {
        toast({ title: "Job created successfully!" });
        setLocation("/jobs");
      },
      onError: (err: any) => {
        toast({ title: "Failed to create job", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading || !workflow) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-[400px] w-full max-w-2xl rounded-xl" />
      </div>
    );
  }

  return (
    <div className="animate-in slide-in-from-right-8 duration-300">
      <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <Card className="border-border">
          <CardHeader className="bg-secondary/30 border-b">
            <CardTitle className="text-2xl">{workflow.name}</CardTitle>
            <CardDescription>{workflow.description}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form id="workflow-form" onSubmit={onSubmit} className="space-y-6">
              {workflow.params.map(param => {
                const value = formData[param.key] !== undefined ? formData[param.key] : (param.defaultValue || "");
                
                return (
                  <div key={param.key} className="space-y-2">
                    <Label className="flex items-center justify-between text-base">
                      <span>{param.label} {param.required && <span className="text-destructive">*</span>}</span>
                    </Label>
                    {param.description && <p className="text-sm text-muted-foreground">{param.description}</p>}
                    
                    {param.type === 'text' && (
                      param.max && param.max > 100 ? (
                        <Textarea 
                          value={value}
                          onChange={(e) => handleParamChange(param.key, e.target.value)}
                          placeholder={param.defaultValue?.toString() || ""}
                          className="font-mono text-sm h-32"
                        />
                      ) : (
                        <Input 
                          type="text" 
                          value={value}
                          onChange={(e) => handleParamChange(param.key, e.target.value)}
                          placeholder={param.defaultValue?.toString() || ""}
                        />
                      )
                    )}

                    {param.type === 'number' && (
                      <Input 
                        type="number" 
                        value={value}
                        onChange={(e) => handleParamChange(param.key, Number(e.target.value))}
                        min={param.min || undefined}
                        max={param.max || undefined}
                      />
                    )}

                    {param.type === 'slider' && (
                      <div className="pt-4 pb-2">
                        <Slider 
                          value={[Number(value) || 0]} 
                          min={param.min || 0} 
                          max={param.max || 100}
                          step={1}
                          onValueChange={(v) => handleParamChange(param.key, v[0])}
                        />
                        <div className="mt-2 text-right text-sm text-primary font-mono font-medium">
                          {value}
                        </div>
                      </div>
                    )}

                    {param.type === 'select' && (
                      <Select value={value} onValueChange={(v) => handleParamChange(param.key, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          {param.options?.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {param.type === 'file' && (
                      <FileUpload 
                        accept={param.accept || undefined}
                        onFileSelect={(filename) => handleParamChange(param.key, filename)}
                      />
                    )}
                  </div>
                );
              })}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Ready?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                type="submit" 
                form="workflow-form"
                size="lg" 
                className="w-full text-base py-6 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all"
                disabled={createJob.isPending}
              >
                {createJob.isPending ? "Starting Job..." : (
                  <>
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Generate
                  </>
                )}
              </Button>
              <div className="text-xs text-muted-foreground text-center">
                This job will be added to your queue.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
