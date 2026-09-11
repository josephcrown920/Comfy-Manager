import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Copy, ExternalLink, Rocket, KeyRound, Terminal, Cpu, Link2, AlertCircle, Play, Globe, Cloud } from "lucide-react";
import launcherScript from "@/assets/launcher/comfyui_launcher.py?raw";
import { PageHeader } from "@/components/operations-design/PageHeader";

const SECRETS = [
  {
    key: "NGROK_AUTHTOKEN",
    required: true,
    note: "Free ngrok account token — dashboard.ngrok.com → Your Authtoken",
  },
  {
    key: "TUNNEL_USER",
    required: true,
    note: "Username protecting your tunnel — you pick it. Keeps strangers from running jobs on your GPU",
  },
  {
    key: "TUNNEL_PASS",
    required: true,
    note: "Password protecting your tunnel — 8+ characters, you pick it",
  },
  {
    key: "HF_TOKEN",
    required: true,
    note: "Hugging Face token (huggingface.co/settings/tokens). Needed for gated SDXL/SVD model weights",
  },
  {
    key: "NGROK_STATIC_DOMAIN",
    required: false,
    note: "Free static domain (dashboard.ngrok.com/domains) — keeps the same URL across restarts",
  },
  {
    key: "COMFY_CAPABILITIES",
    required: false,
    note: "What to install: image, video, lipsync, motion, cinematic (default auto-picks by GPU VRAM)",
  },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-[#1a1325] border-[#2d2650] text-[#BEB2CC] hover:bg-[#2d2650] hover:text-white rounded-xl h-9"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="mr-2 h-4 w-4 text-[#B7F54A]" /> : <Copy className="mr-2 h-4 w-4" />}
      {copied ? "Copied to Clipboard" : label}
    </Button>
  );
}

