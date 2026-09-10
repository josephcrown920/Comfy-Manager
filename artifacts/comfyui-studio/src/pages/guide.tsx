import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Terminal, Key, Wifi, Monitor, Cloud, Layers, FileText, Zap } from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/operations-design/PageHeader";
import { Button } from "react-day-picker";

function GuideVisual() {
  return (
    <div className="absolute inset-0 bg-[#09080D] overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#BEB2CC 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center pt-8">
        <div className="flex gap-4 mb-4">
          <div className="h-12 border border-[#2d2650] bg-[#171120] rounded-xl flex items-center px-4 gap-3">
            <Cloud className="w-5 h-5 text-[#BEB2CC]" />
            <div className="h-2 w-16 bg-[#BEB2CC]/30 rounded-full" />
          </div>
          <div className="h-12 border border-[#A779F5]/40 bg-[#171120] rounded-xl flex items-center px-4 gap-3 shadow-[0_0_15px_rgba(167,121,245,0.15)] relative">
            <Monitor className="w-5 h-5 text-[#A779F5]" />
            <div className="h-2 w-24 bg-[#A779F5]/50 rounded-full" />
            <div className="absolute -bottom-6 left-1/2 w-0.5 h-6 bg-gradient-to-b from-[#A779F5]/50 to-transparent -translate-x-1/2" />
          </div>
          <div className="h-12 border border-[#2d2650] bg-[#171120] rounded-xl flex items-center px-4 gap-3">
            <Terminal className="w-5 h-5 text-[#BEB2CC]" />
            <div className="h-2 w-12 bg-[#BEB2CC]/30 rounded-full" />
          </div>
        </div>
        
        <div className="relative w-full max-w-[400px]">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#B7F54A]/30 to-transparent -translate-y-1/2" />
          <div className="h-16 border-2 border-[#B7F54A] bg-[#B7F54A]/10 rounded-xl flex items-center justify-between px-6 shadow-[0_0_30px_rgba(183,245,74,0.15)] relative z-10 backdrop-blur-md">
            <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-[#B7F54A]" />
              <div className="w-2 h-2 rounded-full bg-[#B7F54A]/50" />
              <div className="w-2 h-2 rounded-full bg-[#B7F54A]/20" />
            </div>
            <Zap className="w-6 h-6 text-[#B7F54A]" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  badge?: string;
  content: React.ReactNode;
}

function Accordion({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState<string | null>(sections[0]?.id ?? null);
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s.id} id={`section-${s.id}`} className="border border-[#2d2650] rounded-3xl overflow-hidden bg-[#171120] transition-colors hover:border-[#A779F5]/30">
          <button
            className="w-full flex items-center justify-between gap-4 px-6 py-5 bg-transparent hover:bg-[#231f42]/50 transition-colors text-left"
            onClick={() => setOpen(open === s.id ? null : s.id)}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${open === s.id ? "bg-[#B7F54A]/10 text-[#B7F54A] border border-[#B7F54A]/20" : "bg-[#09080D] text-[#A779F5] border border-[#2d2650]"}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white text-base">{s.title}</span>
                  {s.badge && (
                    <span className="px-2 py-0.5 rounded-md bg-[#A779F5]/10 text-[#A779F5] border border-[#A779F5]/20 text-[10px] uppercase font-bold tracking-wider hidden sm:inline">{s.badge}</span>
                  )}
                </div>
              </div>
            </div>
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-colors ${open === s.id ? "border-[#B7F54A]/50 text-[#B7F54A] bg-[#B7F54A]/10" : "border-[#2d2650] text-[#7b72a8] bg-[#09080D]"}`}>
              {open === s.id
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>
          {open === s.id && (
            <div className="px-6 pb-8 pt-2 text-sm text-[#BEB2CC] space-y-6">
              {s.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#B7F54A]/10 text-[#B7F54A] border border-[#B7F54A]/20 text-xs font-bold font-mono">{n}</span>
      <div className="flex-1 leading-relaxed mt-0.5">{children}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-[#09080D] border border-[#2d2650] rounded-xl px-4 py-3 font-mono text-xs text-[#A779F5] leading-relaxed whitespace-pre-wrap break-all overflow-x-auto shadow-inner">
      {children}
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#09080D] border border-[#2d2650] rounded-md px-1.5 py-0.5 font-mono text-xs text-[#A779F5] break-all">{children}</code>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 bg-[#A779F5]/5 border border-[#A779F5]/20 rounded-2xl text-sm text-[#BEB2CC]">
      <div className="w-6 h-6 rounded-full bg-[#A779F5]/20 flex items-center justify-center shrink-0">
        <span className="text-[#A779F5] text-xs font-bold">i</span>
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[#B7F54A] hover:text-[#a4de3a] transition-colors underline underline-offset-4 inline-flex items-center gap-1.5 font-medium">
      {children} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

const SECTIONS: Section[] = [
  {
    id: "how-it-works",
    icon: Layers,
    title: "Connection Architecture",
    badge: "Start Here",
    content: (
      <div className="space-y-6">
        <p className="text-base">
          Studio operates as a decoupled frontend that orchestrates your existing <strong className="text-white">ComfyUI server</strong>. We never run inference directly — your workflows securely execute on the designated GPU endpoints you provide.
        </p>
        <p>Regardless of your infrastructure provider, the connection flow remains identical:</p>
        <div className="space-y-4 pl-2 border-l border-[#2d2650] ml-3 pb-2 pt-2">
          <Step n={1}>Initialize ComfyUI on your target GPU hardware (local or cloud).</Step>
          <Step n={2}>Expose the service port to the internet via a secure public tunnel (e.g. ngrok).</Step>
          <Step n={3}>Provide the public URL in <Link href="/settings" className="text-[#B7F54A] hover:underline">Settings → ComfyUI Server URL</Link>.</Step>
          <Step n={4}>Commit the changes. Studio instantly begins proxying generation queues to that endpoint.</Step>
        </div>
        <Note>
          When utilizing an authenticated tunnel, embed credentials directly in your endpoint URL:{" "}
          <InlineCode>https://user:pass@your-domain.ngrok-free.app</InlineCode>
        </Note>
        <p className="text-xs text-[#7b72a8] italic">
          Credentials and connection strings are securely retained within your Studio session. You can manage multiple infrastructure profiles under <Link href="/settings" className="text-[#B7F54A] hover:underline">Settings</Link> for zero-downtime pivoting.
        </p>
      </div>
    ),
  },
  {
    id: "kaggle",
    icon: Cloud,
    title: "Kaggle Integration",
    badge: "Free Tier",
    content: (
      <div className="space-y-6">
        <p>
          Kaggle provides ~12-hour session blocks on T4 or P100 GPUs at no cost. Studio provides a robust bootstrapping script on the <Link href="/launch" className="text-[#B7F54A] hover:underline">Launch</Link> page that automates installation and tunnel setup.
        </p>
        <div className="space-y-4">
          <Step n={1}>
            Initialize a fresh notebook at <ExtLink href="https://www.kaggle.com/code">kaggle.com/code</ExtLink>.
          </Step>
          <Step n={2}>
            Under notebook settings, ensure <strong className="text-white">Accelerator → GPU</strong> and <strong className="text-white">Internet → On</strong> are selected.
          </Step>
          <Step n={3}>
            Navigate to <strong className="text-white">Add-ons → Secrets</strong> and provision these required environment variables:
            <div className="mt-3 grid gap-2">
              {[
                ["NGROK_AUTHTOKEN", "Acquired from dashboard.ngrok.com"],
                ["TUNNEL_USER", "A custom username to secure your ingress"],
                ["TUNNEL_PASS", "A custom password (8+ characters)"],
                ["HF_TOKEN", "HuggingFace token for protected model weights"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col sm:flex-row gap-2 sm:items-center bg-[#09080D] p-2 rounded-lg border border-[#2d2650]">
                  <InlineCode>{k}</InlineCode>
                  <span className="text-xs text-[#7b72a8]">{v}</span>
                </div>
              ))}
            </div>
          </Step>
          <Step n={4}>
            Copy the complete bootstrap script from the <Link href="/launch" className="text-[#B7F54A] hover:underline">Launch GPU (Kaggle)</Link> tab into a single cell.
          </Step>
          <Step n={5}>Execute the cell (<strong className="text-white">Run All</strong>). Initial provisioning takes ~5 minutes.</Step>
          <Step n={6}>
            Watch the console output. Upon seeing <InlineCode>ComfyUI is LIVE</InlineCode>, copy the provided ingress URL.
          </Step>
          <Step n={7}>
            Commit the URL to <Link href="/settings" className="text-[#B7F54A] hover:underline">Settings</Link> to establish the link.
          </Step>
        </div>
        <Note>Maintain the notebook execution state while generating. If the 12-hour timeout triggers, simply re-execute the cell to resume operations.</Note>
      </div>
    ),
  },
  {
    id: "colab",
    icon: Cloud,
    title: "Google Colab",
    badge: "Free Tier",
    content: (
      <div className="space-y-6">
        <p>
          Google Colab offers T4 hardware (16GB VRAM) on their free tier. We provide a tailored bootstrap script for rapid provisioning.
        </p>
        <div className="space-y-4">
          <Step n={1}>
            Launch a blank workspace at <ExtLink href="https://colab.new">colab.new</ExtLink>.
          </Step>
          <Step n={2}>
            Navigate to <strong className="text-white">Runtime → Change runtime type</strong> and select the T4 GPU profile.
          </Step>
          <Step n={3}>
            Select the <strong className="text-white">Key icon</strong> (Secrets tab) in the sidebar. Provision the standard variables (<InlineCode>NGROK_AUTHTOKEN</InlineCode>, <InlineCode>TUNNEL_USER</InlineCode>, <InlineCode>TUNNEL_PASS</InlineCode>, <InlineCode>HF_TOKEN</InlineCode>) and critically, toggle <strong className="text-white">Notebook access ON</strong> for each.
          </Step>
          <Step n={4}>
            Inject the Colab bootstrap script from the <Link href="/launch" className="text-[#B7F54A] hover:underline">Launch</Link> page and execute.
          </Step>
          <Step n={5}>Upon successful initialization, retrieve the provided URL and assign it in Studio Settings.</Step>
        </div>
        <Note>
          Colab free tier terminates after ~90 minutes of inactivity. For extensive pipelines like SVD or dense motion control, consider Colab Pro+ to secure A100 compute.
        </Note>
      </div>
    ),
  },
  {
    id: "runpod",
    icon: Terminal,
    title: "RunPod Environments",
    badge: "Dedicated Hardware",
    content: (
      <div className="space-y-6">
        <p>
          For stable, dedicated compute, RunPod allows fractional GPU rental. Studio connects seamlessly to their containerized proxy system.
        </p>
        <div className="space-y-4">
          <Step n={1}>
            Provision a new pod via <ExtLink href="https://www.runpod.io">runpod.io</ExtLink>. Utilize a pre-configured <strong className="text-white">ComfyUI</strong> community template.
          </Step>
          <Step n={2}>
            During setup, ensure <strong className="text-white">HTTP port 8188</strong> is mapped in the exposed ports configuration.
          </Step>
          <Step n={3}>
            Verify the container's execution command binds to all interfaces:
            <div className="mt-3">
              <Code>{"python main.py --listen 0.0.0.0 --port 8188"}</Code>
            </div>
          </Step>
          <Step n={4}>
            From the pod control panel, trigger <strong className="text-white">Connect → HTTP Service [8188]</strong> to secure your proxy URL:
            <div className="mt-3">
              <Code>{"https://xxxxxxxx-8188.proxy.runpod.net"}</Code>
            </div>
          </Step>
          <Step n={5}>
            Commit this URL to Studio Settings. We recommend labeling the profile by hardware (e.g., <InlineCode>RunPod A100</InlineCode>) in your Saved GPUs roster.
          </Step>
        </div>
        <Note>
          RunPod's native proxy layer handles authentication automatically. Standard ngrok credentials are not required when using this route.
        </Note>
      </div>
    ),
  },
  {
    id: "local",
    icon: Wifi,
    title: "Local Infrastructure",
    content: (
      <div className="space-y-6">
        <p>
          Studio is fully capable of leveraging your physical local hardware, eliminating latency and cloud dependencies entirely.
        </p>
        <div className="space-y-4">
          <Step n={1}>
            Deploy ComfyUI following the <ExtLink href="https://github.com/comfyanonymous/ComfyUI#readme">official repository</ExtLink> documentation.
          </Step>
          <Step n={2}>
            Initialize the server locally: <InlineCode>python main.py</InlineCode>. Default binding is <InlineCode>http://127.0.0.1:8188</InlineCode>.
          </Step>
          <Step n={3}>
            Map this exact address (<InlineCode>http://127.0.0.1:8188</InlineCode>) into Studio Settings.
          </Step>
          <Step n={4}>
            Trigger <strong className="text-white">Test Connection</strong> to verify pipeline integrity.
          </Step>
        </div>
        <Note>
          Direct local-loopback requires Studio and ComfyUI to reside on the same network layer. If accessing Studio externally, you must expose your local hardware via a secure tunnel.
        </Note>
      </div>
    ),
  },
  {
    id: "troubleshoot",
    icon: Key,
    title: "Diagnostics & Resolution",
    content: (
      <div className="space-y-6">
        {[
          {
            q: "Diagnostics report 'Connection Failed'",
            a: "Verify: (1) Process execution state on the host, (2) Strict URL matching (including the https:// prefix), (3) Tunnel session validity. Terminate and restart the bootstrap script if the tunnel expired."
          },
          {
            q: "URL resolves in browser, but Studio rejects connection",
            a: "If HTTP Basic Auth is enabled, the credentials MUST be embedded in the connection string (user:pass@domain). Ensure no trailing slashes remain on the domain path."
          },
          {
            q: "Queue stalls in 'Pending' state indefinitely",
            a: "This indicates a hard disconnect between Studio and the runner. Execute a Connection Test in Settings. Review the Jobs board for explicit unhandled tracebacks."
          },
          {
            q: "Pipeline throws 'model not found' exceptions",
            a: "The requested graph requires weights not currently synced to the target runner. Review the Models panel to audit available assets. Missing checkpoints must be manually provisioned to the host's models directory."
          },
        ].map(({ q, a }) => (
          <div key={q} className="p-4 rounded-2xl bg-[#09080D] border border-[#2d2650] space-y-2">
            <p className="font-bold text-white text-sm flex gap-2">
              <span className="text-[#A779F5]">Q.</span> {q}
            </p>
            <p className="text-sm text-[#7b72a8] flex gap-2 leading-relaxed">
              <span className="text-[#B7F54A] font-bold">A.</span> {a}
            </p>
          </div>
        ))}
      </div>
    ),
  },
];

export default function Guide() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <PageHeader 
        title="Infrastructure Docs"
        description="Comprehensive specifications for connecting Studio to diverse compute backends—Kaggle, Colab, RunPod, Vast.ai, or localized hardware."
        visual={<GuideVisual />}
        actions={
          <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-0">
            <Link href="/launch">
              <Button className="w-full bg-[#171120] text-white border border-[#2d2650] hover:bg-[#2d2650] hover:text-white font-bold h-12 px-6 rounded-xl">
                Bootstrap Runner
              </Button>
            </Link>
            <Link href="/settings">
              <Button className="w-full bg-[#B7F54A] text-[#09080D] hover:bg-[#a4de3a] font-bold h-12 px-6 rounded-xl shadow-lg shadow-[#B7F54A]/20">
                Configure Settings
              </Button>
            </Link>
          </div>
        }
      />

      <div className="animate-in fade-in duration-500 delay-150 fill-mode-both">
        {/* Table of contents pills */}
        <div className="flex flex-wrap gap-2 mb-8 bg-[#171120] p-4 rounded-3xl border border-[#2d2650]">
          <div className="flex items-center gap-2 mr-2 text-xs font-bold text-[#7b72a8] uppercase tracking-wider">
            <FileText className="w-4 h-4" /> Jump to:
          </div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                const el = document.getElementById(`section-${s.id}`);
                if (el) {
                  const y = el.getBoundingClientRect().top + window.scrollY - 100;
                  window.scrollTo({ top: y, behavior: 'smooth' });
                }
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#09080D] border border-[#2d2650] text-[#BEB2CC] hover:text-white hover:border-[#A779F5]/50 transition-all"
            >
              {s.title}
            </button>
          ))}
        </div>

        <Accordion sections={SECTIONS} />
      </div>
    </div>
  );
}
