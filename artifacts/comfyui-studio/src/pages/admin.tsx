import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ImagePlus, Loader2, Save, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type MediaAsset = {
  id: string;
  name: string;
  kind: "image" | "video";
  objectPath: string;
  contentType: string;
  size: number;
  altText: string;
  createdAt: string;
};

type ContentSlot = {
  id: string;
  label: string;
  title: string;
  description: string;
  mediaId: string | null;
  ctaLabel: string;
  ctaHref: string;
  visible: boolean;
  order: number;
};

type CatalogEntry = {
  id: string;
  kind: "workflow" | "template";
  sourceWorkflowId: string;
  title: string;
  description: string;
  category: string;
  mediaId: string | null;
  visible: boolean;
  featured: boolean;
  order: number;
};

type ContentState = {
  media: MediaAsset[];
  slots: ContentSlot[];
  catalog: CatalogEntry[];
};

type Workflow = {
  id: string;
  name: string;
  description: string;
  category: string;
};

const contentKey = ["admin-content"];

async function fetchContent(): Promise<ContentState> {
  const response = await fetch("/api/admin/content", { credentials: "include" });
  if (!response.ok) throw new Error(response.status === 403 ? "Administrator access is required." : "Could not load content.");
  return response.json() as Promise<ContentState>;
}

async function fetchWorkflows(): Promise<Workflow[]> {
  const response = await fetch("/api/workflows", { credentials: "include" });
  if (!response.ok) throw new Error("Could not load workflows.");
  return response.json() as Promise<Workflow[]>;
}

function mediaUrl(asset: MediaAsset): string {
  return `/api/content/media/${asset.id}`;
}

