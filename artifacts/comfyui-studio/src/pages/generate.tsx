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
import { 
  ArrowLeft, Play, LayoutGrid, Code, AlertCircle, Bookmark, Trash2, Save, 
  History, BookOpen, Plus, Loader2, CheckCircle2, Sparkles, Video, Search, 
  X, Download, Info, ZoomIn, Minimize, ArrowRight as ArrowRightIcon, 
  ArrowUp, ArrowDown, RotateCw, Timer
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/components/ui/file-upload";
import sdxlImageTemplate from "@/assets/templates/sdxl-image.workflow.json";
import animatediffTemplate from "@/assets/templates/animatediff-text-to-video.workflow.json";
import svdTemplate from "@/assets/templates/svd-image-to-video.workflow.json";
import latentsyncTemplate from "@/assets/templates/latentsync-lipsync.workflow.json";
import mimicmotionTemplate from "@/assets/templates/mimicmotion-motion.workflow.json";
import filmGradeTemplate from "@/assets/templates/film-grain-color-grade.workflow.json";
import cinematicPortraitTemplate from "@/assets/templates/cinematic-portrait.workflow.json";
import slowmoUpscaleTemplate from "@/assets/templates/slow-motion-upscale.workflow.json";
import epicLandscapeTemplate from "@/assets/templates/epic-landscape.workflow.json";
import reelLoopTemplate from "@/assets/templates/instagram-reel-loop.workflow.json";
import productSwapTemplate from "@/assets/templates/product-background-swap.workflow.json";
import talkingAvatarTemplate from "@/assets/templates/talking-avatar.workflow.json";
import blogHeroTemplate from "@/assets/templates/blog-hero-image.workflow.json";
import { WorkflowVisualizer } from "@/components/workflow-visualizer";
import { PageHeader } from "@/components/creation-design/page-header";

// Image Assets
import sdxlThumbnail from "@/assets/thumbnails/sdxl-image.jpg";
import animatediffThumbnail from "@/assets/thumbnails/animatediff.jpg";
import svdThumbnail from "@/assets/thumbnails/svd.jpg";
import latentsyncThumbnail from "@/assets/thumbnails/latentsync.jpg";
import mimicmotionThumbnail from "@/assets/thumbnails/mimicmotion.jpg";
import filmGradeThumbnail from "@/assets/thumbnails/film-grade.jpg";
import cinematicPortraitThumbnail from "@/assets/thumbnails/cinematic-portrait.jpg";
import slowmoUpscaleThumbnail from "@/assets/thumbnails/slowmo-upscale.jpg";
import epicLandscapeThumbnail from "@/assets/thumbnails/epic-landscape.jpg";
import reelLoopThumbnail from "@/assets/thumbnails/reel-loop.jpg";
import productSwapThumbnail from "@/assets/thumbnails/product-swap.jpg";
import talkingAvatarThumbnail from "@/assets/thumbnails/talking-avatar.jpg";
import blogHeroThumbnail from "@/assets/thumbnails/blog-hero.jpg";

const seedanceReferenceThumbnail = "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic2.jpg";

const CUSTOM_WORKFLOW_ID = "custom-workflow";
const UPLOAD_STORAGE_PREFIX = "comfyui-upload:";
const MOTION_WORKFLOW_ID = "motion-control-animatediff";

const PALETTE = {
  black: "#09080D",
  plum: "#171120",
  purple: "#A779F5",
  green: "#B7F54A",
  lavender: "#BEB2CC",
  red: "#EF4444"
};

const WORKFLOW_GUIDANCE: Record<string, { bestFor: string; output: string }> = {
  "modelark-seedance-reference-video": {
    bestFor: "Build a reference-led commercial, music clip, or product story with controlled opening and closing frames plus synchronized motion and audio.",
    output: "Hosted Seedance video with generated audio",
  },
  "perform-anywhere-angles": {
    bestFor: "Build a consistent five-angle reference set before choosing the strongest still for motion.",
    output: "Five generated cinematic stills",
  },
  "perform-anywhere-seedance": {
    bestFor: "Transfer movement from a phone performance recording onto a selected generated still through hosted ModelArk Seedance.",
    output: "Hosted Seedance motion video",
  },
  "perform-anywhere-motion": {
    bestFor: "Transfer a phone performance recording onto a selected still using your connected ComfyUI GPU.",
    output: "Local MimicMotion video",
  },
  "motion-control-animatediff": {
    bestFor: "Create a controlled camera move from a single still without a performance recording.",
    output: "Local AnimateDiff video",
  },
};

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const MOTION_PRESETS = [
  { id: "zoom-in",   label: "Zoom In",    icon: ZoomIn, description: "Slow push toward the subject" },
  { id: "zoom-out",  label: "Zoom Out",   icon: Minimize, description: "Pull back to reveal the scene" },
  { id: "pan-left",  label: "Pan Left",   icon: ArrowLeft,  description: "Slide the camera left" },
  { id: "pan-right", label: "Pan Right",  icon: ArrowRightIcon,  description: "Slide the camera right" },
  { id: "tilt-up",   label: "Tilt Up",    icon: ArrowUp,  description: "Lift the camera upward" },
  { id: "tilt-down", label: "Tilt Down",  icon: ArrowDown,  description: "Dip the camera downward" },
  { id: "rotate",    label: "Rotate",     icon: RotateCw,  description: "Spin around the subject" },
];

function GenerateHeroVisual() {
  const showcase = [
    cinematicPortraitThumbnail, filmGradeThumbnail, epicLandscapeThumbnail, reelLoopThumbnail, talkingAvatarThumbnail
  ];
  return (
    <div className="relative h-[300px] w-full bg-[#171120] overflow-hidden flex">
      {showcase.map((src, i) => (
        <div key={i} className="flex-1 relative h-full group border-r border-[#A779F5]/20 last:border-0">
          <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale-[40%] group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09080D] via-[#09080D]/40 to-transparent opacity-80" />
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-[#09080D] via-transparent to-[#09080D] pointer-events-none opacity-50" />
    </div>
  );
}

export default function Generate() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const categoryFilter = searchParams.get('category');
  
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [initialCustomJson, setInitialCustomJson] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
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
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return workflows.filter(w => {
      const matchesCategory = !categoryFilter || w.category === categoryFilter;
      const matchesSearch = !normalizedQuery
        || w.name.toLowerCase().includes(normalizedQuery)
        || w.description.toLowerCase().includes(normalizedQuery)
        || w.category.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesSearch;
    });
  }, [workflows, categoryFilter, searchQuery]);

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
    <div className="min-h-screen bg-[#09080D] text-white space-y-8 animate-in fade-in duration-500 pb-20 px-6 sm:px-12 pt-8">
      <PageHeader 
        title={filteredWorkflows.length > 0 ? `${filteredWorkflows.length} Workflows` : "Workflows"}
        description="Select a template to begin generating. High-fidelity cinematic tools for your creative pipeline."
        eyebrow="Templates"
        visual={<GenerateHeroVisual />}
      />

      <div className="relative z-10 max-w-xl">
        <label htmlFor="workflow-search" className="sr-only">Search workflows</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#BEB2CC]" />
          <Input
            id="workflow-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search workflows, formats, or capabilities…"
            className="h-12 rounded-2xl border-[#A779F5]/30 bg-[#171120] pl-11 pr-11 text-sm text-white placeholder:text-[#BEB2CC]/50 focus-visible:ring-[#B7F54A]/50 focus-visible:border-[#B7F54A]"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear workflow search"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#BEB2CC] transition-colors hover:bg-[#A779F5]/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 relative z-10">
        {[
          { value: null,                   label: "All" },
          { value: "image-generation",     label: "Image Generation" },
          { value: "video-generation",     label: "Video Generation" },
          { value: "lip-sync",             label: "Lip Sync" },
          { value: "motion-control",       label: "Motion Control" },
          { value: "seedance-style",       label: "Seedance-style" },
          { value: "perform-anywhere",     label: "Perform Anywhere" },
          { value: "cinematic",            label: "Cinematic" },
          { value: "content-creation",     label: "Content Creation" },
        ].map(({ value, label }) => {
          const active = categoryFilter === value;
          return (
            <button
              key={label}
              onClick={() => {
                if (value === null) setLocation("/generate");
                else setLocation(`/generate?category=${value}`);
              }}
              className={`px-5 py-2 rounded-full text-sm font-semibold border transition-all duration-300 ${
                active
                  ? "bg-[#B7F54A] text-[#09080D] border-[#B7F54A] shadow-[0_0_15px_rgba(183,245,74,0.3)]"
                  : "bg-[#171120] text-[#BEB2CC] border-[#A779F5]/30 hover:text-white hover:border-[#A779F5] hover:bg-[#A779F5]/10"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isListLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="aspect-[4/5] rounded-3xl bg-[#171120] border border-[#A779F5]/20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredWorkflows.map(workflow => (
            <div
              key={workflow.id}
              className="relative rounded-3xl cursor-pointer group flex flex-col overflow-hidden aspect-[4/5] border border-[#A779F5]/20 hover:border-[#B7F54A]/80 transition-all duration-500 shadow-2xl bg-[#171120]"
              onClick={() => setSelectedWorkflowId(workflow.id)}
            >
              {DB_WORKFLOW_THUMBNAILS[workflow.id] ? (
                <img
                  src={DB_WORKFLOW_THUMBNAILS[workflow.id]}
                  alt={workflow.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
              ) : (
                <div className="absolute inset-0 bg-[#09080D] flex items-center justify-center">
                  <LayoutGrid className="h-10 w-10 text-[#BEB2CC]/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#09080D] via-[#09080D]/30 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-500" />
              
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                <div className="flex items-center gap-1.5 bg-[#09080D]/80 backdrop-blur-md border border-[#A779F5]/30 rounded-full px-3 py-1.5 text-xs text-[#B7F54A] font-bold tracking-wide shadow-lg">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Node graph
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-6 z-10 flex flex-col gap-3 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <h3 className="font-extrabold text-2xl text-white leading-tight drop-shadow-md">{workflow.name}</h3>
                <p className="text-sm text-[#BEB2CC] line-clamp-2 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-75">{workflow.description}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="px-3 py-1.5 rounded-full bg-[#171120]/80 backdrop-blur-md border border-[#A779F5]/30 text-xs text-[#BEB2CC] font-semibold shadow-lg">
                    {workflow.category.replace(/-/g, ' ')}
                  </span>
                  {workflow.estimatedTime && (
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#171120]/80 backdrop-blur-md border border-[#A779F5]/30 text-xs text-[#BEB2CC] font-semibold shadow-lg">
                      <Timer className="h-3 w-3" /> {workflow.estimatedTime}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {visibleSaved.map(saved => (
            <div
              key={`saved-${saved.id}`}
              className="relative rounded-3xl cursor-pointer group flex flex-col overflow-hidden aspect-[4/5] border border-[#A779F5]/20 hover:border-[#B7F54A]/80 transition-all duration-500 shadow-2xl bg-[#171120]"
              onClick={() => {
                setInitialCustomJson(saved.json);
                setSelectedWorkflowId(CUSTOM_WORKFLOW_ID);
              }}
            >
              <div className="absolute inset-0 bg-[#171120]/80 flex items-center justify-center">
                <Bookmark className="h-16 w-16 text-[#BEB2CC]/30 group-hover:scale-110 transition-transform duration-700 ease-out" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#09080D] via-[#09080D]/30 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-500" />
              
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                <div className="flex items-center gap-1.5 bg-[#09080D]/80 backdrop-blur-md border border-[#A779F5]/30 rounded-full px-3 py-1.5 text-xs text-[#B7F54A] font-bold tracking-wide shadow-lg">
                  <Bookmark className="h-3.5 w-3.5" />
                  Saved Custom
                </div>
              </div>

              <div className="absolute top-4 right-4 z-20">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[#BEB2CC] hover:text-[#EF4444] bg-[#09080D]/40 hover:bg-[#09080D]/80 backdrop-blur-md rounded-full transition-all"
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

              <div className="absolute bottom-0 left-0 right-0 p-6 z-10 flex flex-col gap-3 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <h3 className="font-extrabold text-2xl text-white leading-tight drop-shadow-md truncate">{saved.name}</h3>
                <p className="text-sm text-[#BEB2CC] line-clamp-2 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-75">Your saved custom workflow — click to load and run.</p>
                <div className="flex gap-2 mt-1">
                  <span className="px-3 py-1.5 rounded-full bg-[#171120]/80 backdrop-blur-md border border-[#A779F5]/30 text-xs text-[#BEB2CC] font-semibold shadow-lg">
                    {new Date(saved.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredWorkflows.length === 0 && !isListLoading && (
        <div className="text-center p-16 border-2 border-dashed border-[#A779F5]/30 rounded-3xl text-[#BEB2CC]/60 font-medium">
          No workflows match your search. Try a different phrase or clear the search.
        </div>
      )}
    </div>
  );
}

const DB_WORKFLOW_THUMBNAILS: Record<string, string> = {
  "lip-sync-basic": latentsyncThumbnail,
  "motion-control-animatediff": mimicmotionThumbnail,
  "seedance-reference-motion": cinematicPortraitThumbnail,
  "seedance-camera-path": svdThumbnail,
  "seedance-vertical-social": reelLoopThumbnail,
  "seedance-product-reveal": productSwapThumbnail,
  "modelark-seedance-reference-video": seedanceReferenceThumbnail,
  "perform-anywhere-seedance": mimicmotionThumbnail,
  "perform-anywhere-angles": cinematicPortraitThumbnail,
  "perform-anywhere-motion": mimicmotionThumbnail,
  "video-generation-txt2vid": animatediffThumbnail,
  "img2vid-stable-video": svdThumbnail,
  "custom-workflow": sdxlThumbnail,
  "cinematic-film-grade": filmGradeThumbnail,
  "cinematic-portrait": cinematicPortraitThumbnail,
  "cinematic-slowmo-upscale": slowmoUpscaleThumbnail,
  "cinematic-epic-landscape": epicLandscapeThumbnail,
  "content-reel-loop": reelLoopThumbnail,
  "content-product-swap": productSwapThumbnail,
  "content-talking-avatar": talkingAvatarThumbnail,
  "content-blog-hero": blogHeroThumbnail,
};

const WORKFLOW_TEMPLATES: { id: string; label: string; description: string; json: Record<string, unknown>, image?: string }[] = [
  { id: "sdxl-image", label: "SDXL Image", description: "Text-to-image (SDXL base, core nodes only). Edit the prompt text.", json: sdxlImageTemplate, image: sdxlThumbnail },
  { id: "animatediff", label: "AnimateDiff Video", description: "Text-to-video (SD1.5 + AnimateDiff, fits a free T4). Edit the prompt text.", json: animatediffTemplate, image: animatediffThumbnail },
  { id: "svd", label: "SVD Image-to-Video", description: "Animate a still image (SVD XT, needs ~24 GB GPU). Paste your image URL or uploaded filename where marked.", json: svdTemplate, image: svdThumbnail },
  { id: "latentsync", label: "LatentSync Lip Sync", description: "Sync a video's mouth to audio. Upload your video & audio on this page first, then replace the REPLACE_WITH_… filenames.", json: latentsyncTemplate, image: latentsyncThumbnail },
  { id: "mimicmotion", label: "MimicMotion", description: "Drive an image with a motion video (needs ~24 GB GPU). Upload image & pose video first, then replace the REPLACE_WITH_… filenames.", json: mimicmotionTemplate, image: mimicmotionThumbnail },
  { id: "film-grade", label: "Film Grain & Grade", description: "Cinematic color grade + film grain for uploaded video. Upload your clip first, then replace the REPLACE_WITH_… filename.", json: filmGradeTemplate, image: filmGradeThumbnail },
  { id: "cinematic-portrait", label: "Cinematic Portrait", description: "SDXL movie-still portrait with shallow depth of field (core nodes only). Edit the prompt text.", json: cinematicPortraitTemplate, image: cinematicPortraitThumbnail },
  { id: "slowmo-upscale", label: "Slow-Mo Upscale", description: "RIFE frame interpolation + 2x upscale for buttery slow motion. Upload your clip first, then replace the REPLACE_WITH_… filename.", json: slowmoUpscaleTemplate, image: slowmoUpscaleThumbnail },
  { id: "epic-landscape", label: "Epic Landscape", description: "Wide-angle SDXL landscape with dramatic skies (core nodes only). Edit the prompt text.", json: epicLandscapeTemplate, image: epicLandscapeThumbnail },
  { id: "reel-loop", label: "Reel Loop", description: "Seamless looping vertical video (AnimateDiff closed-loop context). Edit the prompt text.", json: reelLoopTemplate, image: reelLoopThumbnail },
  { id: "product-swap", label: "Product BG Swap", description: "Auto-mask a product and inpaint a new studio background. Upload your product photo first, then replace the REPLACE_WITH_… filename.", json: productSwapTemplate, image: productSwapThumbnail },
  { id: "talking-avatar", label: "Talking Avatar", description: "Portrait + speech audio → talking-head video (LatentSync). Upload both files first, then replace the REPLACE_WITH_… filenames.", json: talkingAvatarTemplate, image: talkingAvatarThumbnail },
  { id: "blog-hero", label: "Blog Hero Image", description: "Wide 16:9 hero illustration with headline space. Replace REPLACE_WITH_YOUR_TOPIC in the prompt.", json: blogHeroTemplate, image: blogHeroThumbnail },
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

  const validateNodes = useValidateComfyNodes();
  const [nodeCheck, setNodeCheck] = useState<{ reachable: boolean; missingNodes: string[] } | null>(null);
  const [viewMode, setViewMode] = useState<"json" | "diagram">("json");
  const checkSeq = useRef(0);
  
  useEffect(() => {
    setNodeCheck(null);
    const seq = ++checkSeq.current;
    const value = workflowJson.trim();
    if (!value) return;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return;
    } catch {
      return;
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
        }
      );
    }, 700);
    return () => clearTimeout(t);
  }, [workflowJson, validateNodes]);

  const validateJson = (value: string): boolean => {
    if (!value.trim()) {
      setJsonError("Workflow JSON is required.");
      return false;
    }
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setJsonError("Workflow JSON must be an object.");
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
          toast({ title: "Failed to save", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const onDownloadApiJson = () => {
    if (!validateJson(workflowJson)) return;
    downloadJsonFile("comfyui-studio-workflow-api.json", JSON.parse(workflowJson));
    toast({ title: "Workflow JSON downloaded", description: "Import this API-format graph into another ComfyUI-compatible app." });
  };

  return (
    <div className="min-h-screen bg-[#09080D] text-white p-6 sm:p-12 animate-in slide-in-from-right-8 duration-300">
      <Button variant="ghost" className="mb-6 -ml-4 text-[#BEB2CC] hover:text-white rounded-lg" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <div className="bg-[#171120] border border-[#A779F5]/30 rounded-2xl shadow-xl">
          <div className="p-6 border-b border-[#A779F5]/20">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Code className="h-6 w-6 text-[#B7F54A]" />
              Custom Workflow
            </h2>
            <p className="text-[#BEB2CC] text-sm mt-2">
              Paste your ComfyUI API-format workflow JSON and run it directly on your server.
            </p>
          </div>
          <div className="p-6">
            <Alert className="mb-6 border-[#A779F5]/30 bg-[#09080D] rounded-xl">
              <AlertCircle className="h-4 w-4 text-[#B7F54A]" />
              <AlertDescription className="text-sm text-[#BEB2CC]">
                Export your workflow from ComfyUI using <strong className="text-white">Save (API format)</strong> in the settings menu, then paste the resulting JSON below.
              </AlertDescription>
            </Alert>

            <div className="mb-6 space-y-3">
              <Label className="text-sm font-semibold text-white">Start from a template</Label>
              <div className="flex flex-wrap gap-2">
                {WORKFLOW_TEMPLATES.map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-[#09080D] border-[#A779F5]/30 text-[#BEB2CC] hover:bg-[#A779F5]/20 hover:text-white rounded-lg"
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
            </div>

            <form id="custom-workflow-form" onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-white">
                    Workflow JSON <span className="text-[#EF4444]">*</span>
                  </Label>
                  <div className="flex items-center gap-1 bg-[#09080D] p-1 rounded-lg border border-[#A779F5]/30">
                    <button
                      type="button"
                      onClick={() => setViewMode("json")}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === "json" ? "bg-[#B7F54A] text-[#09080D]" : "text-[#BEB2CC] hover:text-white"}`}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("diagram")}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === "diagram" ? "bg-[#B7F54A] text-[#09080D]" : "text-[#BEB2CC] hover:text-white"}`}
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
                    className={`font-mono text-sm min-h-[400px] resize-y rounded-xl bg-[#09080D] border-[#A779F5]/30 text-white placeholder:text-[#BEB2CC]/30 focus-visible:ring-[#B7F54A] ${jsonError ? "border-[#EF4444]" : ""}`}
                    spellCheck={false}
                  />
                ) : (
                  <div className="min-h-[400px] h-[500px] border border-[#A779F5]/30 rounded-xl bg-[#09080D] overflow-hidden">
                    <WorkflowVisualizer jsonString={workflowJson} />
                  </div>
                )}
                {jsonError && (
                  <p className="text-sm text-[#EF4444] flex items-center gap-2 font-mono mt-2">
                    <AlertCircle className="h-4 w-4" />
                    {jsonError}
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#171120] border border-[#A779F5]/30 rounded-2xl p-6 sticky top-6 shadow-xl">
            <h3 className="font-bold mb-5 text-sm uppercase tracking-widest text-white">Execute</h3>
            <div className="space-y-4">
              <Button
                type="submit"
                form="custom-workflow-form"
                size="lg"
                className="w-full text-sm font-bold py-6 rounded-xl bg-[#B7F54A] text-[#09080D] hover:bg-[#A3E030] shadow-[0_0_20px_rgba(183,245,74,0.3)] hover:shadow-[0_0_30px_rgba(183,245,74,0.5)] transition-all"
                disabled={createJob.isPending}
              >
                {createJob.isPending ? "Starting Job..." : (
                  <>
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Run Workflow
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl border-[#A779F5]/30 bg-transparent text-white hover:bg-[#A779F5]/20 hover:text-white py-6"
                onClick={onDownloadApiJson}
              >
                <Download className="mr-2 h-4 w-4" />
                Download JSON
              </Button>
              <div className="bg-[#09080D] border border-[#A779F5]/30 rounded-xl p-5 space-y-4 mt-6">
                <h3 className="font-bold text-sm uppercase tracking-widest text-white flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-[#B7F54A]" />
                  Save for later
                </h3>
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Workflow name"
                  maxLength={100}
                  className="bg-[#171120] border-[#A779F5]/30 rounded-lg text-white"
                />
                <Button
                  type="button"
                  className="w-full bg-[#A779F5]/20 text-[#A779F5] hover:bg-[#A779F5]/40 hover:text-white rounded-lg"
                  onClick={onSave}
                  disabled={createSaved.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {createSaved.isPending ? "Saving..." : "Save Template"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowForm({ workflowId, onBack }: { workflowId: string, onBack: () => void }) {
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
  const [rehydratedFiles, setRehydratedFiles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!workflow) return;
    const restoredFiles = workflow.params.reduce<Record<string, string>>((restored, param) => {
      if (param.type !== "file") return restored;
      try {
        const storedFilename = sessionStorage.getItem(getUploadStorageKey(workflow.id, param.key));
        if (storedFilename) restored[param.key] = storedFilename;
      } catch {}
      return restored;
    }, {});
    setRehydratedFiles(restoredFiles);
    if (Object.keys(restoredFiles).length > 0) {
      setFormData((previous) => ({ ...previous, ...restoredFiles }));
    }
  }, [workflow]);

  const handleParamChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleFileSelect = (paramKey: string, filename: string) => {
    handleParamChange(paramKey, filename);
    try {
      sessionStorage.setItem(getUploadStorageKey(workflowId, paramKey), filename);
    } catch {}
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflow) return;
    for (const param of workflow.params) {
      const value = formData[param.key];
      const hasValue = value !== undefined && value !== null && String(value).trim().length > 0;
      const hasDefault = param.defaultValue !== undefined && param.defaultValue !== null && String(param.defaultValue).trim().length > 0;
      if (param.required && !hasValue && !hasDefault) {
        toast({ title: `Missing required field: ${param.label}`, variant: "destructive" });
        return;
      }
    }
    const finalParams = { ...formData };
    for (const param of workflow.params) {
      if (finalParams[param.key] === undefined && param.defaultValue !== undefined) {
        finalParams[param.key] = param.defaultValue;
      }
    }
    createJob.mutate({
      data: { workflowId: workflow.id, params: finalParams }
    }, {
      onSuccess: () => {
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
      <div className="min-h-screen bg-[#09080D] p-12 space-y-6">
        <Skeleton className="h-10 w-40 bg-[#171120]" />
        <Skeleton className="h-[400px] w-full max-w-4xl rounded-2xl bg-[#171120]" />
      </div>
    );
  }

  const guidance = WORKFLOW_GUIDANCE[workflow.id] ?? {
    bestFor: workflow.description,
    output: "Generated media output",
  };
  const thumbnail = DB_WORKFLOW_THUMBNAILS[workflow.id];

  return (
    <div className="min-h-screen bg-[#09080D] text-white p-6 sm:p-12 animate-in slide-in-from-right-8 duration-300">
      <Button variant="ghost" className="mb-8 -ml-4 text-[#BEB2CC] hover:text-white rounded-lg" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
        <div className="bg-[#171120] border border-[#A779F5]/30 rounded-3xl shadow-2xl overflow-hidden">
          {thumbnail && (
            <div className="h-64 w-full relative">
              <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#171120] to-transparent" />
            </div>
          )}
          <div className="p-8 relative z-10 -mt-10">
            <h2 className="text-4xl font-black mb-3">{workflow.name}</h2>
            <p className="text-[#BEB2CC] text-lg leading-relaxed max-w-2xl">{workflow.description}</p>
            
            <div className="grid gap-4 mt-8 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#A779F5]/20 bg-[#09080D]/50 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-[#B7F54A]">Best for</p>
                <p className="mt-2 text-sm text-[#BEB2CC] leading-relaxed">{guidance.bestFor}</p>
              </div>
              <div className="rounded-2xl border border-[#A779F5]/20 bg-[#09080D]/50 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-[#B7F54A]">Output</p>
                <p className="mt-2 text-sm text-[#BEB2CC] leading-relaxed">{guidance.output}</p>
              </div>
            </div>

            <form id="workflow-form" onSubmit={onSubmit} className="mt-10 space-y-8">
              {workflow.params.map(param => {
                const value = formData[param.key] !== undefined ? formData[param.key] : (param.defaultValue || "");
                return (
                  <div key={param.key} className="space-y-3">
                    <Label className="flex items-center justify-between text-base font-semibold text-white">
                      <span>{param.label} {param.required && <span className="text-[#EF4444]">*</span>}</span>
                    </Label>
                    {param.description && <p className="text-sm text-[#BEB2CC]">{param.description}</p>}
                    
                    {param.type === 'text' && (
                      param.max && param.max > 100 ? (
                        <Textarea 
                          value={value}
                          onChange={(e) => handleParamChange(param.key, e.target.value)}
                          placeholder={param.defaultValue?.toString() || ""}
                          className="font-mono text-sm min-h-[120px] rounded-xl bg-[#09080D] border-[#A779F5]/30 text-white placeholder:text-[#BEB2CC]/30 focus-visible:ring-[#B7F54A]"
                        />
                      ) : (
                        <Input 
                          type="text" 
                          value={value}
                          onChange={(e) => handleParamChange(param.key, e.target.value)}
                          placeholder={param.defaultValue?.toString() || ""}
                          className="rounded-xl bg-[#09080D] border-[#A779F5]/30 text-white focus-visible:ring-[#B7F54A]"
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
                        className="rounded-xl bg-[#09080D] border-[#A779F5]/30 text-white focus-visible:ring-[#B7F54A]"
                      />
                    )}

                    {param.type === 'slider' && (
                      <div className="pt-4 pb-2 bg-[#09080D] rounded-xl border border-[#A779F5]/20 p-5">
                        <Slider 
                          value={[Number(value) || 0]} 
                          min={param.min || 0} 
                          max={param.max || 100}
                          step={1}
                          onValueChange={(v) => handleParamChange(param.key, v[0])}
                        />
                        <div className="mt-3 text-right text-sm text-[#B7F54A] font-mono font-bold">
                          {value}
                        </div>
                      </div>
                    )}

                    {param.type === 'select' && (
                      <Select value={value} onValueChange={(v) => handleParamChange(param.key, v)}>
                        <SelectTrigger className="rounded-xl bg-[#09080D] border-[#A779F5]/30 text-white">
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#171120] border-[#A779F5]/30 text-white rounded-xl">
                          {param.options?.map(opt => (
                            <SelectItem key={opt} value={opt} className="focus:bg-[#A779F5]/20 focus:text-white">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {param.type === 'file' && (
                      <div className="bg-[#09080D] rounded-xl border border-[#A779F5]/20 p-2">
                        <FileUpload 
                          accept={param.accept || undefined}
                          previouslyUploadedName={rehydratedFiles[param.key]}
                          onFileSelect={(filename) => handleFileSelect(param.key, filename)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#171120] border border-[#A779F5]/30 rounded-3xl p-6 sticky top-6 shadow-xl">
            <h3 className="font-bold mb-5 text-sm uppercase tracking-widest text-white">Execute</h3>
            <Button 
              type="submit" 
              form="workflow-form"
              size="lg" 
              className="w-full text-sm font-bold py-6 rounded-xl bg-[#B7F54A] text-[#09080D] hover:bg-[#A3E030] shadow-[0_0_20px_rgba(183,245,74,0.3)] hover:shadow-[0_0_30px_rgba(183,245,74,0.5)] transition-all mb-4"
              disabled={createJob.isPending}
            >
              {createJob.isPending ? "Starting Job..." : (
                <>
                  <Play className="mr-2 h-5 w-5 fill-current" />
                  Generate Media
                </>
              )}
            </Button>
            <p className="text-xs text-[#BEB2CC] text-center mb-6">
              This job will be added to your queue.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl border-[#A779F5]/30 bg-transparent text-white hover:bg-[#A779F5]/20 hover:text-white py-6"
              onClick={() => {
                downloadJsonFile(`${workflow.id}-preset.json`, {
                  format: "comfyui-studio-preset", version: 1, workflowId: workflow.id,
                  name: workflow.name, description: workflow.description, params: workflow.params,
                });
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export preset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MotionUploadSlot({ label, hint, accept, onUploaded, uploaded }: any) {
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
      className="aspect-video bg-[#09080D] rounded-xl flex flex-col items-center justify-center gap-2 border border-dashed border-[#A779F5]/40 cursor-pointer hover:border-[#B7F54A] transition-colors relative overflow-hidden group"
      onClick={() => fileRef.current?.click()}
    >
      <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
      {uploading ? (
        <>
          <Loader2 className="h-6 w-6 text-[#B7F54A] animate-spin" />
          <span className="text-xs text-[#BEB2CC]">{progress}%</span>
          <div className="absolute bottom-0 left-0 h-1 transition-all bg-[#B7F54A]" style={{ width: `${progress}%` }} />
        </>
      ) : uploaded ? (
        <CheckCircle2 className="h-8 w-8 text-[#B7F54A]" />
      ) : (
        <Plus className="h-8 w-8 text-[#BEB2CC]/50 group-hover:text-[#B7F54A]" />
      )}
      <div className="mt-1 text-center px-4">
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="text-xs mt-1 text-[#BEB2CC]">{hint}</p>
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
      { data: { workflowId: MOTION_WORKFLOW_ID, params: { source_image: sourceImage, motion_preset: selectedPreset, motion_strength: motionStrength, num_frames: numFrames, prompt } } },
      { onSuccess: () => { toast({ title: "Motion job started!" }); setLocation("/jobs"); }, onError: (err: any) => { toast({ title: "Failed to start job", description: err.message, variant: "destructive" }); } }
    );
  };

  const SelectedIcon = MOTION_PRESETS.find(p => p.id === selectedPreset)?.icon || Video;

  return (
    <div className="min-h-[100dvh] bg-[#09080D] flex flex-col animate-in fade-in duration-500">
      <div className="px-8 py-6 flex-shrink-0 border-b border-[#A779F5]/20 bg-[#171120]">
        <Button variant="ghost" className="text-[#BEB2CC] hover:text-white -ml-4" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Templates
        </Button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 flex-shrink-0 flex flex-col p-6 gap-5 overflow-y-auto border-r border-[#A779F5]/20 bg-[#171120]">
          <div className="flex gap-1 rounded-xl p-1 bg-[#09080D] border border-[#A779F5]/30">
            {(["history", "library"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  activeTab === tab ? "bg-[#A779F5]/20 text-[#B7F54A]" : "text-[#BEB2CC] hover:text-white"
                }`}
              >
                {tab === "history" ? <History className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                {tab}
              </button>
            ))}
          </div>

          <div className="rounded-2xl p-4 bg-[#09080D] border border-[#A779F5]/30 cursor-pointer hover:border-[#B7F54A]/50 transition-colors" onClick={() => setActiveTab("library")}>
            <div className="aspect-video bg-[#171120] rounded-xl mb-3 flex flex-col items-center justify-center gap-2 border border-[#A779F5]/20">
              <SelectedIcon className="h-6 w-6 text-[#B7F54A]" />
              <span className="text-sm font-bold text-[#B7F54A]">
                {MOTION_PRESETS.find((p) => p.id === selectedPreset)?.label ?? "Pick a style"}
              </span>
            </div>
            <p className="text-sm font-bold text-white">Add motion to copy</p>
            <p className="text-xs mt-1 text-[#BEB2CC]">Video duration: 3–30 seconds</p>
          </div>

          <div className="rounded-2xl p-4 bg-[#09080D] border border-[#A779F5]/30">
            <MotionUploadSlot label="Add your character" hint="Image with visible face and body" accept="image/*" onUploaded={setSourceImage} uploaded={!!sourceImage} />
          </div>

          <div className="rounded-2xl px-5 py-4 space-y-6 bg-[#09080D] border border-[#A779F5]/30">
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-semibold text-[#BEB2CC] uppercase tracking-wider">Motion Strength</span>
                <span className="text-sm font-mono font-bold text-[#B7F54A]">{motionStrength}</span>
              </div>
              <Slider value={[motionStrength]} min={0} max={100} step={1} onValueChange={(v) => setMotionStrength(v[0])} />
            </div>
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-semibold text-[#BEB2CC] uppercase tracking-wider">Frames</span>
                <span className="text-sm font-mono font-bold text-[#B7F54A]">{numFrames}</span>
              </div>
              <Slider value={[numFrames]} min={8} max={64} step={8} onValueChange={(v) => setNumFrames(v[0])} />
            </div>
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Optional: describe the motion in words…"
            className="text-sm resize-none min-h-[80px] rounded-xl bg-[#09080D] border-[#A779F5]/30 text-white placeholder:text-[#BEB2CC]/50 focus-visible:ring-[#B7F54A]"
          />

          <button
            onClick={handleGenerate}
            disabled={createJob.isPending}
            className="w-full py-4 rounded-xl font-black text-sm text-[#09080D] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-[#A3E030] bg-[#B7F54A] disabled:opacity-50 shadow-[0_0_15px_rgba(183,245,74,0.3)] mt-2"
          >
            {createJob.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Sparkles className="h-5 w-5" /> Generate</>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-[#09080D]">
          {activeTab === "library" ? (
            <div className="max-w-5xl mx-auto">
              <div className="flex items-start justify-between gap-12 mb-12">
                <div className="flex-1 min-w-0">
                  <h1 className="font-black leading-[1.1] tracking-tight text-white uppercase text-4xl sm:text-5xl lg:text-6xl mb-6">
                    Recreate any <span className="text-[#B7F54A]">motion</span><br />with your image
                  </h1>
                  <p className="text-lg leading-relaxed text-[#BEB2CC] max-w-lg">
                    Copy camera movement and subject motion from any reference and perfectly map it onto your custom character.
                  </p>
                </div>
                <div className="relative flex-shrink-0 hidden lg:block w-52 h-44 mt-4">
                  <img src={mimicmotionThumbnail} alt="" className="absolute rounded-2xl object-cover shadow-2xl border-4 border-[#171120]" style={{ right: 0, top: 0, width: "130px", height: "170px", transform: "rotate(6deg)", zIndex: 3 }} />
                  <img src={animatediffThumbnail} alt="" className="absolute rounded-2xl object-cover shadow-2xl border-4 border-[#171120] opacity-90" style={{ right: "80px", top: "15px", width: "120px", height: "150px", transform: "rotate(-8deg)", zIndex: 2 }} />
                  <img src={svdThumbnail} alt="" className="absolute rounded-2xl object-cover shadow-2xl border-4 border-[#171120] opacity-75" style={{ right: "150px", top: "25px", width: "100px", height: "130px", transform: "rotate(-2deg)", zIndex: 1 }} />
                </div>
              </div>

              <p className="text-xs font-bold uppercase tracking-widest text-[#B7F54A] mb-4">
                Start by copying motion from library
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                {MOTION_PRESETS.map((preset) => {
                  const active = selectedPreset === preset.id;
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`group rounded-3xl text-left transition-all p-5 border-2 ${
                        active ? "border-[#B7F54A] bg-[#B7F54A]/10 shadow-[0_0_20px_rgba(183,245,74,0.15)]" : "border-[#A779F5]/20 bg-[#171120] hover:border-[#A779F5]/60 hover:bg-[#A779F5]/5"
                      }`}
                    >
                      <div className={`w-full aspect-square rounded-2xl mb-4 flex items-center justify-center transition-colors ${
                        active ? "bg-[#B7F54A]/20" : "bg-[#09080D]"
                      }`}>
                        <Icon className={`h-12 w-12 ${active ? "text-[#B7F54A]" : "text-[#BEB2CC]"}`} />
                      </div>
                      <p className={`text-base font-bold ${active ? "text-[#B7F54A]" : "text-white"}`}>
                        {preset.label}
                      </p>
                      <p className="text-sm mt-1 text-[#BEB2CC] leading-relaxed">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-[#BEB2CC]">
              <History className="h-16 w-16 opacity-30" />
              <p className="text-lg font-semibold text-white">No generation history yet</p>
              <p className="text-sm text-[#BEB2CC]/70 max-w-sm text-center">
                Run a motion job using the controls on the left and it will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function getUploadStorageKey(workflowId: string, paramKey: string): string {
  return `${UPLOAD_STORAGE_PREFIX}${encodeURIComponent(workflowId)}:${encodeURIComponent(paramKey)}`;
}
