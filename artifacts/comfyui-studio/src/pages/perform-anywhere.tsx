import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueries, useQueryClient } from "@tanstack/react-query";
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
  getGetMotionProvidersQueryKey,
  useCreateBatch,
  useCreateJob,
  useGetMotionProviders,
  useImportOutput,
  useListBatches,
  useRunWorkflowApp,
  useRunWorkflowAppBatch,
  refreshJob,
  getGetJobQueryKey,
  type Job,
  type WorkflowApp,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  FileUpload,
  IMAGE_FILE_ACCEPT,
  isSupportedImageFile,
  uploadFile,
} from "@/components/ui/file-upload";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EnvironmentPicker } from "@/components/environment-picker";
import { ShotBoard } from "@/components/shot-board";
import { useToast } from "@/hooks/use-toast";
import cinematicPortraitThumbnail from "@/assets/thumbnails/cinematic-portrait.jpg";
import mimicmotionThumbnail from "@/assets/thumbnails/mimicmotion.jpg";
import reelLoopThumbnail from "@/assets/thumbnails/reel-loop.jpg";
import performerThumbnail from "@/assets/thumbnails/perform-anywhere-performer.jpeg";
import stylingThumbnail from "@/assets/thumbnails/perform-anywhere-style.png";
import vehicleThumbnail from "@/assets/thumbnails/perform-anywhere-vehicle.jpeg";
import cityThumbnail from "@/assets/thumbnails/perform-anywhere-city.jpeg";
import {
  buildPerformAnywhereBatchInput,
} from "@/lib/perform-anywhere-payload";

const CAMERA_TREATMENTS = [
  { id: "wide-shot", label: "Wide shot", index: "01", copy: "Establish the world around the performance.", icon: MoveUpRight },
  { id: "low-angle", label: "Low angle", index: "02", copy: "Give the moment scale and forward pull.", icon: MoveUpRight },
  { id: "close-up-face", label: "Close-up face", index: "03", copy: "Hold the eyes, expression, and identity.", icon: Camera },
  { id: "over-shoulder", label: "Over shoulder", index: "04", copy: "Bring the viewer into the performer’s POV.", icon: MoveDown },
  { id: "dutch-angle", label: "Dutch angle", index: "05", copy: "Tilt the horizon for a charged final beat.", icon: MoveUpRight },
] as const;

type ReferenceKey = "identity" | "outfit" | "location" | "pose" | "prop";
type PresetId = "perform-anywhere" | "luxury-interior";
type ProviderId = "seedance" | "mimicmotion" | "kling" | "omnihuman";
type TrackedJob = { id: number; provider: ProviderId; childId: number };
type TrackedState = TrackedJob & { job?: Job; error: boolean };
const PROVIDERS: Array<{ id: ProviderId; name: string; workflowId: string; kind: "video" | "audio"; charge: string }> = [
  { id: "seedance", name: "Seedance", workflowId: "perform-anywhere-seedance", kind: "video", charge: "billed by BytePlus ModelArk" },
  { id: "mimicmotion", name: "MimicMotion", workflowId: "perform-anywhere-motion", kind: "video", charge: "uses your connected GPU time" },
  { id: "kling", name: "Kling", workflowId: "perform-anywhere-kling", kind: "video", charge: "billed by the Kling provider" },
  { id: "omnihuman", name: "OmniHuman", workflowId: "perform-anywhere-omnihuman", kind: "audio", charge: "billed by the OmniHuman provider" },
];

