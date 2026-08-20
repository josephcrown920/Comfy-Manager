import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useCreateBatch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Clapperboard, Film, Image as ImageIcon, Layers3, Play, Sparkles, Video } from "lucide-react";

type BatchType = "scene-variation" | "finished-video-variation";

const CAMERAS = ["zoom-in", "pan-left", "pan-right", "tilt-up"];
const ASPECTS = ["16:9", "9:16", "1:1"];
const GRADES = ["teal-orange", "warm-vintage", "cold-thriller"];

function MasterPreview({ asset, type }: { asset: string; type: BatchType }) {
  const url = asset ? `/api/comfy/view?filename=${encodeURIComponent(asset)}&subfolder=&type=input` : "";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#39305f] bg-[#100d20] min-h-[260px]">
      {asset ? (
        type === "scene-variation" ? (
          <img src={url} alt="Uploaded creative master" className="absolute inset-0 h-full w-full object-cover opacity-75" />
        ) : (
          <video src={url} muted playsInline autoPlay loop className="absolute inset-0 h-full w-full object-cover opacity-70" />
        )
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#3c3267,transparent_35%),radial-gradient(circle_at_70%_70%,#314220,transparent_32%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#100d20]/70 via-transparent to-[#100d20]/80" />
      <div className="relative z-10 grid min-h-[260px] grid-cols-[minmax(120px,1fr)_1.7fr] items-center gap-4 p-5">
        <div className="rounded-xl border border-[#e8f724]/50 bg-[#17112c]/90 p-3 shadow-xl">
          <div className="flex items-center gap-2 text-xs font-bold text-[#e8f724]"><Sparkles className="h-3.5 w-3.5" /> Creative master</div>
          <p className="mt-2 truncate text-xs text-[#d4ceed]">{asset || "Upload your master to preview it here"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="relative aspect-video overflow-hidden rounded-lg border border-[#776ca4]/40 bg-[#211b3c]/90 p-2 shadow-lg">
              {asset && type === "scene-variation" && <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
              <span className="relative rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-[#e8f724]">V{item + 1}</span>
              <div className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-[#e8f724]/60" style={{ width: `${45 + (item % 3) * 18}%` }} />
            </div>
          ))}
        </div>
      </div>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-50">
        <path d="M170 130 C240 130 250 70 340 60 M170 130 C250 130 260 120 340 120 M170 130 C240 130 250 180 340 190" fill="none" stroke="#e8f724" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export default function Batches() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createBatch = useCreateBatch();
  const [batchType, setBatchType] = useState<BatchType>("scene-variation");
  const [name, setName] = useState("Cinematic master variations");
  const [masterAsset, setMasterAsset] = useState("");
  const [identityAnchor, setIdentityAnchor] = useState("");
  const [scenePrompt, setScenePrompt] = useState("Luxury performance film with kinetic movement and editorial framing");
  const [styleAnchor, setStyleAnchor] = useState("High-contrast cinematic lighting, polished black, warm highlights, premium automotive campaign");
  const [batchSize, setBatchSize] = useState(8);
  const [seedStrategy, setSeedStrategy] = useState<"incremental" | "fixed" | "random">("incremental");
  const [captionTreatment, setCaptionTreatment] = useState("safe-lower-third");
  const [duration, setDuration] = useState(12);
  const isScene = batchType === "scene-variation";
  const requirementText = isScene
    ? "Uses AnimateDiff Evolved plus an image reference. The same master image is passed into every child; it is an anchor, not a guarantee of identity without a compatible reference/identity node on your GPU."
    : "Uses VideoHelperSuite, ProPost, and ColorCorrect. Variants preserve the uploaded finished video while changing its grade, output frame, duration, and captions-safe treatment.";
  const ready = Boolean(masterAsset && scenePrompt.trim() && styleAnchor.trim() && (!isScene || identityAnchor.trim()));

  const summary = useMemo(() => `${batchSize} independent ${isScene ? "scene" : "finished-video"} variations`, [batchSize, isScene]);

  const submit = () => {
    if (!ready) {
      toast({ title: "Finish the shared master setup", description: isScene ? "Add the uploaded reference image as the identity anchor." : "Upload a finished video and describe its creative direction.", variant: "destructive" });
      return;
    }
    createBatch.mutate({
      data: {
        name,
        batchType,
        batchSize,
        masterAsset,
        identityAnchor: isScene ? identityAnchor : undefined,
        scenePrompt,
        styleAnchor,
        cameraTreatments: isScene ? CAMERAS : undefined,
        aspectRatios: ASPECTS,
        colorGrades: GRADES,
        captionTreatment,
        seedStrategy,
        baseSeed: 24681357,
        durationSeconds: isScene ? undefined : duration,
      },
    }, {
      onSuccess: () => {
        toast({ title: "Creative batch started", description: "The first child is running. The rest will queue one at a time on your connected GPU." });
        setLocation("/jobs");
      },
      onError: (error: Error) => toast({ title: "Could not start this batch", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-in fade-in duration-300">
      <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#e8f724]">Viral batch studio</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#f0eeff] sm:text-4xl">Branch one creative master into a campaign.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#a79dc7]">Build up to 30 controlled versions. Every output keeps the same shared master, style anchor, and production recipe while its camera, crop, grade, caption treatment, and seed change deliberately.</p>
        </div>
        <div className="rounded-2xl border border-[#e8f724]/30 bg-[#e8f724]/10 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#e8f724]"><Layers3 className="h-4 w-4" /> GPU-safe queue</div>
          <p className="mt-1 text-xs leading-relaxed text-[#c8c0de]">Only one variant renders at a time. Failed versions remain independently retryable without losing the rest of the batch.</p>
        </div>
      </div>

      <MasterPreview asset={masterAsset} type={batchType} />

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { type: "scene-variation" as const, title: "New cinematic scenes", copy: "Keep a master reference image and branch it into camera-led scene variations.", icon: ImageIcon },
          { type: "finished-video-variation" as const, title: "Finished video variations", copy: "Recut the same finished clip into platform-ready grades and compositions.", icon: Film },
        ].map((option) => {
          const active = batchType === option.type;
          const Icon = option.icon;
          return <button key={option.type} onClick={() => { setBatchType(option.type); setMasterAsset(""); setIdentityAnchor(""); }}
            className={`overflow-hidden rounded-2xl border text-left transition-all ${active ? "border-[#e8f724] bg-[#282044] shadow-[0_0_28px_rgba(232,247,36,.12)]" : "border-[#39305f] bg-[#1e1a38] hover:border-[#776ca4]"}`}>
            <div className={`flex aspect-[3/1] items-center justify-center ${active ? "bg-[radial-gradient(circle,#5b6440_0%,#1e1a38_65%)]" : "bg-[#17132d]"}`}><Icon className={`h-10 w-10 ${active ? "text-[#e8f724]" : "text-[#776ca4]"}`} /></div>
            <div className="p-4"><p className="font-bold text-[#f0eeff]">{option.title}</p><p className="mt-1 text-xs leading-relaxed text-[#9d93bb]">{option.copy}</p></div>
          </button>;
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_.72fr]">
        <section className="space-y-5 rounded-2xl border border-[#39305f] bg-[#1e1a38] p-5 sm:p-6">
          <div><h2 className="text-lg font-bold text-[#f0eeff]">Shared creative master</h2><p className="mt-1 text-xs text-[#9d93bb]">These anchors are copied into every independently scheduled child job.</p></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label>Batch name</Label><Input value={name} onChange={(event) => setName(event.target.value)} className="border-[#39305f] bg-[#151127]" /></div>
            <FileUpload accept={isScene ? "image/*" : "video/*"} label={isScene ? "Master reference image" : "Finished master video"} description={isScene ? "This exact image is supplied to every AnimateDiff child." : "This exact video is graded and reframed by every child."} onFileSelect={(filename) => { setMasterAsset(filename); if (isScene) setIdentityAnchor(filename); }} />
          </div>
          {isScene && <div className="space-y-2"><Label>Identity / reference anchor <span className="text-[#e8f724]">*</span></Label><Input value={identityAnchor} onChange={(event) => setIdentityAnchor(event.target.value)} placeholder="Paste the uploaded master image filename" className="border-[#39305f] bg-[#151127]" /><p className="text-xs text-[#9d93bb]">Required: a plain checkpoint does not preserve identity. Confirm the uploaded reference used by every child.</p></div>}
          <div className="space-y-2"><Label>{isScene ? "Scene direction" : "Campaign direction"}</Label><Textarea value={scenePrompt} onChange={(event) => setScenePrompt(event.target.value)} className="min-h-24 border-[#39305f] bg-[#151127]" /></div>
          <div className="space-y-2"><Label>{isScene ? "Style + palette anchor" : "Campaign notes"}</Label><Textarea value={styleAnchor} onChange={(event) => setStyleAnchor(event.target.value)} className="min-h-20 border-[#39305f] bg-[#151127]" /><p className="text-xs text-[#9d93bb]">{isScene ? "This style language is included in each scene-generation prompt." : "Saved with each child for review; the actual finished-video look comes from the color-grade controls above."}</p></div>
        </section>

        <aside className="space-y-5 rounded-2xl border border-[#39305f] bg-[#151127] p-5 sm:p-6">
          <div className="rounded-xl border border-[#39305f] bg-[#211b3c] p-4"><div className="flex items-center gap-2 text-sm font-bold text-[#f0eeff]"><Clapperboard className="h-4 w-4 text-[#e8f724]" /> Required GPU setup</div><p className="mt-2 text-xs leading-relaxed text-[#a79dc7]">{requirementText}</p></div>
          <div className="space-y-3"><div className="flex items-center justify-between"><Label>Batch size</Label><span className="font-mono text-sm font-bold text-[#e8f724]">{batchSize}</span></div><Slider value={[batchSize]} min={1} max={30} step={1} onValueChange={([value]) => setBatchSize(value ?? 1)} /><p className="text-xs text-[#9d93bb]">{summary}</p></div>
          <div className="space-y-2"><Label>Seed strategy</Label><div className="grid grid-cols-3 gap-2">{(["incremental", "fixed", "random"] as const).map((strategy) => <button key={strategy} onClick={() => setSeedStrategy(strategy)} className={`rounded-lg border px-2 py-2 text-xs font-semibold capitalize ${seedStrategy === strategy ? "border-[#e8f724] bg-[#e8f724]/10 text-[#e8f724]" : "border-[#39305f] text-[#9d93bb]"}`}>{strategy}</button>)}</div></div>
          <div className="space-y-2"><Label>Caption treatment</Label><Input value={captionTreatment} onChange={(event) => setCaptionTreatment(event.target.value)} className="border-[#39305f] bg-[#211b3c]" /></div>
          {!isScene && <div className="space-y-2"><Label>Maximum output duration</Label><div className="flex items-center gap-3"><Slider value={[duration]} min={1} max={60} step={1} onValueChange={([value]) => setDuration(value ?? 12)} /><span className="w-10 text-right font-mono text-xs text-[#e8f724]">{duration}s</span></div></div>}
          <Button className="w-full rounded-full bg-[#e8f724] py-6 font-bold text-[#0d0b1a] hover:bg-[#d4e010]" disabled={createBatch.isPending} onClick={submit}>
            {createBatch.isPending ? "Building batch…" : <><Play className="mr-2 h-4 w-4 fill-current" /> Start {batchSize} variations <ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
        </aside>
      </div>
    </div>
  );
}