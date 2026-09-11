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
import { ArrowRight, Clapperboard, Film, Image as ImageIcon, Layers3, Play, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/creation-design/page-header";

type BatchType = "scene-variation" | "finished-video-variation";

const CAMERAS = ["zoom-in", "pan-left", "pan-right", "tilt-up"];
const ASPECTS = ["16:9", "9:16", "1:1"];
const GRADES = ["teal-orange", "warm-vintage", "cold-thriller"];

function MasterPreview({ asset, type }: { asset: string; type: BatchType }) {
  const url = asset ? `/api/comfy/view?filename=${encodeURIComponent(asset)}&subfolder=&type=input` : "";
  return (
    <div className="relative overflow-hidden w-full h-[320px]">
      {asset ? (
        type === "scene-variation" ? (
          <img src={url} alt="Uploaded creative master" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        ) : (
          <video src={url} controls preload="metadata" muted playsInline loop className="absolute inset-0 h-full w-full object-cover opacity-80 z-20" />
        )
      ) : (
        <div className="absolute inset-0 bg-[#09080D] bg-[radial-gradient(circle_at_30%_20%,#A779F5_0%,transparent_35%),radial-gradient(circle_at_70%_70%,#B7F54A_0%,transparent_32%)] opacity-20" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#09080D] via-transparent to-[#09080D]/80 pointer-events-none" />
      <div className="relative z-10 grid h-full grid-cols-[minmax(140px,1fr)_1.7fr] items-center gap-6 p-8 pointer-events-none">
        <div className="rounded-2xl border border-[#B7F54A]/30 bg-[#171120]/90 backdrop-blur-md p-5 shadow-2xl pointer-events-auto">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#B7F54A]">
            <Sparkles className="h-4 w-4" /> Creative master
          </div>
          <p className="mt-3 truncate text-sm text-[#BEB2CC]">
            {asset || "Upload your master to preview it here"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 pointer-events-auto">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="relative aspect-video overflow-hidden rounded-xl border border-[#A779F5]/40 bg-[#171120]/80 p-3 shadow-lg">
              {asset && type === "scene-variation" && <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 grayscale-[50%]" />}
              <span className="relative rounded-full bg-[#09080D]/80 px-2 py-1 text-[10px] font-bold text-[#B7F54A] border border-[#B7F54A]/20">V{item + 1}</span>
              <div className="absolute inset-x-3 bottom-3 h-1 rounded-full bg-[#B7F54A]/40" style={{ width: `${45 + (item % 3) * 18}%` }} />
            </div>
          ))}
        </div>
      </div>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-40 mix-blend-screen">
        <path d="M170 130 C240 130 250 70 340 60 M170 130 C250 130 260 120 340 120 M170 130 C240 130 250 180 340 190" fill="none" stroke="#B7F54A" strokeWidth="1.5" />
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
    <div className="min-h-[100dvh] bg-[#09080D] text-white animate-in fade-in duration-300 pb-20 px-6 sm:px-12 pt-8">
      <div className="max-w-[1440px] mx-auto space-y-12">
        <PageHeader 
          eyebrow="Viral batch studio"
          title="Branch one creative master into a campaign."
          description="Build up to 30 controlled versions. Every output keeps the same shared master, style anchor, and production recipe while its camera, crop, grade, caption treatment, and seed change deliberately."
          visual={<MasterPreview asset={masterAsset} type={batchType} />}
        />

        <div className="grid gap-5 md:grid-cols-2">
          {[
            { type: "scene-variation" as const, title: "New cinematic scenes", copy: "Keep a master reference image and branch it into camera-led scene variations.", icon: ImageIcon },
            { type: "finished-video-variation" as const, title: "Finished video variations", copy: "Recut the same finished clip into platform-ready grades and compositions.", icon: Film },
          ].map((option) => {
            const active = batchType === option.type;
            const Icon = option.icon;
            return (
              <button 
                key={option.type} 
                onClick={() => { setBatchType(option.type); setMasterAsset(""); setIdentityAnchor(""); }}
                className={`overflow-hidden rounded-3xl border text-left transition-all ${active ? "border-[#B7F54A] bg-[#171120] shadow-[0_0_30px_rgba(183,245,74,.15)]" : "border-[#A779F5]/30 bg-[#171120]/50 hover:border-[#A779F5]/70"}`}
              >
                <div className={`flex aspect-[4/1] items-center justify-center ${active ? "bg-[#B7F54A]/10" : "bg-[#09080D]"}`}>
                  <Icon className={`h-12 w-12 ${active ? "text-[#B7F54A]" : "text-[#BEB2CC]/60"}`} />
                </div>
                <div className="p-6">
                  <p className={`font-bold text-lg ${active ? "text-[#B7F54A]" : "text-white"}`}>{option.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#BEB2CC]">{option.copy}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_.6fr]">
          <section className="space-y-6 rounded-3xl border border-[#A779F5]/30 bg-[#171120] p-6 sm:p-8 shadow-xl">
            <div>
              <h2 className="text-xl font-bold text-white">Shared creative master</h2>
              <p className="mt-1 text-sm text-[#BEB2CC]">These anchors are copied into every independently scheduled child job.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <Label className="text-[#BEB2CC]">Batch name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} className="border-[#A779F5]/30 bg-[#09080D] text-white h-12 rounded-xl focus-visible:ring-[#B7F54A]" />
              </div>
              <div className="bg-[#09080D] border border-[#A779F5]/30 p-2 rounded-xl">
                <FileUpload accept={isScene ? "image/*" : "video/*"} label={isScene ? "Master reference image" : "Finished master video"} description={isScene ? "This exact image is supplied to every AnimateDiff child." : "This exact video is graded and reframed by every child."} onFileSelect={(filename) => { setMasterAsset(filename); if (isScene) setIdentityAnchor(filename); }} previouslyUploadedName={masterAsset} />
              </div>
            </div>
            {isScene && (
              <div className="space-y-3">
                <Label className="text-[#BEB2CC]">Identity / reference anchor <span className="text-[#EF4444]">*</span></Label>
                <Input value={identityAnchor} onChange={(event) => setIdentityAnchor(event.target.value)} placeholder="Paste the uploaded master image filename" className="border-[#A779F5]/30 bg-[#09080D] text-white h-12 rounded-xl focus-visible:ring-[#B7F54A]" />
                <p className="text-xs text-[#BEB2CC]">Required: a plain checkpoint does not preserve identity. Confirm the uploaded reference used by every child.</p>
              </div>
            )}
            <div className="space-y-3">
              <Label className="text-[#BEB2CC]">{isScene ? "Scene direction" : "Campaign direction"}</Label>
              <Textarea value={scenePrompt} onChange={(event) => setScenePrompt(event.target.value)} className="min-h-32 border-[#A779F5]/30 bg-[#09080D] text-white rounded-xl focus-visible:ring-[#B7F54A]" />
            </div>
            <div className="space-y-3">
              <Label className="text-[#BEB2CC]">{isScene ? "Style + palette anchor" : "Campaign notes"}</Label>
              <Textarea value={styleAnchor} onChange={(event) => setStyleAnchor(event.target.value)} className="min-h-24 border-[#A779F5]/30 bg-[#09080D] text-white rounded-xl focus-visible:ring-[#B7F54A]" />
              <p className="text-xs text-[#BEB2CC]">{isScene ? "This style language is included in each scene-generation prompt." : "Saved with each child for review; the actual finished-video look comes from the color-grade controls above."}</p>
            </div>
          </section>

          <aside className="space-y-6 rounded-3xl border border-[#A779F5]/30 bg-[#171120] p-6 sm:p-8 shadow-xl">
            <div className="rounded-2xl border border-[#A779F5]/30 bg-[#09080D] p-5">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
                <Clapperboard className="h-5 w-5 text-[#B7F54A]" /> 
                GPU-safe queue
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#BEB2CC]">{requirementText}</p>
            </div>
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-[#BEB2CC]">Batch size</Label>
                <span className="font-mono text-lg font-bold text-[#B7F54A]">{batchSize}</span>
              </div>
              <Slider value={[batchSize]} min={1} max={30} step={1} onValueChange={([value]) => setBatchSize(value ?? 1)} />
              <p className="text-sm text-[#BEB2CC]">{summary}</p>
            </div>
            <div className="space-y-3 pt-4">
              <Label className="text-[#BEB2CC]">Seed strategy</Label>
              <div className="grid grid-cols-3 gap-3">
                {(["incremental", "fixed", "random"] as const).map((strategy) => (
                  <button 
                    key={strategy} 
                    onClick={() => setSeedStrategy(strategy)} 
                    className={`rounded-xl border py-3 text-xs font-bold capitalize transition-all ${seedStrategy === strategy ? "border-[#B7F54A] bg-[#B7F54A]/10 text-[#B7F54A]" : "border-[#A779F5]/30 text-[#BEB2CC] hover:border-[#A779F5]/60 hover:text-white"}`}
                  >
                    {strategy}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 pt-4">
              <Label className="text-[#BEB2CC]">Caption treatment</Label>
              <Input value={captionTreatment} onChange={(event) => setCaptionTreatment(event.target.value)} className="border-[#A779F5]/30 bg-[#09080D] h-12 rounded-xl focus-visible:ring-[#B7F54A]" />
            </div>
            {!isScene && (
              <div className="space-y-3 pt-4">
                <Label className="text-[#BEB2CC]">Maximum output duration</Label>
                <div className="flex items-center gap-4">
                  <Slider value={[duration]} min={1} max={60} step={1} onValueChange={([value]) => setDuration(value ?? 12)} className="flex-1" />
                  <span className="w-12 text-right font-mono text-lg font-bold text-[#B7F54A]">{duration}s</span>
                </div>
              </div>
            )}
            <div className="pt-6">
              <Button 
                className="w-full rounded-xl bg-[#B7F54A] py-7 text-base font-bold text-[#09080D] hover:bg-[#A3E030] shadow-[0_0_20px_rgba(183,245,74,0.3)] hover:shadow-[0_0_30px_rgba(183,245,74,0.5)] transition-all" 
                disabled={createBatch.isPending} 
                onClick={submit}
              >
                {createBatch.isPending ? "Building batch…" : <><Play className="mr-2 h-5 w-5 fill-current" /> Start {batchSize} variations <ArrowRight className="ml-2 h-5 w-5" /></>}
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
