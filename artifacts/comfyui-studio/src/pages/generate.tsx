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
import { ArrowLeft, Play, LayoutGrid, Code, AlertCircle, Bookmark, Trash2, Save, History, BookOpen, Plus, Loader2, CheckCircle2, Sparkles, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/components/ui/file-upload";
import sdxlImageTemplate from "@/assets/templates/sdxl-image.workflow.json";
import animatediffTemplate from "@/assets/templates/animatediff-text-to-video.workflow.json";
import svdTemplate from "@/assets/templates/svd-image-to-video.workflow.json";
import latentsyncTemplate from "@/assets/templates/latentsync-lipsync.workflow.json";
import mimicmotionTemplate from "@/assets/templates/mimicmotion-motion.workflow.json";
import { WorkflowVisualizer } from "@/components/workflow-visualizer";

// Image Assets
import sdxlThumbnail from "@/assets/thumbnails/sdxl-image.jpg";
import animatediffThumbnail from "@/assets/thumbnails/animatediff.jpg";
import svdThumbnail from "@/assets/thumbnails/svd.jpg";
import latentsyncThumbnail from "@/assets/thumbnails/latentsync.jpg";
import mimicmotionThumbnail from "@/assets/thumbnails/mimicmotion.jpg";

const CUSTOM_WORKFLOW_ID = "custom-workflow";
const MOTION_WORKFLOW_ID = "motion-control-animatediff";

const LIME = "#c8f135";

const MOTION_PRESETS = [
  { id: "zoom-in",   label: "Zoom In",    icon: "🔍", description: "Slow push toward the subject" },
  { id: "zoom-out",  label: "Zoom Out",   icon: "🔭", description: "Pull back to reveal the scene" },
  { id: "pan-left",  label: "Pan Left",   icon: "⬅",  description: "Slide the camera left" },
  { id: "pan-right", label: "Pan Right",  icon: "➡",  description: "Slide the camera right" },
  { id: "tilt-up",   label: "Tilt Up",    icon: "⬆",  description: "Lift the camera upward" },
  { id: "tilt-down", label: "Tilt Down",  icon: "⬇",  description: "Dip the camera downward" },
  { id: "rotate",    label: "Rotate",     icon: "↻",  description: "Spin around the subject" },
];

export default function Generate() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const categoryFilter = searchParams.get('category');
  
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [initialCustomJson, setInitialCustomJson] = useState<string>("");
  
  useEffect(() => {
    const assistantWorkflow = sessionStorage.getItem("assistant-workflow");
    if (assistantWorkflow) {
      sessionStorage.removeItem("assistant-workflow");
      setInitialCustomJson(assistantWorkflow);
      setSelectedWorkflowId(CUSTOM_WORKFLOW_ID);
    }
  }, []);
  
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

  if (selectedWorkflowId === MOTION_WORKFLOW_ID) {
    return <MotionControlForm onBack={() => setSelectedWorkflowId(null)} />;
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
        <h1 className="text-2xl font-semibold flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-[#ff9500]" />
          Templates
        </h1>
        <p className="text-[#888888] mt-2 text-sm">
          Select a workflow template to begin generating.
        </p>
      </div>

      {isListLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40 rounded-[2px]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkflows.map(workflow => (
            <div 
              key={workflow.id} 
              className="bg-[#242424] border border-[#3a3a3a] cursor-pointer hover:bg-[#2d2d2d] transition-colors overflow-hidden group relative flex flex-col hover:border-[#ff9500]"
              onClick={() => setSelectedWorkflowId(workflow.id)}
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-[#ff9500] opacity-60 group-hover:opacity-100 transition-opacity z-10" />
              <div className="p-4 flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-base">{workflow.name}</h3>
                </div>
                <p className="text-xs text-[#888888] line-clamp-2">{workflow.description}</p>
              </div>
              {DB_WORKFLOW_THUMBNAILS[workflow.id] && (
                <div className="px-4 pb-2">
                  <img src={DB_WORKFLOW_THUMBNAILS[workflow.id]} alt={workflow.name} className="w-full h-32 object-cover rounded-[2px] opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
              <div className="p-4 pt-0">
                <div className="flex items-center gap-2 mt-4 text-xs font-mono text-[#555555]">
                  <span className="uppercase tracking-wider">{workflow.category.replace('-', ' ')}</span>
                  {workflow.estimatedTime && (
                    <span className="flex items-center gap-1">⏱ {workflow.estimatedTime}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {visibleSaved.map(saved => (
            <div
              key={`saved-${saved.id}`}
              className="bg-[#242424] border border-[#3a3a3a] cursor-pointer hover:bg-[#2d2d2d] transition-colors overflow-hidden group relative flex flex-col hover:border-[#ff9500]"
              onClick={() => {
                setInitialCustomJson(saved.json);
                setSelectedWorkflowId(CUSTOM_WORKFLOW_ID);
              }}
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-[#ff9500] opacity-60 group-hover:opacity-100 transition-opacity z-10" />
              <div className="p-4 flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-base flex items-center gap-2 min-w-0">
                    <Bookmark className="h-4 w-4 shrink-0 text-[#ff9500]" />
                    <span className="truncate">{saved.name}</span>
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-[#888888] hover:text-[#dd4444]"
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
                </div>
                <p className="text-xs text-[#888888] line-clamp-2">
                  Your saved custom workflow — click to load and run.
                </p>
              </div>
              <div className="p-4 pt-0">
                <div className="flex items-center gap-2 mt-4 text-xs font-mono text-[#555555]">
                  <span className="uppercase tracking-wider">SAVED</span>
                  <span>{new Date(saved.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {filteredWorkflows.length === 0 && !isListLoading && (
         <div className="text-center p-12 border border-dashed border-[#3a3a3a] rounded-[2px] text-[#555555]">
           No workflows found for this category.
         </div>
      )}
    </div>
  );
}

const DB_WORKFLOW_THUMBNAILS: Record<string, string> = {
  "lip-sync-basic": latentsyncThumbnail,
  "motion-control-animatediff": mimicmotionThumbnail,
  "video-generation-txt2vid": animatediffThumbnail,
  "img2vid-stable-video": svdThumbnail,
  "custom-workflow": sdxlThumbnail,
};

const WORKFLOW_TEMPLATES: { id: string; label: string; description: string; json: Record<string, unknown>, image?: string }[] = [
  { id: "sdxl-image", label: "SDXL Image", description: "Text-to-image (SDXL base, core nodes only). Edit the prompt text.", json: sdxlImageTemplate, image: sdxlThumbnail },
  { id: "animatediff", label: "AnimateDiff Video", description: "Text-to-video (SD1.5 + AnimateDiff, fits a free T4). Edit the prompt text.", json: animatediffTemplate, image: animatediffThumbnail },
  { id: "svd", label: "SVD Image-to-Video", description: "Animate a still image (SVD XT, needs ~24 GB GPU). Paste your image URL or uploaded filename where marked.", json: svdTemplate, image: svdThumbnail },
  { id: "latentsync", label: "LatentSync Lip Sync", description: "Sync a video's mouth to audio. Upload your video & audio on this page first, then replace the REPLACE_WITH_… filenames.", json: latentsyncTemplate, image: latentsyncThumbnail },
  { id: "mimicmotion", label: "MimicMotion", description: "Drive an image with a motion video (needs ~24 GB GPU). Upload image & pose video first, then replace the REPLACE_WITH_… filenames.", json: mimicmotionTemplate, image: mimicmotionThumbnail },
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
  const [viewMode, setViewMode] = useState<"json" | "diagram">("json");
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
      <Button variant="ghost" className="mb-6 -ml-4 text-[#888888] hover:text-white rounded-[2px]" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <div className="bg-[#242424] border border-[#3a3a3a] rounded-[2px]">
          <div className="p-6 border-b border-[#3a3a3a]">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Code className="h-5 w-5 text-[#ff9500]" />
              Custom Workflow
            </h2>
            <p className="text-[#888888] text-sm mt-1">
              Paste your ComfyUI API-format workflow JSON and run it directly on your server.
            </p>
          </div>
          <div className="p-6">
            <Alert className="mb-6 border-[#3a3a3a] bg-[#1a1a1a] rounded-[2px]">
              <AlertCircle className="h-4 w-4 text-[#ff9500]" />
              <AlertDescription className="text-sm">
                Export your workflow from ComfyUI using <strong>Save (API format)</strong> in the settings menu, then paste the resulting JSON below. The workflow is submitted unchanged to your ComfyUI server.
              </AlertDescription>
            </Alert>

            <div className="mb-6 space-y-2">
              <Label className="text-sm font-medium">Start from a template</Label>
              <div className="flex flex-wrap gap-2">
                {WORKFLOW_TEMPLATES.map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-[#1a1a1a] border-[#3a3a3a] hover:bg-[#2d2d2d] rounded-[2px]"
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
              <p className="text-xs text-[#555555] font-mono">
                Templates reference specific models and custom nodes — edit prompts, filenames, and inputs to match what's installed on your server.
              </p>
            </div>

            <form id="custom-workflow-form" onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Workflow JSON <span className="text-[#dd4444]">*</span>
                  </Label>
                  <div className="flex items-center gap-1 bg-[#1a1a1a] p-1 rounded-[2px] border border-[#3a3a3a]">
                    <button
                      type="button"
                      onClick={() => setViewMode("json")}
                      className={`px-3 py-1 text-xs rounded-sm transition-colors ${viewMode === "json" ? "bg-[#2d2d2d] text-white" : "text-[#888888] hover:text-white"}`}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("diagram")}
                      className={`px-3 py-1 text-xs rounded-sm transition-colors ${viewMode === "diagram" ? "bg-[#2d2d2d] text-white" : "text-[#888888] hover:text-white"}`}
                    >
                      Diagram
                    </button>
                  </div>
                </div>
                {viewMode === "json" ? (
                  <Textarea
                    value={workflowJson}
                    onChange={(e) => handleChange(e.target.value)}
                    placeholder={'{\n  "1": {\n    "class_type": "KSampler",\n    "inputs": { ... }\n  }\n}'}
                    className={`font-mono text-xs min-h-[400px] resize-y rounded-[2px] bg-[#1a1a1a] border-[#3a3a3a] ${jsonError ? "border-[#dd4444]" : ""}`}
                    spellCheck={false}
                  />
                ) : (
                  <div className="min-h-[400px] h-[500px] border border-[#3a3a3a] rounded-[2px] bg-[#1a1a1a]">
                    <WorkflowVisualizer jsonString={workflowJson} />
                  </div>
                )}
                {jsonError && (
                  <p className="text-sm text-[#dd4444] flex items-center gap-1 font-mono">
                    <AlertCircle className="h-3 w-3" />
                    {jsonError}
                  </p>
                )}
                {!jsonError && nodeCheck && nodeCheck.missingNodes.length > 0 && (
                  <Alert className="border-yellow-500/40 bg-yellow-500/10 rounded-[2px]">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-sm">
                      <strong>Missing nodes:</strong> {nodeCheck.missingNodes.join(", ")}
                      <span className="block mt-1 text-xs text-[#888888]">
                        These node types aren't installed on your ComfyUI server. The job will likely fail
                        unless you install the matching node packs (or the node exists under another name).
                        You can still run it.
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
                {!jsonError && nodeCheck && !nodeCheck.reachable && (
                  <p className="text-xs text-[#888888] flex items-center gap-1 font-mono">
                    <AlertCircle className="h-3 w-3" />
                    Couldn't check nodes — ComfyUI server is unreachable right now.
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#242424] border border-[#3a3a3a] rounded-[2px] p-4 sticky top-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-widest text-[#e0e0e0]">Ready?</h3>
            <div className="space-y-4">
              <Button
                type="submit"
                form="custom-workflow-form"
                size="lg"
                className="w-full text-sm font-medium py-6 rounded-[2px] bg-[#ff9500] text-black hover:bg-[#ff8000]"
                disabled={createJob.isPending}
              >
                {createJob.isPending ? "Starting Job..." : (
                  <>
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    Run Workflow
                  </>
                )}
              </Button>
              <div className="text-xs text-[#888888] text-center font-mono">
                This job will be added to your queue.
              </div>
            </div>
          </div>

          <div className="bg-[#242424] border border-[#3a3a3a] rounded-[2px] p-4">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-widest text-[#e0e0e0] flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-[#ff9500]" />
              Save for later
            </h3>
            <div className="space-y-3">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Workflow name"
                maxLength={100}
                className="bg-[#1a1a1a] border-[#3a3a3a] rounded-[2px]"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full bg-transparent border-[#3a3a3a] hover:bg-[#2d2d2d] rounded-[2px]"
                onClick={onSave}
                disabled={createSaved.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {createSaved.isPending ? "Saving..." : "Save as…"}
              </Button>
              <p className="text-xs text-[#555555] font-mono">
                Saved workflows appear in the template grid so you can rerun them without re-pasting.
              </p>
            </div>
          </div>
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

// ─── Motion Control ───────────────────────────────────────────────────────────

function MotionUploadSlot({
  label, hint, accept, onUploaded, uploaded,
}: {
  label: string; hint: string; accept: string;
  onUploaded: (filename: string) => void; uploaded: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const name = await uploadFile(file, (p) => setProgress(p), accept);
      onUploaded(name);
      toast({ title: "Uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="aspect-video bg-black/50 rounded-lg flex flex-col items-center justify-center gap-2 border border-dashed border-white/20 cursor-pointer hover:border-white/40 transition-colors relative overflow-hidden"
      onClick={() => fileRef.current?.click()}
    >
      <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
      {uploading ? (
        <>
          <Loader2 className="h-5 w-5 text-white/50 animate-spin" />
          <span className="text-xs text-white/40">{progress}%</span>
          <div className="absolute bottom-0 left-0 h-0.5 transition-all" style={{ width: `${progress}%`, background: LIME }} />
        </>
      ) : uploaded ? (
        <CheckCircle2 className="h-7 w-7" style={{ color: LIME }} />
      ) : (
        <Plus className="h-7 w-7 text-white/25" />
      )}
      <div className="mt-1 text-center px-2">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{hint}</p>
      </div>
    </div>
  );
}

function MotionControlForm({ onBack }: { onBack: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createJob = useCreateJob();

  const [activeTab, setActiveTab] = useState<"library" | "history">("library");
  const [sourceImage, setSourceImage] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("zoom-in");
  const [motionStrength, setMotionStrength] = useState(50);
  const [numFrames, setNumFrames] = useState(16);
  const [prompt, setPrompt] = useState("");

  const handleGenerate = () => {
    if (!sourceImage) {
      toast({ title: "Upload your character image first", variant: "destructive" });
      return;
    }
    createJob.mutate(
      {
        data: {
          workflowId: MOTION_WORKFLOW_ID,
          params: { source_image: sourceImage, motion_preset: selectedPreset, motion_strength: motionStrength, num_frames: numFrames, prompt },
        },
      },
      {
        onSuccess: () => { toast({ title: "Motion job started!" }); setLocation("/jobs"); },
        onError: (err: any) => { toast({ title: "Failed to start job", description: err.message, variant: "destructive" }); },
      }
    );
  };

  return (
    <div
      className="animate-in slide-in-from-right-8 duration-300 -mx-6 -mt-6 flex flex-col"
      style={{ minHeight: "calc(100vh - 56px)", background: "#0f0f10" }}
    >
      {/* Back */}
      <div className="px-6 pt-4 flex-shrink-0">
        <Button variant="ghost" className="text-white/50 hover:text-white -ml-2" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Templates
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar ── */}
        <div
          className="w-72 flex-shrink-0 flex flex-col p-4 gap-3 overflow-y-auto"
          style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}
        >
          {/* Tabs */}
          <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
            {(["history", "library"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === tab ? "text-white" : "text-white/40 hover:text-white/70"
                }`}
                style={activeTab === tab ? { background: "rgba(255,255,255,0.1)" } : {}}
              >
                {tab === "history" ? <History className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
                {tab === "history" ? "History" : "Motion Library"}
              </button>
            ))}
          </div>

          {/* Motion-to-copy shortcut card */}
          <div
            onClick={() => setActiveTab("library")}
            className="rounded-xl p-3 cursor-pointer transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
          >
            <div
              className="aspect-video bg-black/50 rounded-lg mb-2 flex flex-col items-center justify-center gap-1"
              style={{ border: "1px dashed rgba(255,255,255,0.15)" }}
            >
              <Video className="h-5 w-5 text-white/25" />
              <span className="text-xs font-bold" style={{ color: LIME }}>
                {MOTION_PRESETS.find((p) => p.id === selectedPreset)?.label ?? "Pick a style"}
              </span>
            </div>
            <p className="text-sm font-semibold text-white">Add motion to copy</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Video duration: 3–30 seconds
            </p>
          </div>

          {/* Character upload */}
          <div
            className="rounded-xl p-3"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
          >
            <MotionUploadSlot
              label="Add your character"
              hint="Image with visible face and body"
              accept="image/*"
              onUploaded={setSourceImage}
              uploaded={!!sourceImage}
            />
          </div>

          {/* Sliders */}
          <div
            className="rounded-xl px-4 py-3 space-y-4"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
          >
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Motion Strength</span>
                <span className="text-xs font-mono text-white">{motionStrength}</span>
              </div>
              <Slider value={[motionStrength]} min={0} max={100} step={1} onValueChange={(v) => setMotionStrength(v[0])} />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Frames</span>
                <span className="text-xs font-mono text-white">{numFrames}</span>
              </div>
              <Slider value={[numFrames]} min={8} max={64} step={8} onValueChange={(v) => setNumFrames(v[0])} />
            </div>
          </div>

          {/* Optional prompt */}
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Optional: describe the motion in words…"
            className="text-sm resize-none min-h-[60px] text-white placeholder:text-white/30"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={createJob.isPending}
            className="w-full py-4 rounded-xl font-black text-sm text-black flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: LIME }}
          >
            {createJob.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate
              </>
            )}
          </button>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {activeTab === "library" ? (
            <>
              {/* Hero */}
              <div className="flex items-start justify-between gap-6 mb-8">
                <div className="flex-1 min-w-0">
                  <h1
                    className="font-black leading-[1.05] tracking-tight text-white uppercase"
                    style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)" }}
                  >
                    RECREATE ANY{" "}
                    <span style={{ color: LIME }}>[MOTION]</span>
                    <br />WITH YOUR IMAGE
                  </h1>
                  <p className="mt-4 text-base leading-relaxed max-w-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Copy motion from any video and place your character into the same movement.
                  </p>
                </div>

                {/* Fan of sample photos */}
                <div className="relative flex-shrink-0 hidden lg:block" style={{ width: "11rem", height: "9rem" }}>
                  <img src={mimicmotionThumbnail} alt="" className="absolute rounded-xl object-cover shadow-xl"
                    style={{ right: 0, top: 0, width: "6rem", height: "8rem", border: "2px solid rgba(255,255,255,0.12)", transform: "rotate(4deg)" }} />
                  <img src={animatediffThumbnail} alt="" className="absolute rounded-xl object-cover shadow-xl"
                    style={{ right: "4.5rem", top: "0.5rem", width: "5.5rem", height: "7rem", border: "2px solid rgba(255,255,255,0.12)", transform: "rotate(-5deg)", opacity: 0.85 }} />
                  <img src={svdThumbnail} alt="" className="absolute rounded-xl object-cover shadow-lg"
                    style={{ right: "8rem", top: "1rem", width: "5rem", height: "6.5rem", border: "2px solid rgba(255,255,255,0.10)", transform: "rotate(1deg)", opacity: 0.7 }} />
                </div>
              </div>

              {/* Library grid */}
              <p className="text-sm mb-3 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>
                Start by copying motion from library
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {MOTION_PRESETS.map((preset) => {
                  const active = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id)}
                      className="group rounded-xl text-left transition-all p-3"
                      style={{
                        background: active ? "rgba(200,241,53,0.08)" : "rgba(255,255,255,0.04)",
                        border: active ? `1.5px solid rgba(200,241,53,0.5)` : "1.5px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        className="w-full aspect-video rounded-lg mb-3 flex items-center justify-center text-3xl"
                        style={{ background: active ? "rgba(200,241,53,0.1)" : "rgba(0,0,0,0.35)" }}
                      >
                        {preset.icon}
                      </div>
                      <p className="text-sm font-semibold" style={{ color: active ? LIME : "white" }}>
                        {preset.label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3" style={{ color: "rgba(255,255,255,0.2)" }}>
              <History className="h-12 w-12" />
              <p className="text-sm">No generation history yet.</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.12)" }}>
                Run a motion job and it will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