function MotionResults({ items, errors, onRetry }: { items: TrackedState[]; errors: Partial<Record<ProviderId, string>>; onRetry: (index: number) => void }) {
  const errorEntries = Object.entries(errors) as Array<[ProviderId, string]>;
  if (items.length === 0 && errorEntries.length === 0) return null;
  return (
    <div className="mt-6 space-y-4" aria-live="polite" data-testid="panel-motion-results">
      <h3 className="font-bold text-white">Your rendered shots</h3>
      {errorEntries.map(([id, message]) => (
        <p key={id} className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-white"><strong>{PROVIDERS.find((p) => p.id === id)?.name}:</strong> {message}</p>
      ))}
      {items.map((item, index) => {
        const name = PROVIDERS.find((p) => p.id === item.provider)?.name ?? item.provider;
        const status = item.job?.status;
        const running = !status || status === "pending" || status === "running";
        return (
          <div key={item.id} data-testid={`result-${item.provider}-${item.id}`} className="space-y-2 rounded-xl border border-[#A779F5]/30 p-4">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-white">{name}</p><span className="font-mono text-[11px] text-[#BEB2CC]">Job {item.id}</span></div>
            {running && <p className="text-sm text-[#BEB2CC]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{status === "running" ? "Rendering" : "Queued"} · {item.job?.progress ?? 0}%</p>}
            {item.error && <div><p className="text-sm text-[#EF4444]">Could not check this render.</p><Button size="sm" variant="outline" onClick={() => onRetry(index)}>Retry status</Button></div>}
            {(status === "failed" || status === "cancelled") && <p className="text-sm text-[#EF4444]">{item.job?.errorMessage || `Render ${status}. You can submit this provider again.`}</p>}
            {status !== "failed" && status !== "cancelled" && item.job?.errorMessage && <p role="alert" className="text-sm text-amber-300">{item.job.errorMessage}</p>}
            {status === "completed" && !item.job?.outputs?.length && <p className="text-sm text-[#BEB2CC]">Completed without outputs. Check Jobs for details.</p>}
            {item.job?.outputs?.map((output) => (
              <div key={output.id} className="space-y-2">
                {output.outputType === "video" ? <video src={output.comfyUrl} controls playsInline className="w-full rounded-lg" /> : output.outputType === "audio" ? <audio src={output.comfyUrl} controls /> : <img src={output.comfyUrl} alt={output.filename} className="w-full rounded-lg" />}
                <a href={output.comfyUrl} download={output.filename} className="text-sm font-bold text-[#B7F54A]">Download {name} {output.filename}</a>
              </div>
            ))}
          </div>
        );
      })}
      <Link href="/jobs" className="inline-block text-xs font-bold text-[#BEB2CC] underline">All jobs</Link>
    </div>
  );
}

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
          accept={IMAGE_FILE_ACCEPT}
          onFileSelect={onUploaded}
          description={slot.description}
          previouslyUploadedName={value || undefined}
        />
      </div>
    </div>
  );
}