export default function Admin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [section, setSection] = useState<"landing" | "workflows" | "templates" | "media">("landing");
  const [draft, setDraft] = useState<ContentState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ sourceWorkflowId: "", title: "", category: "featured", description: "" });

  const contentQuery = useQuery({
    queryKey: contentKey,
    queryFn: fetchContent,
    staleTime: 0,
  });
  const workflowsQuery = useQuery({
    queryKey: ["workflows", "admin"],
    queryFn: fetchWorkflows,
    staleTime: 60_000,
  });
  const content = draft ?? contentQuery.data;
  const workflows = workflowsQuery.data ?? [];
  const templateEntries = useMemo(
    () => content?.catalog.filter((entry) => entry.kind === "template") ?? [],
    [content],
  );

  if (contentQuery.isLoading || !content) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-3 h-5 w-5 animate-spin" />Loading admin studio</div>;
  }
  if (contentQuery.error) {
    return <div className="mx-auto max-w-xl rounded-3xl border border-destructive/40 bg-destructive/10 p-8"><AlertCircle className="mb-4 h-8 w-8 text-destructive" /><h1 className="text-2xl font-bold">Admin access required</h1><p className="mt-2 text-muted-foreground">{(contentQuery.error as Error).message}</p></div>;
  }

  const updateContent = (update: Partial<ContentState>) => setDraft({ ...content, ...update });
  const updateSlot = (id: string, update: Partial<ContentSlot>) => {
    updateContent({ slots: content.slots.map((slot) => slot.id === id ? { ...slot, ...update } : slot) });
  };
  const updateCatalog = (entry: CatalogEntry) => {
    const existing = content.catalog.findIndex((item) => item.id === entry.id);
    const catalog = [...content.catalog];
    if (existing === -1) catalog.push(entry);
    else catalog[existing] = entry;
    updateContent({ catalog });
  };
  const removeCatalog = (id: string) => updateContent({ catalog: content.catalog.filter((entry) => entry.id !== id) });

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      if (!response.ok) throw new Error("Could not save content.");
      const saved = await response.json() as ContentState;
      setDraft(saved);
      await queryClient.invalidateQueries({ queryKey: contentKey });
      toast({ title: "Content saved", description: "Your landing and catalog changes are live." });
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    if (!/^image\/|^video\//.test(file.type) || file.size > 100 * 1024 * 1024) {
      toast({ title: "Unsupported media", description: "Choose an image or video up to 100 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const urlResponse = await fetch("/api/admin/content/media/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlResponse.ok) throw new Error("Could not prepare upload.");
      const uploadData = await urlResponse.json() as { uploadURL: string; objectPath: string };
      const putResponse = await fetch(uploadData.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putResponse.ok) throw new Error("Media upload failed.");
      const createResponse = await fetch("/api/admin/content/media", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type, objectPath: uploadData.objectPath, altText: file.name }),
      });
      if (!createResponse.ok) throw new Error("Could not register uploaded media.");
      const result = await createResponse.json() as { content: ContentState };
      setDraft(result.content);
      await queryClient.invalidateQueries({ queryKey: contentKey });
      toast({ title: "Media uploaded", description: "You can now attach it to a landing slot or catalog card." });
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const addTemplate = () => {
    const source = workflows.find((workflow) => workflow.id === newTemplate.sourceWorkflowId);
    if (!source || !newTemplate.title.trim()) return;
    const entry: CatalogEntry = {
      id: `template-${Date.now()}`,
      kind: "template",
      sourceWorkflowId: source.id,
      title: newTemplate.title.trim(),
      description: newTemplate.description.trim() || source.description,
      category: newTemplate.category.trim() || "featured",
      mediaId: null,
      visible: true,
      featured: true,
      order: content.catalog.length,
    };
    updateCatalog(entry);
    setNewTemplate({ sourceWorkflowId: "", title: "", category: "featured", description: "" });
  };

  const adminTabs = [
    { id: "landing", label: "Landing slots" },
    { id: "workflows", label: "Workflows" },
    { id: "templates", label: "Templates" },
    { id: "media", label: "Media library" },
  ] as const;

  return (
    <div className="space-y-8 pb-16">
      <header className="flex flex-col gap-6 border-b border-border pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-primary">Aurora admin studio</p>
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Make the product visible.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Upload the actual images and videos that explain Aurora, then attach them to landing slots, workflows, and templates without editing code.</p>
        </div>
        <Button onClick={save} disabled={saving} className="h-12 rounded-xl px-6 font-bold">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? "Saving…" : "Save changes"}</Button>
      </header>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-card/50 p-2">
        {adminTabs.map((tab) => <button key={tab.id} type="button" onClick={() => setSection(tab.id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${section === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{tab.label}</button>)}
      </div>

      {section === "landing" && (
        <section className="space-y-5">
          <div><h2 className="text-2xl font-bold">Landing slots</h2><p className="mt-1 text-sm text-muted-foreground">Each slot is a visual story. Attach a real product image or looping demo video above the copy.</p></div>
          <div className="grid gap-5 lg:grid-cols-2">
            {content.slots.sort((a, b) => a.order - b.order).map((slot) => {
              const asset = content.media.find((item) => item.id === slot.mediaId);
              return <div key={slot.id} className="overflow-hidden rounded-3xl border border-border bg-card">
                <div className="aspect-[16/8] bg-background">
                  {asset ? asset.kind === "video" ? <video src={mediaUrl(asset)} className="h-full w-full object-cover" muted loop autoPlay playsInline controls={false} /> : <img src={mediaUrl(asset)} alt={asset.altText} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><ImagePlus className="h-8 w-8 opacity-50" /><span className="text-sm">Attach media below</span></div>}
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{slot.label}</p><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={slot.visible} onChange={(event) => updateSlot(slot.id, { visible: event.target.checked })} /> Visible</label></div>
                  <Input value={slot.title} onChange={(event) => updateSlot(slot.id, { title: event.target.value })} aria-label={`${slot.label} title`} />
                  <Textarea value={slot.description} onChange={(event) => updateSlot(slot.id, { description: event.target.value })} aria-label={`${slot.label} description`} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select value={slot.mediaId ?? ""} onChange={(event) => updateSlot(slot.id, { mediaId: event.target.value || null })} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" aria-label={`${slot.label} media`}>
                      <option value="">No media selected</option>
                      {content.media.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <Input value={slot.ctaHref} onChange={(event) => updateSlot(slot.id, { ctaHref: event.target.value })} placeholder="/generate" aria-label={`${slot.label} link`} />
                  </div>
                </div>
              </div>;
            })}
          </div>
        </section>
      )}

      {section === "workflows" && (
        <section className="space-y-5">
          <div><h2 className="text-2xl font-bold">Workflow catalog</h2><p className="mt-1 text-sm text-muted-foreground">Control which executable workflows appear in the app and give each one a demonstration image or video.</p></div>
          <div className="grid gap-4">
            {workflows.map((workflow) => {
              const existing = content.catalog.find((entry) => entry.kind === "workflow" && entry.sourceWorkflowId === workflow.id);
              const entry = existing ?? { id: workflow.id, kind: "workflow" as const, sourceWorkflowId: workflow.id, title: workflow.name, description: workflow.description, category: workflow.category, mediaId: null, visible: true, featured: false, order: 0 };
              return <div key={workflow.id} className="grid gap-4 rounded-3xl border border-border bg-card p-5 md:grid-cols-[1fr_1fr_180px]">
                <div className="space-y-3"><div className="flex items-center gap-3"><p className="font-bold">{workflow.name}</p><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{workflow.category}</span></div><Input value={entry.title} onChange={(event) => updateCatalog({ ...entry, title: event.target.value })} aria-label={`${workflow.name} display title`} /><Textarea value={entry.description} onChange={(event) => updateCatalog({ ...entry, description: event.target.value })} aria-label={`${workflow.name} description`} /></div>
                <div className="flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-background">{entry.mediaId && content.media.find((item) => item.id === entry.mediaId) ? (() => { const asset = content.media.find((item) => item.id === entry.mediaId)!; return asset.kind === "video" ? <video src={mediaUrl(asset)} className="h-full w-full object-cover" muted loop autoPlay playsInline /> : <img src={mediaUrl(asset)} alt={asset.altText} className="h-full w-full object-cover" />; })() : <span className="text-xs text-muted-foreground">No demonstration media</span>}</div>
                <div className="space-y-3"><select value={entry.mediaId ?? ""} onChange={(event) => updateCatalog({ ...entry, mediaId: event.target.value || null })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" aria-label={`${workflow.name} media`}><option value="">Media</option>{content.media.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entry.visible} onChange={(event) => updateCatalog({ ...entry, visible: event.target.checked })} /> Visible in app</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entry.featured} onChange={(event) => updateCatalog({ ...entry, featured: event.target.checked })} /> Featured</label></div>
              </div>;
            })}
          </div>
        </section>
      )}

      {section === "templates" && (
        <section className="space-y-5">
          <div><h2 className="text-2xl font-bold">Template collections</h2><p className="mt-1 text-sm text-muted-foreground">Create presentation-ready template cards backed by an existing executable workflow. The source workflow remains safe and controlled.</p></div>
          <div className="grid gap-3 rounded-3xl border border-border bg-card p-5 md:grid-cols-4">
            <select value={newTemplate.sourceWorkflowId} onChange={(event) => setNewTemplate({ ...newTemplate, sourceWorkflowId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" aria-label="Template source workflow"><option value="">Source workflow</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select>
            <Input value={newTemplate.title} onChange={(event) => setNewTemplate({ ...newTemplate, title: event.target.value })} placeholder="Template title" aria-label="Template title" />
            <Input value={newTemplate.category} onChange={(event) => setNewTemplate({ ...newTemplate, category: event.target.value })} placeholder="Collection" aria-label="Template collection" />
            <Button onClick={addTemplate} disabled={!newTemplate.sourceWorkflowId || !newTemplate.title.trim()}><Check className="mr-2 h-4 w-4" />Add template</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {templateEntries.map((entry) => <div key={entry.id} className="space-y-4 rounded-3xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{entry.title}</p><p className="mt-1 text-xs text-muted-foreground">Runs {workflows.find((workflow) => workflow.id === entry.sourceWorkflowId)?.name ?? entry.sourceWorkflowId}</p></div><button type="button" onClick={() => removeCatalog(entry.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${entry.title}`}><Trash2 className="h-4 w-4" /></button></div><Input value={entry.title} onChange={(event) => updateCatalog({ ...entry, title: event.target.value })} aria-label={`${entry.title} title`} /><Textarea value={entry.description} onChange={(event) => updateCatalog({ ...entry, description: event.target.value })} aria-label={`${entry.title} description`} /><div className="grid gap-3 sm:grid-cols-2"><select value={entry.mediaId ?? ""} onChange={(event) => updateCatalog({ ...entry, mediaId: event.target.value || null })} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" aria-label={`${entry.title} media`}><option value="">Media</option>{content.media.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entry.visible} onChange={(event) => updateCatalog({ ...entry, visible: event.target.checked })} /> Visible</label></div></div>)}
            {templateEntries.length === 0 && <div className="rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground md:col-span-2">Add your first template card above.</div>}
          </div>
        </section>
      )}

      {section === "media" && (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-bold">Media library</h2><p className="mt-1 text-sm text-muted-foreground">Upload actual product demonstrations. Images and videos stay in App Storage; only metadata is kept in the database.</p></div><label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:brightness-110">{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{uploading ? "Uploading…" : "Upload media"}<input type="file" className="sr-only" accept="image/*,video/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label></div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {content.media.map((asset) => <div key={asset.id} className="overflow-hidden rounded-3xl border border-border bg-card"><div className="aspect-video bg-background">{asset.kind === "video" ? <video src={mediaUrl(asset)} className="h-full w-full object-cover" muted loop autoPlay playsInline controls={false} /> : <img src={mediaUrl(asset)} alt={asset.altText} className="h-full w-full object-cover" />}</div><div className="flex items-center gap-3 p-4"><div className="rounded-xl bg-secondary p-2">{asset.kind === "video" ? <Video className="h-4 w-4 text-primary" /> : <ImagePlus className="h-4 w-4 text-primary" />}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{asset.name}</p><p className="text-xs text-muted-foreground">{Math.round(asset.size / 1024)} KB</p></div></div></div>)}
            {content.media.length === 0 && <div className="rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground sm:col-span-2 lg:col-span-3">Your library is empty. Upload a product image or short demonstration video.</div>}
          </div>
        </section>
      )}

      <footer className="flex flex-wrap items-center gap-4 border-t border-border pt-6 text-sm text-muted-foreground"><Link href="/" className="hover:text-foreground">Back to Aurora</Link><span>•</span><span>Changes affect the app catalog after saving.</span></footer>
    </div>
  );
}