function StepCard({ n, icon: Icon, title, children }: { n: number; icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#171120] border border-[#2d2650] rounded-3xl overflow-hidden group hover:border-[#A779F5]/30 transition-colors relative">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-[#A779F5] to-transparent opacity-50" />
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-[#09080D] border border-[#2d2650] flex items-center justify-center shrink-0 shadow-inner">
            <span className="text-[#A779F5] font-bold font-mono">{n}</span>
          </div>
          <h2 className="flex items-center gap-3 text-xl font-bold text-white">
            <Icon className="h-5 w-5 text-[#BEB2CC]" />
            {title}
          </h2>
        </div>
        <div className="pl-14 text-sm text-[#BEB2CC] space-y-4">{children}</div>
      </div>
    </div>
  );
}

function LaunchVisual() {
  return (
    <div className="absolute inset-0 bg-[#09080D] overflow-hidden flex items-center justify-center pointer-events-none" aria-hidden="true">
      <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 border border-white/10 rounded-md z-20">
        <span className="text-[10px] font-mono text-[#7b72a8] uppercase tracking-wider">Illustrative example (NOT live)</span>
      </div>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#BEB2CC 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      
      <div className="relative z-10 w-full h-full flex items-center justify-center gap-8 md:gap-16 px-12">
        <div className="w-24 h-24 rounded-3xl bg-[#171120] border-2 border-[#A779F5] flex items-center justify-center shadow-[0_0_30px_rgba(167,121,245,0.2)] relative z-10 group hover:scale-105 transition-transform duration-500">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#A779F5]/20 to-transparent rounded-3xl" />
          <Cloud className="w-10 h-10 text-[#A779F5]" />
        </div>

        <div className="flex-1 max-w-[200px] h-0.5 bg-gradient-to-r from-[#A779F5]/50 via-[#B7F54A]/50 to-[#B7F54A]/50 relative">
          <div className="absolute inset-0 overflow-hidden">
            <div className="w-1/2 h-full bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-[shimmer_2s_infinite]" />
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#09080D] border border-[#2d2650] px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Terminal className="w-3 h-3 text-[#BEB2CC]" />
          </div>
        </div>

        <div className="w-24 h-24 rounded-3xl bg-[#171120] border-2 border-[#B7F54A] flex items-center justify-center shadow-[0_0_30px_rgba(183,245,74,0.2)] relative z-10 group hover:scale-105 transition-transform duration-500">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#B7F54A]/20 to-transparent rounded-3xl" />
          <Rocket className="w-10 h-10 text-[#B7F54A]" />
        </div>
      </div>
    </div>
  );
}

export default function Launch() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <PageHeader 
        title="Provision GPU Infrastructure"
        description="Run ComfyUI on a free cloud GPU in minutes. One script installs the engine, nodes, and models, then provides a secure tunnel URL."
        visual={<LaunchVisual />}
        actions={
          <div className="flex gap-2">
            <span className="px-3 py-1 rounded-md bg-[#B7F54A]/10 text-[#B7F54A] border border-[#B7F54A]/20 text-[10px] uppercase font-bold tracking-wider">Free Compute</span>
            <span className="px-3 py-1 rounded-md bg-[#A779F5]/10 text-[#A779F5] border border-[#A779F5]/20 text-[10px] uppercase font-bold tracking-wider">Headless Ready</span>
          </div>
        }
      />

      <div className="space-y-8 animate-in fade-in duration-500 delay-150 fill-mode-both">
        <Tabs defaultValue="colab" className="w-full">
          <div className="p-1 bg-[#171120] border border-[#2d2650] rounded-xl flex w-fit mb-6 shadow-inner">
            <TabsList className="bg-transparent border-0 h-auto p-0 flex gap-1">
              <TabsTrigger value="colab" className="rounded-lg px-6 py-2.5 text-sm font-bold data-[state=active]:bg-[#2d2650] data-[state=active]:text-white text-[#7b72a8]">Google Colab</TabsTrigger>
              <TabsTrigger value="kaggle" className="rounded-lg px-6 py-2.5 text-sm font-bold data-[state=active]:bg-[#2d2650] data-[state=active]:text-white text-[#7b72a8]">Kaggle</TabsTrigger>
              <TabsTrigger value="vast" className="rounded-lg px-6 py-2.5 text-sm font-bold data-[state=active]:bg-[#2d2650] data-[state=active]:text-white text-[#7b72a8]">Vast.ai</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="colab" className="mt-0 outline-none">
            <div className="bg-[#A779F5]/5 border border-[#A779F5]/20 p-5 rounded-2xl flex gap-4 text-sm text-[#BEB2CC] items-start">
              <AlertCircle className="h-5 w-5 text-[#A779F5] shrink-0 mt-0.5" />
              <div>
                <p className="leading-relaxed">
                  Free tier provisions an <strong className="text-white">NVIDIA T4 (16GB VRAM)</strong>. Sufficient for image generation, AnimateDiff (512px), and lip sync.
                  SVD and motion control require higher VRAM (Colab Pro+ A100).
                  Sessions disconnect when idle; re-run the cell to resume.
                </p>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="kaggle" className="mt-0 outline-none">
            <div className="bg-[#B7F54A]/5 border border-[#B7F54A]/20 p-5 rounded-2xl flex gap-4 text-sm text-[#BEB2CC] items-start">
              <AlertCircle className="h-5 w-5 text-[#B7F54A] shrink-0 mt-0.5" />
              <div>
                <p className="leading-relaxed">
                  Free tier yields ~12h sessions via weekly quota (T4/P100, 16GB VRAM). Ensure <strong className="text-white">GPU ON</strong> and <strong className="text-white">Internet ON</strong> are configured in settings. Inject variables via <strong className="text-white">Add-ons → Secrets</strong>.
                </p>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="vast" className="mt-0 outline-none">
            <div className="bg-[#09080D] border border-[#2d2650] p-5 rounded-2xl flex gap-4 text-sm text-[#BEB2CC] items-start">
              <Globe className="h-5 w-5 text-[#7b72a8] shrink-0 mt-0.5" />
              <div>
                <p className="leading-relaxed">
                  Provision a GPU instance with <strong className="text-white">Internet Access</strong> enabled. Execute the bootstrap script in the terminal. Excellent for long-running sessions on dedicated high-end cards.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-6 pt-4">
          <StepCard n={1} icon={Terminal} title="Initialize Notebook Environment">
            <p className="text-base text-[#BEB2CC]">Create a new instance and bind a hardware accelerator.</p>
            <div className="flex flex-wrap gap-3 py-2">
              <Button asChild className="bg-[#2d2650] text-white hover:bg-[#4a4269] rounded-xl px-6 h-10 font-bold">
                <a href="https://colab.new" target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Google Colab
                </a>
              </Button>
              <Button asChild variant="outline" className="bg-transparent border-[#2d2650] text-white hover:bg-[#1a1325] rounded-xl px-6 h-10 font-bold">
                <a href="https://www.kaggle.com/code" target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Kaggle
                </a>
              </Button>
            </div>
            <div className="bg-[#09080D] border border-[#2d2650] p-3 rounded-lg flex items-center gap-3">
              <span className="px-2 py-0.5 bg-[#1a1325] rounded text-xs font-mono text-[#A779F5]">Colab Flow</span>
              <span className="text-xs text-[#7b72a8]">Runtime → Change runtime type → T4 GPU → Save</span>
            </div>
          </StepCard>

          <StepCard n={2} icon={KeyRound} title="Provision Secrets">
            <p className="text-base text-[#BEB2CC]">
              Inject required credentials. In Colab, click the key icon (ensure notebook access is toggled ON). In Kaggle, use <span className="text-white font-mono bg-[#09080D] px-1.5 py-0.5 rounded border border-[#2d2650]">Add-ons → Secrets</span>.
            </p>
            <div className="rounded-2xl border border-[#2d2650] bg-[#09080D] overflow-hidden">
              {SECRETS.map((s, i) => (
                <div key={s.key} className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 p-4 ${i !== SECRETS.length - 1 ? 'border-b border-[#2d2650]' : ''}`}>
                  <code className="text-xs font-mono font-bold text-[#A779F5] sm:w-48 shrink-0">{s.key}</code>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider w-fit shrink-0 ${s.required ? "bg-[#B7F54A]/10 text-[#B7F54A] border border-[#B7F54A]/20" : "bg-[#2d2650] text-[#7b72a8]"}`}>
                    {s.required ? "Required" : "Optional"}
                  </span>
                  <span className="text-xs text-[#BEB2CC] leading-relaxed">{s.note}</span>
                </div>
              ))}
            </div>
          </StepCard>

          <StepCard n={3} icon={Cpu} title="Execute Bootstrap Script">
            <p className="text-base text-[#BEB2CC]">
              Run the following payload in a single cell. It handles all dependency resolution and model acquisition, subsequently surfacing a public ingress URL.
            </p>
            
            <div className="flex items-center justify-between mt-6 mb-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#7b72a8] bg-[#09080D] px-2 py-1 rounded-md border border-[#2d2650]">comfyui_launcher.py</span>
              <CopyButton text={launcherScript} label="Copy Full Payload" />
            </div>
            
            <div className="relative group/code">
              <pre className="max-h-[400px] overflow-auto rounded-2xl border border-[#2d2650] bg-[#09080D] p-5 text-xs font-mono leading-relaxed text-[#A779F5] shadow-inner">
                {launcherScript}
              </pre>
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#09080D] to-transparent pointer-events-none rounded-b-2xl" />
            </div>
          </StepCard>

          <StepCard n={4} icon={Link2} title="Establish Link">
            <p className="text-base text-[#BEB2CC] leading-relaxed">
              Upon console output stating <code className="text-[#B7F54A] bg-[#09080D] px-1.5 py-0.5 rounded border border-[#2d2650]">ComfyUI is LIVE</code>, capture the complete URL block—inclusive of tunnel credentials (e.g. <code className="text-[#A779F5] bg-[#09080D] px-1.5 py-0.5 rounded border border-[#2d2650]">https://user:pass@domain</code>)—and commit it to your infrastructure settings.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-[#09080D] border border-[#2d2650] p-4 rounded-2xl">
              <div className="flex-1">
                <p className="text-sm font-bold text-white mb-1">Finalize Setup</p>
                <p className="text-xs text-[#7b72a8]">Commit URL to route all queues to your cloud GPU.</p>
              </div>
              <Link href="/settings">
                <Button className="bg-[#B7F54A] text-[#09080D] hover:bg-[#a4de3a] font-bold rounded-xl px-6 h-10 w-full sm:w-auto shadow-lg shadow-[#B7F54A]/20">
                  Open Settings
                </Button>
              </Link>
            </div>
          </StepCard>
        </div>
      </div>
    </div>
  );
}