export default function PerformAnywhere({ appConfig }: { appConfig?: WorkflowApp } = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useAuth();
  const baseCreateBatch = useCreateBatch();
  const appCreateBatch = useRunWorkflowAppBatch();
  const createBatch = {
    isPending: baseCreateBatch.isPending || appCreateBatch.isPending,
    mutate: (variables: Parameters<typeof baseCreateBatch.mutate>[0], options?: Parameters<typeof baseCreateBatch.mutate>[1]) => {
      if (appConfig) appCreateBatch.mutate({ ...variables, slug: appConfig.slug }, options);
      else baseCreateBatch.mutate(variables, options);
    },
  };
  const importOutput = useImportOutput();
  const baseCreateJob = useCreateJob();
  const appCreateJob = useRunWorkflowApp();
  const createJob = {
    isPending: baseCreateJob.isPending || appCreateJob.isPending,
    mutate: (variables: Parameters<typeof baseCreateJob.mutate>[0], options?: Parameters<typeof baseCreateJob.mutate>[1]) => {
      if (appConfig) appCreateJob.mutate({ ...variables, slug: appConfig.slug }, options);
      else baseCreateJob.mutate(variables, options);
    },
  };
  const editable = (key: string) => !appConfig || appConfig.exposedKeys.includes(key);
  
  const providersQuery = useGetMotionProviders({
    query: {
      queryKey: getGetMotionProvidersQueryKey(),
      enabled: isAuthLoaded && Boolean(isSignedIn),
      refetchInterval: 30000,
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
  const [sceneDescription, setSceneDescription] = useState(String(appConfig?.presetParams.scene_description ?? "A midnight performance beneath sodium streetlights, rain caught in the air, the city stretching behind the performer."));
  const [visualDirection, setVisualDirection] = useState(String(appConfig?.presetParams.visual_direction ?? "35mm cinematic texture, deep indigo shadows, warm amber practicals, restrained film grain, confident editorial framing."));
  const [motionContext, setMotionContext] = useState(String(appConfig?.presetParams.motion_context ?? "a performer moving naturally inside the scene"));
  const [performanceVideo, setPerformanceVideo] = useState("");
  const allowedProviders = useMemo<ProviderId[]>(() => {
    if (!appConfig) return PROVIDERS.map((p) => p.id);
    const ids = String(appConfig.presetParams.motion_providers ?? "").split(",").map((s) => s.trim()).filter((s): s is ProviderId => PROVIDERS.some((p) => p.id === s));
    return ids.length ? ids : PROVIDERS.map((p) => p.id);
  }, [appConfig]);
  const [selected, setSelected] = useState<Set<ProviderId>>(() => {
    const def = appConfig ? String(appConfig.presetParams.motion_provider ?? "seedance") : "seedance";
    const first = (allowedProviders.find((id) => id === def) ?? allowedProviders[0]) as ProviderId;
    return new Set([first]);
  });
  const [performanceAudio, setPerformanceAudio] = useState("");
  const [depthAsset, setDepthAsset] = useState("");
  const [depthStrength, setDepthStrength] = useState(0.7);
  const [selectedEnvironment, setSelectedEnvironment] = useState<{ id: string; name: string } | null>(null);
  const [envPending, setEnvPending] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [providerErrors, setProviderErrors] = useState<Partial<Record<ProviderId, string>>>({});
  const [motionJobs, setMotionJobs] = useState<TrackedJob[]>([]);
  const jobQueries = useQueries({
    queries: motionJobs.map((j) => ({
      queryKey: getGetJobQueryKey(j.id),
      queryFn: () => refreshJob(j.id),
      enabled: Boolean(isSignedIn),
      refetchInterval: (query: { state: { data?: Job } }) => ["completed", "failed", "cancelled"].includes(query.state.data?.status ?? "") ? false : 5000,
    })),
  });
  const [preset, setPreset] = useState<PresetId>(appConfig?.presetParams.preset === "luxury-interior" ? "luxury-interior" : "perform-anywhere");
  const [boardUploadPending, setBoardUploadPending] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  useEffect(() => { setConsent(false); }, [selected, performanceVideo, performanceAudio, selectedChildId]);

  const runStorageKey = userId ? (appConfig ? `aurora-complete-run:${userId}:${appConfig.slug}` : `aurora-perform-run:${userId}`) : null;
  useEffect(() => {
    if (!runStorageKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(runStorageKey) ?? "{}");
      if (appConfig && Number.isSafeInteger(saved.batch) && saved.batch > 0) setActiveBatchId(saved.batch);
      if (Number.isSafeInteger(saved.selection) && saved.selection > 0) setSelectedChildId(saved.selection);
      if (Array.isArray(saved.jobs)) {
        setMotionJobs(saved.jobs.filter((j: TrackedJob) => j && Number.isSafeInteger(j.id) && j.id > 0 && PROVIDERS.some((p) => p.id === j.provider)).map((j: TrackedJob) => ({ id: j.id, provider: j.provider, childId: Number(j.childId) || 0 })));
      }
    } catch { /* Embedded browsers may block session storage. */ }
  }, [runStorageKey, appConfig]);
  useEffect(() => {
    if (!runStorageKey || (!activeBatchId && motionJobs.length === 0)) return;
    try { sessionStorage.setItem(runStorageKey, JSON.stringify({ batch: activeBatchId, jobs: motionJobs, selection: selectedChildId })); } catch { /* Optional reload recovery. */ }
  }, [runStorageKey, activeBatchId, motionJobs, selectedChildId]);

  const activePreset = PRESETS.find((item) => item.id === preset) ?? PRESETS[0];
  const activeReferenceSlots = REFERENCE_SLOTS
    .filter((slot) => activePreset.keys.includes(slot.key))
    .map((slot) => preset === "luxury-interior" ? { ...slot, ...LUXURY_SLOT_OVERRIDES[slot.key] } : slot);
  const boardReferenceSlots = activeReferenceSlots.map((slot) => ({
    ...slot,
    preview: slot.key === "identity"
      ? performerThumbnail
      : slot.key === "outfit"
        ? stylingThumbnail
        : slot.key === "location"
          ? (preset === "luxury-interior" ? vehicleThumbnail : cityThumbnail)
          : slot.key === "pose"
            ? mimicmotionThumbnail
            : vehicleThumbnail,
    previewAlt: `${slot.label} board preview`,
    value: references[slot.key],
  }));
  
  const batches = batchesQuery.data ?? [];
  const activeBatch = useMemo(() => {
    if (activeBatchId !== null) return batches.find((batch) => batch.id === activeBatchId);
    return appConfig ? undefined : batches.find((batch) => batch.batchType === "perform-anywhere-angles");
  }, [activeBatchId, batches, appConfig]);

  const completedChildren = useMemo(
    () => activeBatch?.children.filter((child) => child.status === "completed" && child.outputs?.length) ?? [],
    [activeBatch],
  );
  
  const selectedChild = completedChildren.find((child) => child.id === selectedChildId);
  const selectedOutput = selectedChild?.outputs?.[0];
  const completedCount = activeBatch?.completedJobs ?? 0;
  const allReferencesReady = activePreset.keys.every((key) => Boolean(references[key]));
  const canStart = allReferencesReady && sceneDescription.trim().length >= 2 && visualDirection.trim().length >= 2;
  
  const providerMap = useMemo(() => new Map((providersQuery.data ?? []).map((p) => [p.id as ProviderId, p])), [providersQuery.data]);
  const jobStates: TrackedState[] = motionJobs.map((j, i) => ({ ...j, job: jobQueries[i]?.data as Job | undefined, error: Boolean(jobQueries[i]?.isError) }));
  const lockedProviders = new Set(jobStates.filter((j) => j.childId === selectedChildId && !["failed", "cancelled"].includes(j.job?.status ?? "")).map((j) => j.provider));
  const targets = PROVIDERS.filter((p) => selected.has(p.id) && allowedProviders.includes(p.id) && !lockedProviders.has(p.id));
  const unreadyTargets = targets.filter((p) => providerMap.get(p.id)?.ready !== true);
  const needsVideo = targets.some((p) => p.kind === "video");
  const needsAudio = targets.some((p) => p.kind === "audio");
  const inputsOk = (!needsVideo || Boolean(performanceVideo)) && (!needsAudio || Boolean(performanceAudio));
  const canHandoff = Boolean(selectedOutput && targets.length > 0 && unreadyTargets.length === 0 && inputsOk && consent);
  const toggleProvider = (id: ProviderId, on: boolean) => setSelected((cur) => { const next = new Set(cur); if (on) next.add(id); else next.delete(id); return next; });
  const selectAllReady = () => setSelected(new Set(PROVIDERS.filter((p) => allowedProviders.includes(p.id) && providerMap.get(p.id)?.ready === true).map((p) => p.id)));

  useEffect(() => {
    if (batchesQuery.data && selectedChildId && !completedChildren.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(null);
    }
  }, [completedChildren, selectedChildId, batchesQuery.data]);

  const updateReference = (key: ReferenceKey, filename: string) => {
    if (key === "location") setSelectedEnvironment(null);
    setReferences((current) => ({ ...current, [key]: filename }));
  };

  const handleBoardFiles = async (files: File[]) => {
    if (boardUploadPending || !isSignedIn) return;
    const imageFiles = files.filter(isSupportedImageFile);
    if (imageFiles.length === 0) {
      toast({
        title: "Add image references",
        description: "The Shot Board accepts image files for the identity, outfit, location, pose, and prop roles.",
        variant: "destructive",
      });
      return;
    }

    const emptyKeys = activePreset.keys.filter((key) => !references[key]);
    if (emptyKeys.length === 0) {
      toast({
        title: "The Shot Board is full",
        description: "Use the individual reference cards below to replace a specific asset.",
        variant: "destructive",
      });
      return;
    }

    const oversized = imageFiles.filter((file) => file.size > 20 * 1024 * 1024);
    if (oversized.length > 0) {
      toast({
        title: "Some images are too large",
        description: "Each Shot Board image must be 20 MB or smaller.",
        variant: "destructive",
      });
    }

    const filesToUpload = imageFiles
      .filter((file) => file.size <= 20 * 1024 * 1024)
      .slice(0, emptyKeys.length);
    if (filesToUpload.length === 0) return;

    setBoardUploadPending(true);
    try {
      const uploaded: Array<{ key: ReferenceKey; filename: string }> = [];
      for (const [index, file] of filesToUpload.entries()) {
        const filename = await uploadFile(file, () => undefined, IMAGE_FILE_ACCEPT);
        const key = emptyKeys[index]!;
        uploaded.push({ key, filename });
        if (key === "location") setSelectedEnvironment(null);
        setReferences((current) => ({ ...current, [key]: filename }));
      }
      toast({
        title: "References attached to the Shot Board",
        description: `${uploaded.length} image${uploaded.length === 1 ? "" : "s"} added in board order.`,
      });
    } catch (error) {
      toast({
        title: "Could not attach the references",
        description: error instanceof Error ? error.message : "Try the individual upload cards below.",
        variant: "destructive",
      });
    } finally {
      setBoardUploadPending(false);
    }
  };

  const selectPreset = (nextPreset: PresetId) => {
    if (appConfig || boardUploadPending || envPending) return;
    setSelectedEnvironment(null);
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
    if (envPending) return;
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
        data: buildPerformAnywhereBatchInput({
          name: `${activePreset.label} · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
          preset,
          references,
          sceneDescription,
          visualDirection,
          depthAsset: depthAsset || undefined,
          depthStrength,
        }),
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

  const submitMotion = async () => {
    const fail = (title: string, description: string) => toast({ title, description, variant: "destructive" });
    if (submitting) return;
    if (!selectedOutput || !selectedChild) return fail("Choose a still", "Select a finished angle first.");
    if (targets.length === 0) return fail("Choose a provider", "Select at least one provider that has not already been submitted for this still.");
    if (unreadyTargets.length) return fail("Provider not ready", unreadyTargets.map((p) => `${p.name}: ${providerMap.get(p.id)?.message ?? "readiness unknown"}`).join(" "));
    if (needsVideo && !performanceVideo) return fail("Upload your performance video", "Video providers need the performance clip.");
    if (needsAudio && !performanceAudio) return fail("Upload performance audio", "OmniHuman needs a separate audio file.");
    if (!consent) return fail("Confirm charges", "Accept the cost and third-party upload notice first.");
    setSubmitting(true);
    setProviderErrors({});
    const errors: Partial<Record<ProviderId, string>> = {};
    let created = 0;
    try {
      let importedName: string;
      try {
        const imported = await importOutput.mutateAsync({ data: { filename: selectedOutput.filename, jobId: selectedChild.id, subfolder: selectedOutput.subfolder, type: "output" } });
        importedName = imported.name;
      } catch (error) {
        return fail("Could not prepare the selected still", error instanceof Error ? error.message : "Try again.");
      }
      for (const p of targets) {
        try {
          const params: Record<string, unknown> = {
            source_image: importedName,
            selected_angle: selectedChild.batchIndex ?? 1,
            motion_context: motionContext.trim(),
            aspect_ratio: "16:9",
            ratio: "16:9",
            resolution: "720p",
            duration: 5,
            num_frames: 48,
            scene_description: sceneDescription,
            visual_direction: visualDirection,
            motion_provider: p.id,
          };
          if (p.kind === "video") { params.source_video = performanceVideo; params.performance_video = performanceVideo; }
          else params.audio_file = performanceAudio;
          const data = { workflowId: p.workflowId, params };
          const job = appConfig ? await appCreateJob.mutateAsync({ slug: appConfig.slug, data }) : await baseCreateJob.mutateAsync({ data });
          setMotionJobs((cur) => [...cur, { id: job.id, provider: p.id, childId: selectedChild.id }]);
          created += 1;
        } catch (error) {
          errors[p.id] = error instanceof Error ? error.message : "Could not queue this provider.";
        }
      }
      setProviderErrors(errors);
      setConsent(false);
      const failed = Object.keys(errors).length;
      toast({
        title: failed ? `${created} queued, ${failed} failed` : `${created} motion job${created === 1 ? "" : "s"} queued`,
        description: failed ? "Successful jobs are kept below. Failed providers show their error." : "Progress and results appear below.",
        variant: failed ? "destructive" : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = createBatch.isPending || submitting;

  return (
    <div className={`min-h-[100dvh] bg-[#09080D] text-white animate-in fade-in duration-300 pb-20 pt-8 ${appConfig ? "px-2 sm:px-4" : "px-4 sm:px-12"}`}>
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
              {!appConfig && <Button asChild variant="outline" className="mt-5"><Link href="/apps?workflow=perform-anywhere-complete">Turn into an app <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
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
                   <span className="text-sm font-semibold text-white">Shot Board</span>
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

        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
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
                      disabled={Boolean(appConfig) || boardUploadPending}
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
                   Build the shot board
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">{activePreset.keys.length === 5 ? "Five anchors. One world." : "Three anchors. One interior."}</h2>
                   <p className="max-w-2xl text-sm text-[#BEB2CC]">Attach the full reference room once, then fine-tune any role before rendering the angle audition.</p>
                </div>
                <div data-testid="text-reference-count" className="rounded-full border border-[#B7F54A]/30 bg-[#B7F54A]/10 px-4 py-2 font-mono text-sm font-bold text-[#B7F54A]">
                  {activePreset.keys.filter((key) => Boolean(references[key])).length} / {activePreset.keys.length} uploaded
                </div>
              </div>
              <ShotBoard
                presetLabel={activePreset.label}
                slots={boardReferenceSlots}
                uploadPending={boardUploadPending || envPending}
                canRender={canStart && !createBatch.isPending && !envPending}
                onRender={startAngles}
                onFilesSelected={(files) => { void handleBoardFiles(files); }}
              />
              <EnvironmentPicker
                enabled={isAuthLoaded && Boolean(isSignedIn)}
                selected={selectedEnvironment}
                onPendingChange={setEnvPending}
                onClear={() => { setSelectedEnvironment(null); updateReference("location", ""); }}
                onAttached={(env, filename) => {
                  setSelectedEnvironment({ id: env.id, name: env.name });
                  setReferences((current) => ({ ...current, location: filename }));
                  if (editable("scene_description")) setSceneDescription(env.scenePrompt);
                }}
              />
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
                  <Textarea readOnly={!editable("scene_description")} data-testid="input-scene-description" id="scene-description" value={sceneDescription} onChange={(event) => setSceneDescription(event.target.value)} className="min-h-[160px] resize-none border-[#A779F5]/30 bg-[#09080D] text-sm leading-relaxed text-white placeholder:text-[#BEB2CC]/50 focus-visible:ring-[#B7F54A] rounded-2xl p-4" placeholder="Describe the place, time, energy, and what the viewer should feel." />
                  <p className="text-xs text-[#BEB2CC]">Place and atmosphere. The generative scene prompt starts here.</p>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="visual-direction" className="text-sm font-bold text-white">Visual direction</Label>
                  <Textarea readOnly={!editable("visual_direction")} data-testid="input-visual-direction" id="visual-direction" value={visualDirection} onChange={(event) => setVisualDirection(event.target.value)} className="min-h-[160px] resize-none border-[#A779F5]/30 bg-[#09080D] text-sm leading-relaxed text-white placeholder:text-[#BEB2CC]/50 focus-visible:ring-[#B7F54A] rounded-2xl p-4" placeholder="Name the lens, light, grade, texture, and editorial references." />
                  <p className="text-xs text-[#BEB2CC]">Lens, light, color, and texture. The taste layer that keeps five angles together.</p>
                </div>
              </div>
              <div className="mt-8 rounded-2xl border border-[#A779F5]/30 bg-[#09080D] p-5" data-testid="section-depth-map">
                <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#B7F54A]">Optional depth map</p>
                <p className="mt-2 text-sm leading-relaxed text-[#BEB2CC]">Shared by all five angle stills as ControlNet guidance. The hosted motion providers do not receive the depth map directly; they animate the depth-guided still you select.</p>
                <div className="mt-4 rounded-xl border border-[#A779F5]/20 p-2">
                  <FileUpload accept={IMAGE_FILE_ACCEPT} label="Depth map" description="A grayscale depth image. Leave empty to render without depth guidance." onFileSelect={setDepthAsset} previouslyUploadedName={depthAsset || undefined} />
                </div>
                {depthAsset && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm font-bold text-white"><Label htmlFor="depth-strength">Depth strength</Label><span className="font-mono text-[#B7F54A]">{depthStrength.toFixed(2)}</span></div>
                    <Slider id="depth-strength" data-testid="slider-depth-strength" min={0} max={1} step={0.05} value={[depthStrength]} onValueChange={([v]) => setDepthStrength(v ?? 0.7)} />
                    <button type="button" onClick={() => setDepthAsset("")} className="text-xs font-bold text-[#EF4444]">Remove depth map</button>
                  </div>
                )}
              </div>
              <div className="mt-8 flex flex-col justify-between gap-6 rounded-2xl border border-[#B7F54A]/30 bg-[#B7F54A]/5 p-6 sm:flex-row sm:items-center">
                <div className="flex gap-4 items-start">
                  <LockKeyhole className="h-6 w-6 shrink-0 text-[#B7F54A]" />
                  <p className="max-w-xl text-sm leading-relaxed text-[#BEB2CC]">We will create exactly five children with the camera treatments below. They share your {activePreset.keys.length} references, scene, and visual direction.</p>
                </div>
                <Button data-testid="button-start-angles" onClick={startAngles} disabled={createBatch.isPending || envPending} className="max-w-full shrink-0 rounded-xl bg-[#B7F54A] py-6 px-3 sm:px-8 font-bold text-[#09080D] hover:bg-[#A3E030] shadow-[0_0_20px_rgba(183,245,74,0.3)] transition-all text-sm sm:text-base">
                  {createBatch.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Rendering shot list</> : <><Sparkles className="mr-2 h-5 w-5" />Render shot list once</>}
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-sm font-bold text-white">Motion providers</Label>
                    <div className="flex gap-2">
                      <button type="button" data-testid="button-select-all-ready" onClick={selectAllReady} className="rounded-lg border border-[#A779F5]/30 bg-[#09080D] px-3 py-1.5 text-xs font-bold text-[#BEB2CC] hover:text-white">Select all ready</button>
                      <button type="button" aria-label="Refresh provider readiness" onClick={() => { void providersQuery.refetch(); }} className="rounded-lg border border-[#A779F5]/30 bg-[#09080D] p-2 text-[#BEB2CC] hover:text-white"><RefreshCw className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {providersQuery.isError && (
                    <div className="flex items-center gap-3 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-white">
                      <CircleAlert className="h-4 w-4 shrink-0 text-[#EF4444]" /><span className="flex-1">Provider readiness could not be checked.</span>
                      <Button size="sm" variant="outline" onClick={() => providersQuery.refetch()}>Retry</Button>
                    </div>
                  )}
                  <div className="space-y-3">
                    {PROVIDERS.filter((p) => allowedProviders.includes(p.id)).map((p) => {
                      const status = providerMap.get(p.id);
                      const checked = selected.has(p.id);
                      const locked = lockedProviders.has(p.id);
                      const ready = status?.ready === true;
                      const checking = !status && (providersQuery.isLoading || !isAuthLoaded);
                      return (
                        <label key={p.id} data-testid={`toggle-motion-provider-${p.id}`} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${checked ? "border-[#B7F54A] bg-[#B7F54A]/10" : "border-[#A779F5]/30 bg-[#09080D] hover:border-[#A779F5]/70"} ${locked ? "opacity-70" : ""}`}>
                          <Checkbox checked={checked} disabled={locked} onCheckedChange={(c) => toggleProvider(p.id, c === true)} className="mt-1 border-[#A779F5]" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`text-base font-bold ${checked ? "text-[#B7F54A]" : "text-white"}`}>{p.name}</p>
                              <span className={`inline-flex items-center gap-1.5 rounded-md border border-[#A779F5]/20 bg-[#09080D] px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${ready ? "text-[#B7F54A]" : checking || !status ? "text-[#BEB2CC]" : "text-[#EF4444]"}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-[#B7F54A]" : checking || !status ? "bg-[#BEB2CC]/50" : "bg-[#EF4444]"}`} />
                                {checking ? "Checking" : !isSignedIn ? "Sign in required" : !status ? "Unknown" : ready ? "Ready" : "Not ready"}
                              </span>
                              <span className="font-mono text-[10px] uppercase text-[#BEB2CC]">{p.kind === "audio" ? "audio input" : "video input"}</span>
                            </div>
                            {status && <p className={`mt-1 text-xs leading-relaxed ${ready ? "text-[#BEB2CC]" : "text-white"}`}>{status.message}</p>}
                            {locked && <p className="mt-1 text-xs font-bold text-[#B7F54A]">Already submitted for this still. Pick another still to rerun.</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div data-testid="upload-performance-video" className="mt-8">
                  <div className="bg-[#09080D] rounded-2xl border border-[#A779F5]/30 p-2">
                    <FileUpload
                      accept="video/*"
                      label="Phone performance video"
                      description="Required for Seedance, MimicMotion, and Kling. A clean 3-30 second phone performance works best."
                      onFileSelect={setPerformanceVideo}
                      previouslyUploadedName={performanceVideo || undefined}
                      preview
                      previewPoster={performerThumbnail}
                    />
                  </div>
                </div>
                <div data-testid="upload-performance-audio" className="mt-6">
                  <div className="bg-[#09080D] rounded-2xl border border-[#A779F5]/30 p-2">
                    <FileUpload
                      accept="audio/*"
                      label="Performance audio (OmniHuman)"
                      description="OmniHuman is driven by a separate audio file. Your video is never used as audio."
                      onFileSelect={setPerformanceAudio}
                      previouslyUploadedName={performanceAudio || undefined}
                    />
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  <Label htmlFor="motion-context" className="text-sm font-bold text-white">Motion context</Label>
                  <Textarea readOnly={!editable("motion_context")} data-testid="input-motion-context" id="motion-context" value={motionContext} onChange={(event) => setMotionContext(event.target.value)} className="min-h-[100px] resize-none border-[#A779F5]/30 bg-[#09080D] text-sm leading-relaxed text-white placeholder:text-[#BEB2CC]/50 focus-visible:ring-[#B7F54A] rounded-xl" placeholder="Describe the movement and the scene context so the transfer stays grounded." />
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

                <div className="mt-8 rounded-2xl border border-[#A779F5]/30 bg-[#09080D] p-4">
                  <label className="flex items-start gap-3 text-xs leading-relaxed text-[#BEB2CC]">
                    <Checkbox data-testid="check-motion-consent" checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5 border-[#A779F5]" />
                    <span>
                      I agree to upload this still{needsVideo ? ", my performance video" : ""}{needsAudio ? ", my audio" : ""} to the selected third-party providers and to be charged by each of them.
                      <strong className="mt-1 block text-white" data-testid="text-motion-cost">
                        {targets.length === 0 ? "No providers selected." : `${targets.length} paid job${targets.length === 1 ? "" : "s"} will be submitted: ${targets.map((p) => `${p.name} (${p.charge})`).join("; ")}.`}
                      </strong>
                    </span>
                  </label>
                </div>

                <Button data-testid="button-submit-motion" onClick={() => { void submitMotion(); }} disabled={!canHandoff || busy} className="mt-4 w-full rounded-xl bg-[#A779F5] py-7 text-base font-bold text-white hover:bg-[#8B5CF6] shadow-[0_0_20px_rgba(167,121,245,0.3)] transition-all disabled:opacity-50 disabled:bg-[#A779F5]/30">
                  {importOutput.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Preparing still</> : submitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Queueing motion</> : <><Upload className="mr-2 h-5 w-5" />{`Send ${targets.length || ""} job${targets.length === 1 ? "" : "s"} to render`}</>}
                </Button>

                {!selectedOutput && <p className="mt-4 text-center text-xs font-semibold text-[#BEB2CC]">The handoff unlocks when a finished angle is selected.</p>}
                {selectedOutput && unreadyTargets.length > 0 && (
                  <p data-testid="text-unready-block" className="mt-4 text-center text-xs font-semibold text-[#EF4444]">Not ready: {unreadyTargets.map((p) => p.name).join(", ")}. Deselect them or fix readiness to continue.</p>
                )}
                {selectedOutput && targets.length > 0 && !inputsOk && (
                  <p className="mt-4 text-center text-xs font-semibold text-[#EF4444]">{needsVideo && !performanceVideo ? "Upload the performance video. " : ""}{needsAudio && !performanceAudio ? "Upload the performance audio for OmniHuman." : ""}</p>
                )}
                {!isSignedIn && <p className="mt-4 text-center text-xs font-semibold text-[#BEB2CC]">Sign in to check provider readiness.</p>}
                <MotionResults items={jobStates} errors={providerErrors} onRetry={(i) => { void jobQueries[i]?.refetch(); }} />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}