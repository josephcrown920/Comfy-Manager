import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  MoveDown,
  MoveUpRight,
  RefreshCw,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import {
  getListBatchesQueryKey,
  getGetComfyReadinessQueryKey,
  getGetModelArkStatusQueryKey,
  useCreateBatch,
  useCreateJob,
  useGetComfyReadiness,
  useGetModelArkStatus,
  useImportOutput,
  useListBatches,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import cinematicPortraitThumbnail from "@/assets/thumbnails/cinematic-portrait.jpg";
import mimicmotionThumbnail from "@/assets/thumbnails/mimicmotion.jpg";
import reelLoopThumbnail from "@/assets/thumbnails/reel-loop.jpg";
import performerThumbnail from "@/assets/thumbnails/perform-anywhere-performer.jpeg";
import stylingThumbnail from "@/assets/thumbnails/perform-anywhere-style.png";
import vehicleThumbnail from "@/assets/thumbnails/perform-anywhere-vehicle.jpeg";
import cityThumbnail from "@/assets/thumbnails/perform-anywhere-city.jpeg";

const CAMERA_TREATMENTS = [
  { id: "wide-shot", label: "Wide shot", index: "01", copy: "Establish the world around the performance.", icon: MoveUpRight },
  { id: "low-angle", label: "Low angle", index: "02", copy: "Give the moment scale and forward pull.", icon: MoveUpRight },
  { id: "close-up-face", label: "Close-up face", index: "03", copy: "Hold the eyes, expression, and identity.", icon: Camera },
  { id: "over-shoulder", label: "Over shoulder", index: "04", copy: "Bring the viewer into the performer’s POV.", icon: MoveDown },
  { id: "dutch-angle", label: "Dutch angle", index: "05", copy: "Tilt the horizon for a charged final beat.", icon: MoveUpRight },
] as const;

type ReferenceKey = "identity" | "outfit" | "location" | "pose" | "prop";
type PresetId = "perform-anywhere" | "luxury-interior";
type MotionProvider = "seedance" | "mimicmotion";

const REFERENCE_SLOTS: Array<{ key: ReferenceKey; label: string; eyebrow: string; description: string; preview?: string; previewAlt?: string }> = [
  { key: "identity", label: "Identity / face", eyebrow: "01", description: "A clear face and shoulders. This anchors who is on camera." },
  {
    key: "outfit",
    label: "Outfit sheet",
    eyebrow: "02",
    description: "One collage is enough. Include every garment, accessory, and styling reference in the same sheet.",
    preview: stylingThumbnail,
    previewAlt: "Outfit sheet with jewelry, jacket, sneakers, and stacked jeans",
  },
  { key: "location", label: "Location", eyebrow: "03", description: "The world, architecture, or atmosphere behind the shot." },
  { key: "pose", label: "Pose", eyebrow: "04", description: "A body position or gesture that sets the performance energy." },
  { key: "prop", label: "Prop / car", eyebrow: "05", description: "The hero object that makes the frame yours." },
];

const PRESETS: Array<{ id: PresetId; label: string; description: string; keys: ReferenceKey[]; thumbnail: string }> = [
  {
    id: "perform-anywhere",
    label: "Perform Anywhere",
    description: "Five anchors for a flexible music-video world.",
    keys: ["identity", "outfit", "location", "pose", "prop"],
    thumbnail: performerThumbnail,
  },
  {
    id: "luxury-interior",
    label: "Luxury Vehicle Interior",
    description: "Identity, vehicle interior, and seated composition.",
    keys: ["identity", "location", "pose"],
    thumbnail: vehicleThumbnail,
  },
];

const LUXURY_SLOT_OVERRIDES: Partial<Record<ReferenceKey, { label: string; description: string }>> = {
  location: {
    label: "Vehicle interior",
    description: "The cabin, lighting, trim, and luxury details the generated scene should preserve.",
  },
  pose: {
    label: "Seated composition",
    description: "The seated performance position and framing to match before motion transfer.",
  },
};

function statusLabel(status: string | undefined) {
  if (status === "completed") return "Ready";
  if (status === "running") return "Rendering";
  if (status === "failed") return "Needs attention";
  if (status === "cancelled") return "Cancelled";
  return "Queued";
}

function ReferenceCard({
  slot,
  value,
  onUploaded,
}: {
  slot: (typeof REFERENCE_SLOTS)[number];
  value: string;
  onUploaded: (filename: string) => void;
}) {
  return (
    <div data-testid={`card-reference-${slot.key}`} className="group relative overflow-hidden rounded-3xl border border-[#A779F5]/30 bg-[#171120] p-4 transition-all hover:border-[#B7F54A] shadow-xl">
      {slot.preview && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-[#A779F5]/20 bg-[#09080D]">
          <img src={slot.preview} alt={slot.previewAlt ?? `${slot.label} preview`} className="aspect-[16/10] w-full object-contain" />
        </div>
      )}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-widest text-[#B7F54A]">{slot.eyebrow}</p>
          <h3 className="mt-2 text-base font-bold text-white">{slot.label}</h3>
        </div>
        {value ? <CheckCircle2 data-testid={`status-reference-${slot.key}`} className="h-5 w-5 text-[#B7F54A]" /> : <span className="h-5 w-5 rounded-full border border-[#BEB2CC]/30" />}
      </div>
      <div data-testid={`upload-reference-${slot.key}`} className="bg-[#09080D] rounded-xl border border-[#A779F5]/20 p-2">
        <FileUpload
          accept="image/*"
          onFileSelect={onUploaded}
          description={slot.description}
          previouslyUploadedName={value || undefined}
        />
      </div>
    </div>
  );
}

export default function PerformAnywhere() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const createBatch = useCreateBatch();
  const importOutput = useImportOutput();
  const createJob = useCreateJob();
  
  const modelArkStatusQuery = useGetModelArkStatus({
    query: {
      queryKey: getGetModelArkStatusQueryKey(),
      enabled: isAuthLoaded && Boolean(isSignedIn),
      refetchInterval: 30000,
    },
  });
  
  const comfyReadinessQuery = useGetComfyReadiness({
    query: {
      queryKey: getGetComfyReadinessQueryKey(),
      enabled: isAuthLoaded && Boolean(isSignedIn),
      refetchInterval: 15000,
    },
  });
  
  const batchesQuery = useListBatches({
    query: {
      queryKey: getListBatchesQueryKey(),
      refetchInterval: 4000,
    },
  });

  const [references, setReferences] = useState<Record<ReferenceKey, string>>({
    identity: "", outfit: "", location: "", pose: "", prop: "",
  });
  const [sceneDescription, setSceneDescription] = useState("A midnight performance beneath sodium streetlights, rain caught in the air, the city stretching behind the performer.");
  const [visualDirection, setVisualDirection] = useState("35mm cinematic texture, deep indigo shadows, warm amber practicals, restrained film grain, confident editorial framing.");
  const [motionContext, setMotionContext] = useState("a performer moving naturally inside the scene");
  const [performanceVideo, setPerformanceVideo] = useState("");
  const [motionProvider, setMotionProvider] = useState<MotionProvider>("seedance");
  const [preset, setPreset] = useState<PresetId>("perform-anywhere");
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  const activePreset = PRESETS.find((item) => item.id === preset) ?? PRESETS[0];
  const activeReferenceSlots = REFERENCE_SLOTS
    .filter((slot) => activePreset.keys.includes(slot.key))
    .map((slot) => preset === "luxury-interior" ? { ...slot, ...LUXURY_SLOT_OVERRIDES[slot.key] } : slot);
  
  const batches = batchesQuery.data ?? [];
  const activeBatch = useMemo(() => {
    if (activeBatchId !== null) return batches.find((batch) => batch.id === activeBatchId);
    return batches.find((batch) => batch.batchType === "perform-anywhere-angles");
  }, [activeBatchId, batches]);

  const completedChildren = useMemo(
    () => activeBatch?.children.filter((child) => child.status === "completed" && child.outputs?.length) ?? [],
    [activeBatch],
  );
  
  const selectedChild = completedChildren.find((child) => child.id === selectedChildId);
  const selectedOutput = selectedChild?.outputs?.[0];
  const completedCount = activeBatch?.completedJobs ?? 0;
  const allReferencesReady = activePreset.keys.every((key) => Boolean(references[key]));
  const canStart = allReferencesReady && sceneDescription.trim().length >= 2 && visualDirection.trim().length >= 2;
  
  const selectedProviderReady = motionProvider === "seedance"
    ? modelArkStatusQuery.data?.configured === true
    : comfyReadinessQuery.data?.ready === true;
    
  const readinessLoading = !isAuthLoaded || !isSignedIn || (modelArkStatusQuery.isLoading || comfyReadinessQuery.isLoading);
  const readinessError = modelArkStatusQuery.isError || comfyReadinessQuery.isError;
  const canHandoff = Boolean(selectedOutput && performanceVideo && selectedProviderReady);

  const providerStatus = (provider: MotionProvider) => {
    if (!isAuthLoaded) return { label: "Checking readiness", tone: "text-[#BEB2CC]", dot: "bg-[#BEB2CC]/50" };
    if (!isSignedIn) return { label: "Sign in required", tone: "text-[#BEB2CC]", dot: "bg-[#BEB2CC]/50" };
    if (readinessLoading) return { label: "Checking readiness", tone: "text-[#BEB2CC]", dot: "bg-[#BEB2CC]/50" };
    
    if (provider === "seedance") {
      if (modelArkStatusQuery.isError) return { label: "Could not check", tone: "text-[#EF4444]", dot: "bg-[#EF4444]" };
      return modelArkStatusQuery.data?.configured
        ? { label: "ModelArk configured", tone: "text-[#B7F54A]", dot: "bg-[#B7F54A]" }
        : { label: "ModelArk not configured", tone: "text-[#EF4444]", dot: "bg-[#EF4444]" };
    }
    
    if (comfyReadinessQuery.isError) return { label: "Could not check", tone: "text-[#EF4444]", dot: "bg-[#EF4444]" };
    return comfyReadinessQuery.data?.ready
      ? { label: "Compatible GPU connected", tone: "text-[#B7F54A]", dot: "bg-[#B7F54A]" }
      : { label: "No compatible GPU", tone: "text-[#EF4444]", dot: "bg-[#EF4444]" };
  };

  const selectedProviderMessage = () => {
    if (!isAuthLoaded) return "Checking your sign-in state before checking provider readiness.";
    if (!isSignedIn) return "Sign in to check provider readiness before uploading or sending a performance.";
    if (readinessLoading) return "Checking provider readiness before enabling the motion handoff.";
    if (readinessError) return "Readiness could not be confirmed. Refresh the checks before sending a motion job.";
    if (motionProvider === "seedance" && !modelArkStatusQuery.data?.configured) {
      return "Seedance is unavailable until ModelArk is configured. Add the provider configuration in Replit Secrets, then refresh.";
    }
    if (motionProvider === "mimicmotion" && !comfyReadinessQuery.data?.ready) {
      const missing = comfyReadinessQuery.data?.workers.find((worker) => worker.connected && worker.missingNodes?.length)?.missingNodes;
      return missing?.length
        ? `Your connected ComfyUI worker is missing ${missing.join(", ")}. Install the MimicMotion nodes, then check again.`
        : "Connect a ComfyUI GPU with the MimicMotion nodes in Settings before sending this handoff.";
    }
    return "This provider is ready. Select a completed still and upload your performance video to continue.";
  };

  useEffect(() => {
    if (selectedChildId && !completedChildren.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(null);
    }
  }, [completedChildren, selectedChildId]);

  const updateReference = (key: ReferenceKey, filename: string) => {
    setReferences((current) => ({ ...current, [key]: filename }));
  };

  const selectPreset = (nextPreset: PresetId) => {
    setPreset(nextPreset);
    setReferences({ identity: "", outfit: "", location: "", pose: "", prop: "" });
    setSelectedChildId(null);
    if (nextPreset === "luxury-interior") {
      setSceneDescription("A man rapping inside a luxury vehicle interior at night, seated performance, star-lit ceiling, cream leather, city lights drifting across the glass.");
      setVisualDirection("Premium automotive campaign, ARRI Alexa 35, Cooke anamorphic lens, crisp leather texture, practical LED lighting, shallow depth of field, controlled reflections.");
      setMotionContext("a seated performer rapping naturally inside the same luxury vehicle interior, subtle head movement and hand gestures within frame");
    } else {
      setSceneDescription("A midnight performance beneath sodium streetlights, rain caught in the air, the city stretching behind the performer.");
      setVisualDirection("35mm cinematic texture, deep indigo shadows, warm amber practicals, restrained film grain, confident editorial framing.");
      setMotionContext("a performer moving naturally inside the scene");
    }
  };

  const startAngles = () => {
    if (!canStart) {
      toast({
        title: "Complete the reference room",
        description: `Upload all ${activePreset.keys.length} references and add both pieces of direction before building the shot list.`,
        variant: "destructive",
      });
      return;
    }
    createBatch.mutate(
      {
        data: {
          name: `${activePreset.label} · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
          batchType: "perform-anywhere-angles",
          batchSize: 5,
          masterAsset: references.identity,
          identityAnchor: references.identity,
          outfitAsset: preset === "luxury-interior" ? references.identity : references.outfit,
          locationAsset: references.location,
          poseAsset: references.pose,
          propAsset: preset === "luxury-interior" ? references.location : references.prop,
          scenePrompt: sceneDescription.trim(),
          styleAnchor: visualDirection.trim(),
          cameraTreatments: CAMERA_TREATMENTS.map((camera) => camera.id),
          aspectRatios: ["16:9"],
          colorGrades: ["cinematic-neutral"],
          seedStrategy: "incremental",
          baseSeed: 24681357,
        },
      },
      {
        onSuccess: (batch) => {
          setActiveBatchId(batch.id);
          setSelectedChildId(null);
          queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() });
          toast({ title: "Your five-angle shot list is rendering", description: "The room will update as each angle is ready." });
        },
        onError: (error: Error) => toast({ title: "Could not start the shot list", description: error.message, variant: "destructive" }),
      },
    );
  };

  const submitMotion = () => {
    if (!selectedOutput || !performanceVideo) {
      toast({ title: "Choose a still and upload your performance", description: "Both pieces are needed for the motion handoff.", variant: "destructive" });
      return;
    }
    if (!selectedProviderReady) {
      toast({
        title: `${motionProvider === "seedance" ? "Seedance" : "MimicMotion"} is not ready`,
        description: selectedProviderMessage(),
        variant: "destructive",
      });
      return;
    }
    importOutput.mutate(
      { data: { filename: selectedOutput.filename, jobId: selectedChild!.id, subfolder: selectedOutput.subfolder, type: "output" } },
      {
        onSuccess: (imported) => {
          createJob.mutate(
            {
              data: {
                workflowId: motionProvider === "seedance" ? "perform-anywhere-seedance" : "perform-anywhere-motion",
                params: {
                  source_image: imported.name,
                  source_video: performanceVideo,
                  performance_video: performanceVideo,
                  selected_angle: selectedChild?.batchIndex ?? 1,
                  motion_context: motionContext.trim(),
                  aspect_ratio: "16:9",
                  ratio: "16:9",
                  resolution: "720p",
                  duration: 5,
                  num_frames: 48,
                  scene_description: sceneDescription,
                  visual_direction: visualDirection,
                },
              },
            },
            {
              onSuccess: () => {
                toast({ title: motionProvider === "seedance" ? "Seedance render is queued" : "Motion transfer is queued", description: "Your selected angle and performance are now becoming a shot." });
                setLocation("/jobs");
              },
              onError: (error: Error) => toast({ title: "Could not queue motion transfer", description: error.message, variant: "destructive" }),
            },
          );
        },
        onError: (error: Error) => toast({ title: "Could not prepare the selected still", description: error.message, variant: "destructive" }),
      },
    );
  };

  const busy = createBatch.isPending || importOutput.isPending || createJob.isPending;

  return (
    <div className="min-h-[100dvh] bg-[#09080D] text-white animate-in fade-in duration-300 pb-20 px-6 sm:px-12 pt-8">
      <div className="max-w-[1440px] mx-auto space-y-12">
        <section className="relative overflow-hidden rounded-[28px] border border-[#A779F5]/30 bg-[#171120] px-8 py-12 lg:px-16 shadow-2xl">
          <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#B7F54A]/10 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[#A779F5]/10 blur-[100px]" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_300px] lg:items-center">
            <div>
              <div className="mb-6 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#09080D] border border-[#A779F5]/30 text-[#A779F5]">
                  <Clapperboard className="h-5 w-5" />
                </span>
                <p data-testid="text-workflow-eyebrow" className="font-mono text-sm font-bold uppercase tracking-widest text-[#B7F54A]">
                  Perform Anywhere
                </p>
              </div>
              <h1 data-testid="text-page-title" className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.1] tracking-tight text-white mb-6">
                Turn {activePreset.keys.length} references into a <span className="text-[#B7F54A]">shot list.</span>
              </h1>
              <p data-testid="text-page-description" className="text-lg leading-relaxed text-[#BEB2CC] max-w-2xl">
                Build a consistent cinematic scene from your references, audition five camera treatments, then carry the strongest still into motion with your original performance.
              </p>
            </div>
            <div className="overflow-hidden rounded-3xl border border-[#A779F5]/30 bg-[#09080D]/50 backdrop-blur-md shadow-xl">
              <div className="grid h-36 grid-cols-3" aria-label="Perform Anywhere workflow preview">
                {[performerThumbnail, stylingThumbnail, cityThumbnail].map((thumbnail, index) => (
                  <img
                    key={thumbnail}
                    src={thumbnail}
                    alt={index === 0 ? "Cinematic reference still" : index === 1 ? "Generated camera angle" : "Motion transfer result"}
                    className="h-full w-full object-cover"
                  />
                ))}
              </div>
              <div className="p-6">
              <div className="flex items-center justify-between gap-3 mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-[#BEB2CC]">Workflow</p>
                <Sparkles className="h-5 w-5 text-[#B7F54A]" />
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-[#171120] rounded-xl p-3 border border-[#A779F5]/20">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#09080D] text-xs font-bold text-[#A779F5]">1</span>
                  <span className="text-sm font-semibold text-white">Moodboard</span>
                </div>
                <div className="pl-4 border-l-2 border-[#A779F5]/20 ml-3 h-4"></div>
                <div className="flex items-center gap-3 bg-[#B7F54A]/10 rounded-xl p-3 border border-[#B7F54A]/30">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B7F54A] text-xs font-bold text-[#09080D]">2</span>
                  <span className="text-sm font-semibold text-[#B7F54A]">Angles</span>
                </div>
                <div className="pl-4 border-l-2 border-[#A779F5]/20 ml-3 h-4"></div>
                <div className="flex items-center gap-3 bg-[#171120] rounded-xl p-3 border border-[#A779F5]/20">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#09080D] text-xs font-bold text-[#A779F5]">3</span>
                  <span className="text-sm font-semibold text-white">Motion</span>
                </div>
              </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[1fr_400px]">
          <main className="space-y-8">
            <section className="bg-[#171120] rounded-3xl p-6 sm:p-10 border border-[#A779F5]/20 shadow-xl">
              <div className="mb-8">
                <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-[#B7F54A] mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B7F54A] text-[#09080D]">1</span>
                  Choose a room
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Pick the world you want to build.</h2>
                <p className="max-w-2xl text-sm text-[#BEB2CC]">Both presets use the same five-angle audition and motion handoff. The luxury interior preset keeps the reference room focused on a seated performance inside the vehicle.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {PRESETS.map((option) => {
                  const selected = option.id === preset;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      data-testid={`button-preset-${option.id}`}
                      onClick={() => selectPreset(option.id)}
                      className={`rounded-2xl border p-6 text-left transition-all ${selected ? "border-[#B7F54A] bg-[#B7F54A]/10 shadow-[0_0_20px_rgba(183,245,74,.15)]" : "border-[#A779F5]/30 bg-[#09080D] hover:border-[#A779F5]/70"}`}
                    >
                      <img
                        src={option.thumbnail}
                        alt={`${option.label} visual example`}
                        className="mb-5 aspect-video w-full rounded-xl object-cover"
                        loading="lazy"
                      />
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className={`text-lg font-bold mb-2 ${selected ? "text-[#B7F54A]" : "text-white"}`}>{option.label}</p>
                          <p className="text-sm leading-relaxed text-[#BEB2CC]">{option.description}</p>
                        </div>
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-[#B7F54A] bg-[#B7F54A] text-[#09080D]" : "border-[#A779F5]/30 text-transparent bg-[#171120]"}`}><Check className="h-4 w-4" /></span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-[#171120] rounded-3xl p-6 sm:p-10 border border-[#A779F5]/20 shadow-xl">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-[#B7F54A] mb-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B7F54A] text-[#09080D]">2</span>
                    Build the moodboard
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">{activePreset.keys.length === 5 ? "Five anchors. One world." : "Three anchors. One interior."}</h2>
                  <p className="max-w-2xl text-sm text-[#BEB2CC]">Give the scene enough visual evidence to stay recognizably yours from every angle.</p>
                </div>
                <div data-testid="text-reference-count" className="rounded-full border border-[#B7F54A]/30 bg-[#B7F54A]/10 px-4 py-2 font-mono text-sm font-bold text-[#B7F54A]">
                  {activePreset.keys.filter((key) => Boolean(references[key])).length} / {activePreset.keys.length} uploaded
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {activeReferenceSlots.map((slot) => (
                  <ReferenceCard key={slot.key} slot={slot} value={references[slot.key]} onUploaded={(filename) => updateReference(slot.key, filename)} />
                ))}
              </div>
            </section>

            <section className="bg-[#171120] rounded-3xl p-6 sm:p-10 border border-[#A779F5]/20 shadow-xl">
              <div className="mb-8">
                <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-[#B7F54A] mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B7F54A] text-[#09080D]">3</span>
                  Direct the scene
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Put the feeling into words.</h2>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <Label htmlFor="scene-description" className="text-sm font-bold text-white">Scene description</Label>
                  <Textarea data-testid="input-scene-description" id="scene-description" value={sceneDescription} onChange={(event) => setSceneDescription(event.target.value)} className="min-h-[160px] resize-none border-[#A779F5]/30 bg-[#09080D] text-sm leading-relaxed text-white placeholder:text-[#BEB2CC]/50 focus-visible:ring-[#B7F54A] rounded-2xl p-4" placeholder="Describe the place, time, energy, and what the viewer should feel." />
                  <p className="text-xs text-[#BEB2CC]">Place and atmosphere. The generative scene prompt starts here.</p>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="visual-direction" className="text-sm font-bold text-white">Visual direction</Label>
                  <Textarea data-testid="input-visual-direction" id="visual-direction" value={visualDirection} onChange={(event) => setVisualDirection(event.target.value)} className="min-h-[160px] resize-none border-[#A779F5]/30 bg-[#09080D] text-sm leading-relaxed text-white placeholder:text-[#BEB2CC]/50 focus-visible:ring-[#B7F54A] rounded-2xl p-4" placeholder="Name the lens, light, grade, texture, and editorial references." />
                  <p className="text-xs text-[#BEB2CC]">Lens, light, color, and texture. The taste layer that keeps five angles together.</p>
                </div>
              </div>
              <div className="mt-8 flex flex-col justify-between gap-6 rounded-2xl border border-[#B7F54A]/30 bg-[#B7F54A]/5 p-6 sm:flex-row sm:items-center">
                <div className="flex gap-4 items-start">
                  <LockKeyhole className="h-6 w-6 shrink-0 text-[#B7F54A]" />
                  <p className="max-w-xl text-sm leading-relaxed text-[#BEB2CC]">We will create exactly five children with the camera treatments below. They share your {activePreset.keys.length} references, scene, and visual direction.</p>
                </div>
                <Button data-testid="button-start-angles" onClick={startAngles} disabled={createBatch.isPending} className="shrink-0 rounded-xl bg-[#B7F54A] py-6 px-8 font-bold text-[#09080D] hover:bg-[#A3E030] shadow-[0_0_20px_rgba(183,245,74,0.3)] transition-all text-base">
                  {createBatch.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Building angles</> : <><Sparkles className="mr-2 h-5 w-5" />Build five angles</>}
                </Button>
              </div>
            </section>

            <section className="bg-[#171120] rounded-3xl p-6 sm:p-10 border border-[#A779F5]/20 shadow-xl">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-[#B7F54A] mb-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B7F54A] text-[#09080D]">4</span>
                    Direct the camera
                  </div>
                  <h2 className="text-2xl font-bold text-white">The five-beat audition.</h2>
                </div>
                {activeBatch && <div data-testid="status-angle-batch" className="flex items-center gap-3 rounded-full border border-[#B7F54A]/30 bg-[#B7F54A]/10 px-4 py-2 font-mono text-sm font-bold text-[#B7F54A]"><span className={`h-2 w-2 rounded-full ${activeBatch.status === "completed" ? "bg-[#B7F54A]" : activeBatch.status === "failed" ? "bg-[#EF4444]" : "animate-pulse bg-[#B7F54A]"}`} />{completedCount} / 5 ready</div>}
              </div>
              {!activeBatch && !batchesQuery.isLoading && (
                <div data-testid="empty-angle-batch" className="rounded-3xl border-2 border-dashed border-[#A779F5]/30 bg-[#09080D] px-6 py-16 text-center">
                  <Camera className="mx-auto h-12 w-12 text-[#BEB2CC]/40 mb-4" />
                  <p className="text-lg font-bold text-white mb-2">Your camera tests will land here.</p>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-[#BEB2CC]">Finish the moodboard above, then build five angles to see your scene from every intentional point of view.</p>
                </div>
              )}
              {batchesQuery.isLoading && (
                <div data-testid="loading-angle-batch" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {CAMERA_TREATMENTS.map((camera) => <div key={camera.id} className="h-64 animate-pulse rounded-2xl bg-[#09080D] border border-[#A779F5]/20" />)}
                </div>
              )}
              {batchesQuery.isError && (
                <div data-testid="error-angle-batch" className="flex items-center justify-between gap-4 rounded-2xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-5 text-sm text-white">
                  <div className="flex items-center gap-3"><CircleAlert className="h-5 w-5 text-[#EF4444]" /><span>Could not read the shot list right now.</span></div>
                  <Button data-testid="button-retry-angles" variant="outline" className="border-[#EF4444]/50 hover:bg-[#EF4444]/20" onClick={() => batchesQuery.refetch()}>Retry</Button>
                </div>
              )}
              {activeBatch && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {CAMERA_TREATMENTS.map((camera, index) => {
                    const child = activeBatch.children[index];
                    const output = child?.outputs?.[0];
                    const isSelected = child?.id === selectedChildId;
                    const isReady = child?.status === "completed" && Boolean(output);
                    return (
                      <button
                        key={camera.id}
                        type="button"
                        data-testid={`button-select-angle-${camera.id}`}
                        disabled={!isReady}
                        onClick={() => child && isReady && setSelectedChildId(child.id)}
                        className={`group relative overflow-hidden rounded-2xl border text-left transition-all duration-300 ${isSelected ? "border-[#B7F54A] bg-[#B7F54A]/10 shadow-[0_0_30px_rgba(183,245,74,.2)]" : "border-[#A779F5]/30 bg-[#09080D] hover:border-[#A779F5]/70"} ${!isReady ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <div className="relative aspect-[4/5] overflow-hidden bg-[#171120]">
                          {output ? <img src={output.thumbnailUrl || output.comfyUrl} alt={`${camera.label} generated still`} className={`h-full w-full object-cover transition-transform duration-700 ${isSelected ? "scale-105" : "group-hover:scale-105"}`} /> : <div className="flex h-full items-center justify-center"><Loader2 className={`h-8 w-8 ${child?.status === "failed" ? "text-[#EF4444]" : "animate-spin text-[#B7F54A]"}`} /></div>}
                          <div className="absolute inset-0 bg-gradient-to-t from-[#09080D] via-transparent to-[#09080D]/40" />
                          <span className="absolute left-3 top-3 rounded-full border border-[#BEB2CC]/30 bg-[#09080D]/60 px-3 py-1 font-mono text-xs font-bold text-white backdrop-blur-sm">{camera.index}</span>
                          {isSelected && <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#B7F54A] text-[#09080D] shadow-lg"><Check className="h-4 w-4 font-bold" /></span>}
                          <div className="absolute inset-x-4 bottom-4">
                            <p className="text-base font-bold text-white mb-1">{camera.label}</p>
                            <p className={`text-xs font-bold uppercase tracking-wider ${isReady ? "text-[#B7F54A]" : child?.status === "failed" ? "text-[#EF4444]" : "text-[#BEB2CC]"}`}>{statusLabel(child?.status)}</p>
                          </div>
                        </div>
                        <p className="p-4 text-xs leading-relaxed text-[#BEB2CC]">{camera.copy}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              {activeBatch?.status === "failed" && <p data-testid="text-angle-error" className="mt-6 text-sm font-semibold text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-4">One or more camera tests could not render. You can keep any completed still or build a fresh shot list above.</p>}
            </section>
          </main>

          <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
            <section className="rounded-3xl border border-[#A779F5]/30 bg-[#171120] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-[#A779F5]/5 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-[#B7F54A] mb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B7F54A] text-[#09080D]">5</span>
                  Bring the performance
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">Make it move.</h2>
                <p className="text-sm leading-relaxed text-[#BEB2CC]">Choose one finished still, then upload the original phone clip whose movement you want to transfer.</p>
                
                <div className="mt-8 space-y-3">
                  <Label className="text-sm font-bold text-white">Motion provider</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      data-testid="button-motion-provider-seedance"
                      onClick={() => setMotionProvider("seedance")}
                      className={`rounded-2xl border p-4 text-left transition-all ${motionProvider === "seedance" ? "border-[#B7F54A] bg-[#B7F54A]/10 shadow-[0_0_15px_rgba(183,245,74,.15)]" : "border-[#A779F5]/30 bg-[#09080D] hover:border-[#A779F5]/70"}`}
                    >
                      <div className="flex flex-col gap-2">
                        <p className={`text-base font-bold ${motionProvider === "seedance" ? "text-[#B7F54A]" : "text-white"}`}>Seedance</p>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${providerStatus("seedance").tone} bg-[#09080D] border border-current/20 w-fit`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${providerStatus("seedance").dot}`} />
                          {providerStatus("seedance").label.split(" ")[0]}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      data-testid="button-motion-provider-mimicmotion"
                      onClick={() => setMotionProvider("mimicmotion")}
                      className={`rounded-2xl border p-4 text-left transition-all ${motionProvider === "mimicmotion" ? "border-[#B7F54A] bg-[#B7F54A]/10 shadow-[0_0_15px_rgba(183,245,74,.15)]" : "border-[#A779F5]/30 bg-[#09080D] hover:border-[#A779F5]/70"}`}
                    >
                      <div className="flex flex-col gap-2">
                        <p className={`text-base font-bold ${motionProvider === "mimicmotion" ? "text-[#B7F54A]" : "text-white"}`}>MimicMotion</p>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${providerStatus("mimicmotion").tone} bg-[#09080D] border border-current/20 w-fit`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${providerStatus("mimicmotion").dot}`} />
                          {providerStatus("mimicmotion").label.split(" ")[0]}
                        </span>
                      </div>
                    </button>
                  </div>
                  <div className={`mt-4 rounded-xl border p-4 ${selectedProviderReady ? "border-[#B7F54A]/30 bg-[#B7F54A]/10" : "border-[#EF4444]/30 bg-[#EF4444]/10"}`}>
                    <div className="flex items-start gap-3">
                      {selectedProviderReady
                        ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#B7F54A]" />
                        : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#EF4444]" />}
                      <p data-testid="text-provider-readiness" className={`text-sm leading-relaxed ${selectedProviderReady ? "text-[#B7F54A]" : "text-white"}`}>
                        {selectedProviderMessage()}
                      </p>
                      {(readinessError || (!readinessLoading && !selectedProviderReady)) && (
                        <div className="flex flex-col gap-2 ml-auto shrink-0">
                        {motionProvider === "mimicmotion" && !readinessError && (
                          <button type="button" onClick={() => setLocation("/settings")} className="rounded-lg px-3 py-1.5 text-xs font-bold bg-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/30">Settings</button>
                        )}
                        <button type="button" aria-label="Refresh provider readiness" onClick={() => { void modelArkStatusQuery.refetch(); void comfyReadinessQuery.refetch(); }} className="rounded-lg p-2 bg-[#09080D] text-[#BEB2CC] hover:text-white border border-[#A779F5]/30">
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div data-testid="upload-performance-video" className="mt-8">
                  <div className="bg-[#09080D] rounded-2xl border border-[#A779F5]/30 p-2">
                    <FileUpload
                      accept="video/*"
                      label="Phone performance video"
                      description="A clean 3–30 second phone performance works best. Keep the performer and full movement visible."
                      onFileSelect={setPerformanceVideo}
                      previouslyUploadedName={performanceVideo || undefined}
                      preview
                      previewPoster={performerThumbnail}
                    />
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  <Label htmlFor="motion-context" className="text-sm font-bold text-white">Motion context</Label>
                  <Textarea data-testid="input-motion-context" id="motion-context" value={motionContext} onChange={(event) => setMotionContext(event.target.value)} className="min-h-[100px] resize-none border-[#A779F5]/30 bg-[#09080D] text-sm leading-relaxed text-white placeholder:text-[#BEB2CC]/50 focus-visible:ring-[#B7F54A] rounded-xl" placeholder="Describe the movement and the scene context so the transfer stays grounded." />
                </div>

                <div data-testid="status-selected-angle" className="mt-8 rounded-2xl border border-[#A779F5]/30 bg-[#09080D] p-5 relative overflow-hidden">
                  {selectedOutput && <div className="absolute inset-0 bg-gradient-to-r from-[#B7F54A]/10 to-transparent pointer-events-none" />}
                  <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#BEB2CC] mb-4">Selected still</p>
                  {selectedOutput ? (
                    <div className="flex items-center gap-4 relative z-10">
                      <img src={selectedOutput.thumbnailUrl || selectedOutput.comfyUrl} alt="Selected generated still" className="h-16 w-16 rounded-xl object-cover border-2 border-[#B7F54A]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white mb-1">{CAMERA_TREATMENTS[(selectedChild?.batchIndex ?? 1) - 1]?.label ?? "Selected angle"}</p>
                        <p className="text-xs font-bold uppercase tracking-wider text-[#B7F54A] flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Ready</p>
                      </div>
                    </div>
                  ) : <p className="text-sm leading-relaxed text-[#BEB2CC]">Select a completed camera treatment from the grid.</p>}
                </div>

                <Button data-testid="button-submit-motion" onClick={submitMotion} disabled={!canHandoff || busy || readinessLoading} className="mt-8 w-full rounded-xl bg-[#A779F5] py-7 text-base font-bold text-white hover:bg-[#8B5CF6] shadow-[0_0_20px_rgba(167,121,245,0.3)] transition-all disabled:opacity-50 disabled:bg-[#A779F5]/30">
                  {importOutput.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Preparing still</> : createJob.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Queueing motion</> : <><Upload className="mr-2 h-5 w-5" />Send to Render</>}
                </Button>
                
                {!selectedOutput && <p className="mt-4 text-center text-xs font-semibold text-[#BEB2CC]">The handoff unlocks when a finished angle is selected.</p>}
                {selectedOutput && performanceVideo && !selectedProviderReady && !readinessLoading && (
                  <p className="mt-4 text-center text-xs font-semibold text-[#EF4444]">The handoff is paused until the selected provider is ready.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}