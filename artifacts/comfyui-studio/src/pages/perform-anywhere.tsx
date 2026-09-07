import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
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
  useCreateBatch,
  useCreateJob,
  useImportOutput,
  useListBatches,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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

const REFERENCE_SLOTS: Array<{ key: ReferenceKey; label: string; eyebrow: string; description: string }> = [
  { key: "identity", label: "Identity / face", eyebrow: "01", description: "A clear face and shoulders. This anchors who is on camera." },
  { key: "outfit", label: "Outfit", eyebrow: "02", description: "Texture, silhouette, and styling cues to carry into the scene." },
  { key: "location", label: "Location", eyebrow: "03", description: "The world, architecture, or atmosphere behind the shot." },
  { key: "pose", label: "Pose", eyebrow: "04", description: "A body position or gesture that sets the performance energy." },
  { key: "prop", label: "Prop / car", eyebrow: "05", description: "The hero object that makes the frame yours." },
];

const PRESETS: Array<{ id: PresetId; label: string; description: string; keys: ReferenceKey[] }> = [
  {
    id: "perform-anywhere",
    label: "Perform Anywhere",
    description: "Five anchors for a flexible music-video world.",
    keys: ["identity", "outfit", "location", "pose", "prop"],
  },
  {
    id: "luxury-interior",
    label: "Luxury Vehicle Interior",
    description: "Identity, vehicle interior, and seated composition.",
    keys: ["identity", "location", "pose"],
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
    <div data-testid={`card-reference-${slot.key}`} className="group relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141326]/80 p-3 transition-colors hover:border-[#c8f135]/35">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.22em] text-[#c8f135]">{slot.eyebrow}</p>
          <h3 className="mt-1 text-sm font-semibold text-white">{slot.label}</h3>
        </div>
        {value ? <CheckCircle2 data-testid={`status-reference-${slot.key}`} className="h-4 w-4 text-[#c8f135]" /> : <span className="h-4 w-4 rounded-full border border-white/15" />}
      </div>
      <div data-testid={`upload-reference-${slot.key}`}>
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

function PreviewFrame({ src, alt, placeholder }: { src?: string; alt: string; placeholder: string }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-[#0b0a15]">
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          <ImageIcon className="h-5 w-5 text-white/20" />
          <span className="text-[11px] text-white/30">{placeholder}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}

export default function PerformAnywhere() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBatch = useCreateBatch();
  const importOutput = useImportOutput();
  const createJob = useCreateJob();
  const batchesQuery = useListBatches({
    query: {
      queryKey: getListBatchesQueryKey(),
      refetchInterval: 4000,
    },
  });

  const [references, setReferences] = useState<Record<ReferenceKey, string>>({
    identity: "",
    outfit: "",
    location: "",
    pose: "",
    prop: "",
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
  const canHandoff = Boolean(selectedOutput && performanceVideo);

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
    importOutput.mutate(
      { data: { filename: selectedOutput.filename, type: "output" } },
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
    <div className="mx-auto max-w-[1440px] space-y-8 pb-12 animate-in fade-in duration-500">
      <section className="relative overflow-hidden rounded-[28px] border border-[#c8f135]/20 bg-[#121025] px-5 py-7 shadow-2xl shadow-black/25 sm:px-8 sm:py-10 lg:px-12">
        <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-[#c8f135]/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-96 bg-[#7046c8]/15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#c8f135]/35 bg-[#c8f135]/10 text-[#c8f135]"><Clapperboard className="h-4 w-4" /></span>
              <p data-testid="text-workflow-eyebrow" className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#c8f135]">Perform Anywhere / room 01</p>
            </div>
            <h1 data-testid="text-page-title" className="max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl">
               Turn {activePreset.keys.length} references into a <span className="text-[#c8f135]">shot list.</span>
            </h1>
            <p data-testid="text-page-description" className="mt-5 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">
               Build a consistent cinematic scene from your references, audition five camera treatments, then carry the strongest still into motion with your original performance.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">The creative handoff</p>
              <Sparkles className="h-4 w-4 text-[#c8f135]" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-white/75">
              <span className="rounded-full bg-white/10 px-2.5 py-1">Moodboard</span><ArrowRight className="h-3 w-3 text-white/30" />
              <span className="rounded-full bg-[#c8f135]/15 px-2.5 py-1 text-[#c8f135]">Angles</span><ArrowRight className="h-3 w-3 text-white/30" />
              <span className="rounded-full bg-white/10 px-2.5 py-1">Motion</span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/40">No node graph. Just references, taste, and one decisive frame.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
        <main className="space-y-7">
          <section className="aurora-glass rounded-3xl p-5 sm:p-7">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#bba3ff]"><span className="font-mono">00</span><span className="h-px w-8 bg-[#bba3ff]/40" /> Choose a starting room</div>
                <h2 className="mt-3 text-2xl font-bold text-white">Pick the world you want to build.</h2>
                <p className="mt-1 max-w-xl text-sm text-white/45">Both presets use the same five-angle audition and motion handoff. The luxury interior preset keeps the reference room focused on a seated performance inside the vehicle.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {PRESETS.map((option) => {
                const selected = option.id === preset;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-testid={`button-preset-${option.id}`}
                    onClick={() => selectPreset(option.id)}
                    className={`rounded-2xl border p-4 text-left transition-all ${selected ? "border-[#c8f135] bg-[#c8f135]/[0.08] shadow-[0_12px_35px_rgba(200,241,53,.08)]" : "border-white/[0.09] bg-black/10 hover:border-white/20"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className={`font-semibold ${selected ? "text-[#c8f135]" : "text-white"}`}>{option.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-white/45">{option.description}</p>
                      </div>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[#c8f135] bg-[#c8f135] text-[#10110a]" : "border-white/15 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="aurora-glass rounded-3xl p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#c8f135]"><span className="font-mono">01</span><span className="h-px w-8 bg-[#c8f135]/40" /> Build the moodboard</div>
                <h2 className="mt-3 text-2xl font-bold text-white">{activePreset.keys.length === 5 ? "Five anchors. One world." : "Three anchors. One interior."}</h2>
                <p className="mt-1 max-w-xl text-sm text-white/45">Give the scene enough visual evidence to stay recognizably yours from every angle.</p>
              </div>
              <div data-testid="text-reference-count" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-white/45">
                 {activePreset.keys.filter((key) => Boolean(references[key])).length} / {activePreset.keys.length} uploaded
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
               {activeReferenceSlots.map((slot) => (
                <ReferenceCard key={slot.key} slot={slot} value={references[slot.key]} onUploaded={(filename) => updateReference(slot.key, filename)} />
              ))}
            </div>
          </section>

          <section className="aurora-glass rounded-3xl p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7046c8]/20 text-[#bba3ff]"><Film className="h-4 w-4" /></div>
              <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#bba3ff]"><span className="font-mono">02</span><span className="h-px w-8 bg-[#bba3ff]/40" /> Direct the scene</div><h2 className="mt-1 text-xl font-bold text-white">Put the feeling into words.</h2></div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scene-description" className="text-xs font-semibold text-white/70">Scene description</Label>
                <Textarea data-testid="input-scene-description" id="scene-description" value={sceneDescription} onChange={(event) => setSceneDescription(event.target.value)} className="min-h-32 resize-none border-white/10 bg-black/20 text-sm leading-relaxed text-white placeholder:text-white/25" placeholder="Describe the place, time, energy, and what the viewer should feel." />
                <p className="text-[11px] text-white/30">Place and atmosphere. The generative scene prompt starts here.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="visual-direction" className="text-xs font-semibold text-white/70">Visual direction</Label>
                <Textarea data-testid="input-visual-direction" id="visual-direction" value={visualDirection} onChange={(event) => setVisualDirection(event.target.value)} className="min-h-32 resize-none border-white/10 bg-black/20 text-sm leading-relaxed text-white placeholder:text-white/25" placeholder="Name the lens, light, grade, texture, and editorial references." />
                <p className="text-[11px] text-white/30">Lens, light, color, and texture. The taste layer that keeps five angles together.</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-[#c8f135]/20 bg-[#c8f135]/[0.06] p-4 sm:flex-row sm:items-center">
               <div className="flex gap-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#c8f135]" /><p className="max-w-xl text-xs leading-relaxed text-white/55">We will create exactly five children with the camera treatments below. They share your {activePreset.keys.length} references, scene, and visual direction.</p></div>
              <Button data-testid="button-start-angles" onClick={startAngles} disabled={createBatch.isPending} className="shrink-0 rounded-full bg-[#c8f135] px-5 font-bold text-[#10110a] hover:bg-[#d9f85d]">
                {createBatch.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Building angles</> : <><Sparkles className="mr-2 h-4 w-4" />Build five angles</>}
              </Button>
            </div>
          </section>

          <section className="aurora-glass rounded-3xl p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#ffb88b]"><span className="font-mono">03</span><span className="h-px w-8 bg-[#ffb88b]/40" /> Direct the camera</div>
                <h2 className="mt-3 text-2xl font-bold text-white">The five-beat audition.</h2>
              </div>
              {activeBatch && <div data-testid="status-angle-batch" className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/55"><span className={`h-1.5 w-1.5 rounded-full ${activeBatch.status === "completed" ? "bg-[#c8f135]" : activeBatch.status === "failed" ? "bg-[#ff6e62]" : "animate-pulse bg-[#ffb88b]"}`} />{completedCount} / 5 ready</div>}
            </div>
            {!activeBatch && !batchesQuery.isLoading && (
              <div data-testid="empty-angle-batch" className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 py-12 text-center">
                <Camera className="mx-auto h-8 w-8 text-white/20" />
                <p className="mt-4 text-sm font-semibold text-white/65">Your camera tests will land here.</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-white/35">Finish the moodboard above, then build five angles to see your scene from every intentional point of view.</p>
              </div>
            )}
            {batchesQuery.isLoading && (
              <div data-testid="loading-angle-batch" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {CAMERA_TREATMENTS.map((camera) => <div key={camera.id} className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />)}
              </div>
            )}
            {batchesQuery.isError && (
              <div data-testid="error-angle-batch" className="flex items-center justify-between gap-4 rounded-2xl border border-[#ff6e62]/25 bg-[#ff6e62]/[0.06] p-4 text-sm text-white/65">
                <div className="flex items-center gap-3"><CircleAlert className="h-4 w-4 text-[#ff6e62]" /><span>Could not read the shot list right now.</span></div>
                <Button data-testid="button-retry-angles" variant="ghost" size="sm" onClick={() => batchesQuery.refetch()} className="text-[#ffb88b] hover:bg-white/10">Retry</Button>
              </div>
            )}
            {activeBatch && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                      className={`group relative overflow-hidden rounded-2xl border text-left transition-all duration-300 ${isSelected ? "border-[#c8f135] bg-[#c8f135]/[0.08] shadow-[0_12px_35px_rgba(200,241,53,.12)]" : "border-white/[0.09] bg-[#101020]/80 hover:border-white/20"} ${!isReady ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <div className="relative aspect-[4/5] overflow-hidden bg-[#0b0a15]">
                        {output ? <img src={output.thumbnailUrl || output.comfyUrl} alt={`${camera.label} generated still`} className={`h-full w-full object-cover transition-transform duration-700 ${isSelected ? "scale-[1.04]" : "group-hover:scale-[1.04]"}`} /> : <div className="flex h-full items-center justify-center"><Loader2 className={`h-5 w-5 ${child?.status === "failed" ? "text-[#ff6e62]" : "animate-spin text-[#c8f135]/70"}`} /></div>}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/10" />
                        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/35 px-2 py-1 font-mono text-[10px] text-white/70">{camera.index}</span>
                        {isSelected && <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#c8f135] text-[#10110a]"><Check className="h-3.5 w-3.5" /></span>}
                        <div className="absolute inset-x-3 bottom-3"><p className="text-sm font-bold text-white">{camera.label}</p><p className={`mt-1 text-[10px] ${isReady ? "text-[#c8f135]" : child?.status === "failed" ? "text-[#ff8f86]" : "text-white/45"}`}>{statusLabel(child?.status)}</p></div>
                      </div>
                      <p className="min-h-10 p-3 text-[11px] leading-relaxed text-white/40">{camera.copy}</p>
                    </button>
                  );
                })}
              </div>
            )}
            {activeBatch?.status === "failed" && <p data-testid="text-angle-error" className="mt-4 text-xs text-[#ff8f86]">One or more camera tests could not render. You can keep any completed still or build a fresh shot list above.</p>}
          </section>
        </main>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-3xl border border-[#ffb88b]/25 bg-[linear-gradient(145deg,rgba(55,29,43,.9),rgba(22,16,31,.92))] p-5 shadow-2xl shadow-black/20 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ffb88b]/15 text-[#ffb88b]"><Video className="h-4 w-4" /></div>
              <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#ffb88b]"><span className="font-mono">04</span><span className="h-px w-8 bg-[#ffb88b]/40" /> Bring the performance</div><h2 className="mt-1 text-xl font-bold text-white">Make it move.</h2></div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/50">Choose one finished still, then upload the original phone clip whose movement you want to transfer.</p>
             <div className="mt-5 space-y-2">
               <Label className="text-xs font-semibold text-white/70">Motion provider</Label>
               <div className="grid grid-cols-2 gap-2">
                 <button
                   type="button"
                   data-testid="button-motion-provider-seedance"
                   onClick={() => setMotionProvider("seedance")}
                   className={`rounded-xl border px-3 py-3 text-left transition-colors ${motionProvider === "seedance" ? "border-[#ffb88b] bg-[#ffb88b]/10" : "border-white/10 bg-black/15 hover:border-white/20"}`}
                 >
                   <p className={`text-xs font-bold ${motionProvider === "seedance" ? "text-[#ffb88b]" : "text-white/75"}`}>Seedance API</p>
                   <p className="mt-1 text-[10px] leading-relaxed text-white/35">ModelArk hosted video. No local GPU for this stage.</p>
                 </button>
                 <button
                   type="button"
                   data-testid="button-motion-provider-mimicmotion"
                   onClick={() => setMotionProvider("mimicmotion")}
                   className={`rounded-xl border px-3 py-3 text-left transition-colors ${motionProvider === "mimicmotion" ? "border-[#ffb88b] bg-[#ffb88b]/10" : "border-white/10 bg-black/15 hover:border-white/20"}`}
                 >
                   <p className={`text-xs font-bold ${motionProvider === "mimicmotion" ? "text-[#ffb88b]" : "text-white/75"}`}>MimicMotion</p>
                   <p className="mt-1 text-[10px] leading-relaxed text-white/35">Local ComfyUI workflow. Uses your connected GPU.</p>
                 </button>
               </div>
             </div>
            <div data-testid="upload-performance-video" className="mt-5">
              <FileUpload accept="video/*" label="Performance video" description="A clean 3–30 second phone performance works best." onFileSelect={setPerformanceVideo} previouslyUploadedName={performanceVideo || undefined} />
            </div>
             <div className="mt-5 space-y-2">
               <Label htmlFor="motion-context" className="text-xs font-semibold text-white/70">Motion context</Label>
               <Textarea data-testid="input-motion-context" id="motion-context" value={motionContext} onChange={(event) => setMotionContext(event.target.value)} className="min-h-24 resize-none border-white/10 bg-black/20 text-sm leading-relaxed text-white placeholder:text-white/25" placeholder="Describe the movement and the scene context so the transfer stays grounded." />
               <p className="text-[11px] text-white/30">This prompt guides the animation stage and helps prevent vehicle or environment morphing.</p>
             </div>
            <div data-testid="status-selected-angle" className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Selected still</p>
              {selectedOutput ? (
                <div className="mt-3 flex items-center gap-3">
                  <img src={selectedOutput.thumbnailUrl || selectedOutput.comfyUrl} alt="Selected generated still" className="h-14 w-14 rounded-lg object-cover" />
                  <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{CAMERA_TREATMENTS[(selectedChild?.batchIndex ?? 1) - 1]?.label ?? "Selected angle"}</p><p className="mt-1 text-[11px] text-[#c8f135]">Ready for motion</p></div>
                </div>
              ) : <p className="mt-2 text-xs leading-relaxed text-white/35">Select a completed camera treatment above.</p>}
            </div>
            <Button data-testid="button-submit-motion" onClick={submitMotion} disabled={!canHandoff || busy} className="mt-5 w-full rounded-full bg-[#ffb88b] py-6 font-bold text-[#24131b] hover:bg-[#ffc9a9]">
               {importOutput.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing still</> : createJob.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Queueing {motionProvider === "seedance" ? "Seedance" : "motion"}</> : <><Upload className="mr-2 h-4 w-4" />Send to {motionProvider === "seedance" ? "Seedance" : "motion"}</>}
            </Button>
            {!selectedOutput && <p className="mt-3 text-center text-[11px] text-white/30">The handoff unlocks when a finished angle is selected.</p>}
          </section>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/65"><RefreshCw className="h-3.5 w-3.5 text-[#c8f135]" /> Live render room</div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/35">This room checks the batch every few seconds, so you can keep shaping the handoff while the GPU works.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}