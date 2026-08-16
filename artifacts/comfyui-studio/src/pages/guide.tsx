import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Terminal, Key, Wifi, Monitor, Cloud, Layers } from "lucide-react";
import { Link } from "wouter";

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
    <div className="space-y-2">
      {sections.map((s) => (
        <div key={s.id} id={`section-${s.id}`} className="border border-[#2d2650] rounded-2xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-[#1e1a38] hover:bg-[#231f42] transition-colors text-left"
            onClick={() => setOpen(open === s.id ? null : s.id)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#2a2448] flex items-center justify-center shrink-0">
                <s.icon className="h-4 w-4 text-[#e8f724]" />
              </div>
              <span className="font-semibold text-[#f0eeff] text-sm">{s.title}</span>
              {s.badge && (
                <span className="px-2 py-0.5 rounded-full bg-[#e8f724]/10 text-[#e8f724] text-xs font-semibold hidden sm:inline">{s.badge}</span>
              )}
            </div>
            {open === s.id
              ? <ChevronUp className="h-4 w-4 text-[#7b72a8] shrink-0" />
              : <ChevronDown className="h-4 w-4 text-[#7b72a8] shrink-0" />}
          </button>
          {open === s.id && (
            <div className="px-5 pb-6 pt-4 bg-[#1a163a] border-t border-[#2d2650] text-sm text-[#c8c0e8] space-y-4">
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
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8f724]/15 text-[#e8f724] text-xs font-bold mt-0.5">{n}</span>
      <div className="flex-1 leading-relaxed min-w-0">{children}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-[#16122a] border border-[#2d2650] rounded-lg px-3 py-2 font-mono text-xs text-[#e8f724] leading-relaxed whitespace-pre-wrap break-all overflow-x-auto">
      {children}
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#16122a] border border-[#2d2650] rounded px-1.5 py-0.5 font-mono text-xs text-[#e8f724] break-all">{children}</code>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-[#e8f724]/5 border border-[#e8f724]/20 rounded-xl text-xs text-[#c8c0e8]">
      <span className="text-[#e8f724] shrink-0">ℹ</span>
      <div>{children}</div>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[#e8f724] underline underline-offset-2 inline-flex items-center gap-1">
      {children} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

const SECTIONS: Section[] = [
  {
    id: "how-it-works",
    icon: Layers,
    title: "How connections work",
    badge: "Start here",
    content: (
      <div className="space-y-4">
        <p>
          ComfyUI Studio is a frontend that talks to your own <strong className="text-[#f0eeff]">ComfyUI server</strong> over HTTP. It doesn't run AI itself — it sends workflow jobs to a ComfyUI instance you control, which does the actual GPU work.
        </p>
        <p>The connection flow is always the same regardless of where your GPU lives:</p>
        <div className="space-y-2">
          <Step n={1}>Start ComfyUI on a GPU machine (cloud or local)</Step>
          <Step n={2}>Expose it to the internet via a public URL (ngrok tunnel, RunPod proxy, etc.)</Step>
          <Step n={3}>Paste that URL into <InlineCode>Settings → ComfyUI Server URL</InlineCode></Step>
          <Step n={4}>Click Save — Studio proxies all workflow jobs through that URL</Step>
        </div>
        <Note>
          If your tunnel requires a username and password, include them in the URL like this:{" "}
          <InlineCode>https://user:pass@your-domain.ngrok-free.app</InlineCode>
        </Note>
        <p className="text-xs text-[#7b72a8]">
          The URL is stored only in your Studio settings. You can save multiple GPU URLs under{" "}
          <Link href="/settings" className="text-[#e8f724] underline underline-offset-2">Settings → Saved GPUs</Link> and switch between them in one click.
        </p>
      </div>
    ),
  },
  {
    id: "kaggle",
    icon: Cloud,
    title: "Kaggle",
    badge: "Free GPU",
    content: (
      <div className="space-y-4">
        <p>
          Kaggle gives you a free T4 or P100 GPU (~12 h/session, weekly quota). Use the built-in launcher on the{" "}
          <Link href="/launch" className="text-[#e8f724] underline underline-offset-2">Launch GPU</Link> page — it installs ComfyUI and prints your tunnel URL automatically.
        </p>
        <div className="space-y-3">
          <Step n={1}>
            Open a new Kaggle notebook at <ExtLink href="https://www.kaggle.com/code">kaggle.com/code</ExtLink>
          </Step>
          <Step n={2}>
            In notebook settings, set <strong className="text-[#f0eeff]">Accelerator → GPU</strong> and <strong className="text-[#f0eeff]">Internet → On</strong>.
          </Step>
          <Step n={3}>
            Open <strong className="text-[#f0eeff]">Add-ons → Secrets</strong> and add these keys:
            <div className="mt-2 space-y-1.5">
              {[
                ["NGROK_AUTHTOKEN", "From dashboard.ngrok.com → Your Authtoken (free account)"],
                ["TUNNEL_USER", "A username you choose — protects your tunnel"],
                ["TUNNEL_PASS", "A password you choose (8+ chars)"],
                ["HF_TOKEN", "From huggingface.co/settings/tokens"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col sm:flex-row gap-1 sm:gap-2 sm:items-start">
                  <InlineCode>{k}</InlineCode>
                  <span className="text-xs text-[#7b72a8] sm:mt-0.5">{v}</span>
                </div>
              ))}
            </div>
          </Step>
          <Step n={4}>
            Go to <Link href="/launch" className="text-[#e8f724] underline underline-offset-2">Launch GPU → Kaggle tab</Link>, copy the full launcher script, and paste it into one notebook cell.
          </Step>
          <Step n={5}>Click <strong className="text-[#f0eeff]">Run All</strong>. The first run takes ~5 minutes to install everything.</Step>
          <Step n={6}>
            When the cell prints <InlineCode>ComfyUI is LIVE</InlineCode>, copy the URL it shows.
          </Step>
          <Step n={7}>
            Paste the URL into <Link href="/settings" className="text-[#e8f724] underline underline-offset-2">Settings → ComfyUI Server URL</Link> and save.
          </Step>
        </div>
        <Note>Keep the notebook running while you generate. The session auto-disconnects after ~12 h — just re-run the cell to restart.</Note>
      </div>
    ),
  },
  {
    id: "colab",
    icon: Cloud,
    title: "Google Colab",
    badge: "Free GPU",
    content: (
      <div className="space-y-4">
        <p>
          Google Colab's free tier gives you a T4 GPU (16 GB VRAM). Use the built-in launcher from the{" "}
          <Link href="/launch" className="text-[#e8f724] underline underline-offset-2">Launch GPU</Link> page.
        </p>
        <div className="space-y-3">
          <Step n={1}>
            Open a new notebook at <ExtLink href="https://colab.new">colab.new</ExtLink>
          </Step>
          <Step n={2}>
            Go to <strong className="text-[#f0eeff]">Runtime → Change runtime type → T4 GPU → Save</strong>.
          </Step>
          <Step n={3}>
            Click the <strong className="text-[#f0eeff]">key icon</strong> in the left sidebar to open Secrets. Add the same four keys as Kaggle (<InlineCode>NGROK_AUTHTOKEN</InlineCode>, <InlineCode>TUNNEL_USER</InlineCode>, <InlineCode>TUNNEL_PASS</InlineCode>, <InlineCode>HF_TOKEN</InlineCode>) and toggle <strong className="text-[#f0eeff]">Notebook access ON</strong> for each.
          </Step>
          <Step n={4}>
            Copy the launcher script from <Link href="/launch" className="text-[#e8f724] underline underline-offset-2">Launch GPU → Colab tab</Link>, paste into a cell, and run it.
          </Step>
          <Step n={5}>Wait for <InlineCode>ComfyUI is LIVE</InlineCode>, copy the URL, paste into Studio Settings.</Step>
        </div>
        <Note>
          Colab free tier sessions disconnect after ~90 min of idle. Colab Pro/Pro+ gives longer sessions and access to A100 GPUs for SVD and motion control.
        </Note>
      </div>
    ),
  },
  {
    id: "runpod",
    icon: Terminal,
    title: "RunPod",
    badge: "Paid cloud GPU",
    content: (
      <div className="space-y-4">
        <p>
          RunPod lets you rent GPUs by the hour. You set up ComfyUI manually (or use a pre-built template) then expose it to Studio.
        </p>
        <div className="space-y-3">
          <Step n={1}>
            Create a pod at <ExtLink href="https://www.runpod.io">runpod.io</ExtLink>. Search the template library for <strong className="text-[#f0eeff]">ComfyUI</strong> — several ready-made images exist.
          </Step>
          <Step n={2}>
            When creating the pod, expose <strong className="text-[#f0eeff]">HTTP port 8188</strong> in the port settings.
          </Step>
          <Step n={3}>
            Once the pod is running, make sure ComfyUI is listening on all interfaces:
            <div className="mt-2">
              <Code>{"python main.py --listen 0.0.0.0 --port 8188"}</Code>
            </div>
          </Step>
          <Step n={4}>
            In the RunPod pod dashboard, click <strong className="text-[#f0eeff]">Connect → HTTP Service [8188]</strong> to get your public proxy URL:
            <div className="mt-2">
              <Code>{"https://xxxxxxxx-8188.proxy.runpod.net"}</Code>
            </div>
          </Step>
          <Step n={5}>
            Paste that URL into <Link href="/settings" className="text-[#e8f724] underline underline-offset-2">Settings → ComfyUI Server URL</Link> and save. Label it <InlineCode>RunPod A100</InlineCode> under Saved GPUs.
          </Step>
        </div>
        <Note>
          RunPod proxy URLs don't need a username/password — they use their own auth layer. If you add an ngrok tunnel instead, include your credentials in the URL.
        </Note>
      </div>
    ),
  },
  {
    id: "vast",
    icon: Terminal,
    title: "Vast.ai",
    badge: "Cheap cloud GPU",
    content: (
      <div className="space-y-4">
        <p>
          Vast.ai is often the cheapest option for renting high-end GPUs. Setup is similar to RunPod.
        </p>
        <div className="space-y-3">
          <Step n={1}>
            Rent an instance at <ExtLink href="https://vast.ai">vast.ai</ExtLink>. Look for a machine with at least 16 GB VRAM.
          </Step>
          <Step n={2}>
            In the instance template, use a ComfyUI Docker image, or a PyTorch base image where you install ComfyUI manually.
          </Step>
          <Step n={3}>
            Add port <strong className="text-[#f0eeff]">8188</strong> under "Open Ports" when creating the instance.
          </Step>
          <Step n={4}>
            SSH in (or use the Jupyter terminal) and start ComfyUI:
            <div className="mt-2">
              <Code>{"cd ComfyUI\npython main.py --listen 0.0.0.0 --port 8188"}</Code>
            </div>
          </Step>
          <Step n={5}>
            In the Vast.ai dashboard, the <strong className="text-[#f0eeff]">Open Ports</strong> section shows the public address for port 8188:
            <div className="mt-2">
              <Code>{"http://ssh4.vast.ai:12345  (example — yours will differ)"}</Code>
            </div>
          </Step>
          <Step n={6}>
            Paste that into Studio Settings and save. Label it something like <InlineCode>Vast RTX 4090</InlineCode>.
          </Step>
        </div>
        <Note>
          If Vast.ai doesn't give you a stable HTTPS URL, install ngrok inside the instance and run <InlineCode>ngrok http 8188</InlineCode>, then use the printed URL instead.
        </Note>
      </div>
    ),
  },
  {
    id: "jupyter",
    icon: Monitor,
    title: "Jupyter Notebook",
    content: (
      <div className="space-y-4">
        <p>
          Jupyter is a notebook interface, not a GPU provider. You can run ComfyUI from Jupyter cells on any machine that has a GPU — Kaggle, Vast.ai, RunPod, or your own computer.
        </p>
        <div className="space-y-3">
          <Step n={1}>
            Open a Jupyter notebook on a machine with a GPU (any of the providers above, or locally).
          </Step>
          <Step n={2}>
            Install and start ComfyUI in a cell:
            <div className="mt-2">
              <Code>{"!git clone https://github.com/comfyanonymous/ComfyUI.git\n%cd ComfyUI\n!pip install -r requirements.txt\n!python main.py --listen 0.0.0.0 --port 8188"}</Code>
            </div>
          </Step>
          <Step n={3}>
            The last line blocks — ComfyUI is now running. To expose port 8188, run an ngrok tunnel in a separate cell:
            <div className="mt-2">
              <Code>{"!pip install pyngrok\nfrom pyngrok import ngrok, conf\nconf.get_default().auth_token = 'YOUR_NGROK_TOKEN'\ntunnel = ngrok.connect(8188)\nprint('URL:', tunnel.public_url)"}</Code>
            </div>
          </Step>
          <Step n={4}>
            Copy the printed URL and paste into <Link href="/settings" className="text-[#e8f724] underline underline-offset-2">Settings → ComfyUI Server URL</Link>.
          </Step>
        </div>
        <Note>
          For Kaggle notebooks, the built-in launcher on the <Link href="/launch" className="text-[#e8f724] underline underline-offset-2">Launch GPU</Link> page handles all of this automatically — you don't need to do it manually.
        </Note>
      </div>
    ),
  },
  {
    id: "local",
    icon: Wifi,
    title: "Local machine",
    content: (
      <div className="space-y-4">
        <p>
          If you have a GPU in your own computer, you can run ComfyUI locally and connect Studio to it — no cloud needed.
        </p>
        <div className="space-y-3">
          <Step n={1}>
            Install ComfyUI locally following the <ExtLink href="https://github.com/comfyanonymous/ComfyUI#readme">official README</ExtLink>.
          </Step>
          <Step n={2}>
            Start it: <InlineCode>python main.py</InlineCode>. It listens on <InlineCode>http://127.0.0.1:8188</InlineCode> by default.
          </Step>
          <Step n={3}>
            In Studio Settings, paste: <InlineCode>http://127.0.0.1:8188</InlineCode> and save.
          </Step>
          <Step n={4}>
            Click <strong className="text-[#f0eeff]">Test Connection</strong> — you should see "Connected".
          </Step>
        </div>
        <Note>
          This only works if Studio and ComfyUI run on the same computer. If Studio is hosted remotely, you'll need a tunnel (ngrok) to expose your local ComfyUI.
        </Note>
      </div>
    ),
  },
  {
    id: "troubleshoot",
    icon: Key,
    title: "Troubleshooting",
    content: (
      <div className="space-y-4">
        {[
          {
            q: "Test connection says 'Connection Failed'",
            a: "Check that: (1) your ComfyUI process is still running, (2) the URL in Settings is exactly right including https://, (3) if using an ngrok tunnel, the session hasn't expired. Re-run the launcher cell to get a fresh URL."
          },
          {
            q: "The URL works in my browser but not in Studio",
            a: "If your URL requires HTTP Basic Auth, include the credentials in the URL itself (user:pass@domain). Also check that there's no trailing slash."
          },
          {
            q: "Jobs stay in 'Pending' and never run",
            a: "This usually means ComfyUI is not reachable. Go to Settings and click Test Connection. Also check the Jobs page for any error message on the job row."
          },
          {
            q: "My Kaggle/Colab session restarted — what do I do?",
            a: "Re-run the launcher cell. If you set up a static ngrok domain, the URL stays the same and you don't need to update Settings. Without a static domain, copy the new URL and paste it into Settings."
          },
          {
            q: "I get 'model not found' errors",
            a: "The workflow needs a model checkpoint that isn't installed in your ComfyUI. Check the Models page to see what's available. The launcher installs a default set; extra models must be downloaded into ComfyUI's models folder."
          },
        ].map(({ q, a }) => (
          <div key={q} className="space-y-1.5">
            <p className="font-semibold text-[#f0eeff] text-sm">Q: {q}</p>
            <p className="text-[#c8c0e8]">{a}</p>
          </div>
        ))}
      </div>
    ),
  },
];

export default function Guide() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-[#e8f724] mb-2">Documentation</p>
        <h1 className="text-3xl font-bold text-[#f0eeff]">Connection Guide</h1>
        <p className="text-[#7b72a8] mt-2 text-sm max-w-xl">
          How to connect ComfyUI Studio to a GPU — whether it's Kaggle, Colab, RunPod, Vast.ai, Jupyter, or your own machine.
        </p>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-[#2d2650] text-[#7b72a8] hover:text-[#f0eeff] hover:border-[#4a4269] transition-colors"
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Accordion */}
      <Accordion sections={SECTIONS} />

      {/* Footer CTA */}
      <div className="p-5 bg-[#1e1a38] border border-[#2d2650] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-[#f0eeff] text-sm">Ready to connect?</p>
          <p className="text-xs text-[#7b72a8] mt-0.5">Paste your ComfyUI URL in Settings, or launch a free cloud GPU.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/launch">
            <button className="px-4 py-2 rounded-full border border-[#2d2650] text-[#f0eeff] text-sm font-medium hover:bg-[#2a2448] transition-colors">
              Launch GPU
            </button>
          </Link>
          <Link href="/settings">
            <button className="px-4 py-2 rounded-full bg-[#e8f724] text-[#0d0b1a] text-sm font-bold hover:bg-[#d4e010] transition-colors">
              Open Settings
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
