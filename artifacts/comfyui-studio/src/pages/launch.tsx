import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, Copy, ExternalLink, Rocket, KeyRound, Terminal, Cpu, Link2, AlertCircle } from "lucide-react";
import launcherScript from "@/assets/launcher/comfyui_launcher.py?raw";

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
    note: "Hugging Face token (huggingface.co/settings/tokens). Needed for the gated SDXL/SVD model weights — accept the license on each model page first",
  },
  {
    key: "NGROK_STATIC_DOMAIN",
    required: false,
    note: "Free static domain (dashboard.ngrok.com/domains) — keeps the same URL across restarts so you never re-paste it",
  },
  {
    key: "COMFY_CAPABILITIES",
    required: false,
    note: "What to install: image, video, lipsync, motion (default auto-picks by GPU VRAM)",
  },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
      {copied ? "Copied!" : label}
    </Button>
  );
}

function StepCard({ n, icon: Icon, title, children }: { n: number; icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-lg">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-bold">{n}</span>
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pl-[4.25rem] text-sm text-muted-foreground space-y-3">{children}</CardContent>
    </Card>
  );
}

export default function Launch() {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="secondary">FREE GPU</Badge>
          <Badge variant="secondary">HEADLESS READY</Badge>
          <Badge variant="secondary">COMFYUI NATIVE</Badge>
        </div>
        <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-3">
          <Rocket className="h-8 w-8 text-primary" />
          Launch a GPU
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          No GPU? Run ComfyUI on a free cloud GPU in minutes. One script installs ComfyUI, the custom
          nodes, and the models, then gives you a URL to paste into{" "}
          <span className="text-foreground font-medium">Settings → ComfyUI Server URL</span>.
        </p>
      </div>

      <Tabs defaultValue="colab">
        <TabsList>
          <TabsTrigger value="colab">Google Colab (free T4)</TabsTrigger>
          <TabsTrigger value="kaggle">Kaggle</TabsTrigger>
        </TabsList>
        <TabsContent value="colab" className="mt-4">
          <Alert className="border-primary/30 bg-primary/5">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              Free tier: NVIDIA T4, 16 GB VRAM — fits <strong>image</strong> and <strong>lip sync</strong>.
              Video and motion control need a bigger card (Colab Pro+ A100). Sessions idle-disconnect;
              just re-run the cell to come back online.
            </AlertDescription>
          </Alert>
        </TabsContent>
        <TabsContent value="kaggle" className="mt-4">
          <Alert className="border-primary/30 bg-primary/5">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              Free tier: ~12h per session with a weekly GPU quota (T4/P100, 16 GB). Turn{" "}
              <strong>GPU ON</strong> and <strong>Internet ON</strong> in notebook settings. Add secrets
              via <strong>Add-ons → Secrets</strong>.
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <StepCard n={1} icon={Terminal} title="Open a notebook">
          <p>Create a new notebook and switch the runtime to a GPU.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href="https://colab.new" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Google Colab
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="https://www.kaggle.com/code" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Kaggle
              </a>
            </Button>
          </div>
          <p>
            Colab: <span className="font-mono text-xs">Runtime → Change runtime type → T4 GPU → Save</span>.
          </p>
        </StepCard>

        <StepCard n={2} icon={KeyRound} title="Add your secrets">
          <p>
            Colab: key icon in the left sidebar (toggle notebook access ON). Kaggle:{" "}
            <span className="font-mono text-xs">Add-ons → Secrets</span>.
          </p>
          <div className="rounded-md border divide-y">
            {SECRETS.map((s) => (
              <div key={s.key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 p-3">
                <code className="text-xs font-mono text-foreground shrink-0 w-48">{s.key}</code>
                <Badge variant={s.required ? "default" : "secondary"} className="w-fit shrink-0">
                  {s.required ? "required" : "optional"}
                </Badge>
                <span className="text-xs">{s.note}</span>
              </div>
            ))}
          </div>
        </StepCard>

        <StepCard n={3} icon={Cpu} title="Paste the launcher script and run">
          <p>
            Copy the full script below into one cell and run it. It installs ComfyUI + nodes + models
            (first run takes a few minutes), then prints your public URL.
          </p>
          <div className="flex items-center gap-2">
            <CopyButton text={launcherScript} label="Copy Full Script" />
            <span className="text-xs">{launcherScript.split("\n").length} lines · Python</span>
          </div>
          <pre className="max-h-72 overflow-auto rounded-md border bg-secondary/30 p-4 text-xs font-mono leading-relaxed">
            {launcherScript}
          </pre>
        </StepCard>

        <StepCard n={4} icon={Link2} title="Connect Studio">
          <p>
            When the cell prints <span className="font-mono text-xs">ComfyUI is LIVE</span>, copy the
            whole URL — it includes your tunnel username and password (
            <span className="font-mono text-xs">https://user:pass@your-domain</span>) so Studio can
            authenticate — and paste it into{" "}
            <Link href="/settings" className="text-primary underline underline-offset-4">
              Settings → ComfyUI Server URL
            </Link>
            . That's it — every workflow in Generate now runs on your cloud GPU.
          </p>
          <p className="text-xs">
            Keep the notebook cell running while you generate. With a static ngrok domain the URL never
            changes, even across session restarts.
          </p>
        </StepCard>
      </div>
    </div>
  );
}
