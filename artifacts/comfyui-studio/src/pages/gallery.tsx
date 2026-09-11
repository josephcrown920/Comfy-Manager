import { useState } from "react";
import { useListOutputs, getListOutputsQueryKey, Output, useListBatches, getListBatchesQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Video, Image as ImageIcon, Download, Copy, Play, Maximize2, LayoutGrid, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/operations-design/PageHeader";

function GalleryVisual() {
  return (
    <div className="absolute inset-0 bg-[#09080D] overflow-hidden flex items-center justify-center pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#BEB2CC 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-32 bg-[#A779F5]/20 border-2 border-[#A779F5]/50 rounded-2xl rotate-[-15deg] blur-[2px] scale-90" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-32 bg-[#B7F54A]/20 border-2 border-[#B7F54A]/50 rounded-2xl rotate-[10deg] blur-[1px] scale-95" />
        
        <div className="relative w-56 h-36 bg-[#171120] border border-[#2d2650] rounded-2xl shadow-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-[#A779F5]/10 to-[#B7F54A]/10" />
          <div className="absolute top-2 left-2 flex gap-1">
            <div className="w-2 h-2 rounded-full bg-[#2d2650]" />
            <div className="w-2 h-2 rounded-full bg-[#2d2650]" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-[#BEB2CC] opacity-50 group-hover:scale-110 transition-transform duration-500" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#09080D] to-transparent" />
        </div>
      </div>
    </div>
  );
}

const FILTERS = [
  { value: "all", label: "All Types" },
  { value: "image", label: "Images Only" },
  { value: "video", label: "Videos Only" },
];

export default function Gallery() {
  const [filter, setFilter] = useState<string>("all");
  const [selectedOutput, setSelectedOutput] = useState<Output | null>(null);

  const { data: outputs, isLoading } = useListOutputs(
    { type: filter === "all" ? undefined : (filter as any), limit: 50 },
    { query: { queryKey: getListOutputsQueryKey({ type: filter === "all" ? undefined : (filter as any), limit: 50 }) } }
  );
  const { data: batches } = useListBatches({ query: { refetchInterval: 10000, queryKey: getListBatchesQueryKey() } });

  const { toast } = useToast();
  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <div className="max-w-[1600px] mx-auto pb-12">
      <PageHeader 
        title="Asset Gallery"
        description="Browse, filter, and manage all your generated images and videos."
        visual={<GalleryVisual />}
        actions={
          <div className="flex bg-[#171120] p-1 border border-[#2d2650] rounded-xl shadow-lg shadow-[#09080D]">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  filter === f.value
                    ? "bg-[#2d2650] text-white shadow-sm"
                    : "text-[#7b72a8] hover:text-[#BEB2CC] hover:bg-[#2d2650]/50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="space-y-8 animate-in fade-in duration-500 delay-150 fill-mode-both">
        {batches?.some((batch) => batch.children.some((child) => child.outputs?.length)) && (
          <section className="space-y-4">
            <div className="flex items-center gap-3 px-1 mb-4">
              <Layers className="h-5 w-5 text-[#A779F5]" />
              <h2 className="text-xl font-bold text-white">Batch Results</h2>
            </div>
            
            <div className="grid gap-6">
              {batches.filter((batch) => batch.children.some((child) => child.outputs?.length)).map((batch) => (
                <div key={batch.id} className="overflow-hidden rounded-3xl border border-[#2d2650] bg-[#171120] group hover:border-[#A779F5]/30 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2d2650] p-5 bg-[#1a1325]">
                    <div>
                      <p className="font-bold text-lg text-white">{batch.name}</p>
                      <p className="text-xs text-[#BEB2CC] mt-1 font-medium">{batch.completedJobs}/{batch.totalJobs} variations generated</p>
                    </div>
                    <span className="rounded-lg bg-[#B7F54A]/10 border border-[#B7F54A]/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#B7F54A]">
                      {batch.batchType === "scene-variation" ? "Scene Variations" : "Finished Videos"}
                    </span>
                  </div>
                  
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                      {batch.children.flatMap((child) => (child.outputs ?? []).map((output) => ({ ...output, batchIndex: child.batchIndex }))).map((output) => (
                        <button key={output.id} type="button" aria-label={`Open ${output.filename}`} onClick={() => setSelectedOutput(output)} className="group/item relative overflow-hidden rounded-2xl border border-[#2d2650] bg-[#09080D] text-left transition-all hover:border-[#A779F5]/70 hover:shadow-lg hover:shadow-[#A779F5]/10 hover:-translate-y-1">
                          {output.outputType === "video" ? (
                            <div className="relative aspect-square">
                              <video src={output.comfyUrl} muted loop playsInline preload="none" poster={output.thumbnailUrl || undefined} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center"><Maximize2 className="w-4 h-4 text-white" /></div>
                              </div>
                            </div>
                          ) : (
                            <div className="relative aspect-square">
                              <img src={output.thumbnailUrl || output.comfyUrl} alt={output.filename} loading="lazy" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center"><Maximize2 className="w-4 h-4 text-white" /></div>
                              </div>
                            </div>
                          )}
                          <span className="absolute left-3 top-3 rounded-md bg-black/70 backdrop-blur-md px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-[#A779F5] border border-white/10 pointer-events-none">Var {output.batchIndex}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4 pt-6 border-t border-[#2d2650]">
          <div className="flex items-center gap-3 px-1 mb-6">
            <LayoutGrid className="h-5 w-5 text-[#B7F54A]" />
            <h2 className="text-xl font-bold text-white">All Outputs</h2>
          </div>
          
          {isLoading ? (
            <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className={`w-full rounded-3xl bg-[#171120] border border-[#2d2650] break-inside-avoid ${i % 3 === 0 ? "h-64" : "h-48"}`} />
              ))}
            </div>
          ) : outputs && outputs.length > 0 ? (
            <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
              {outputs.map((output) => (
                <button
                  key={output.id}
                  type="button"
                  aria-label={`Open ${output.filename}`}
                  className="relative border border-[#2d2650] bg-[#171120] rounded-3xl overflow-hidden group cursor-pointer break-inside-avoid transition-all hover:border-[#B7F54A]/40 hover:shadow-xl hover:shadow-[#B7F54A]/5 hover:-translate-y-1 w-full text-left"
                  onClick={() => setSelectedOutput(output)}
                >
                  {output.outputType === "video" ? (
                    <div className="relative">
                      <video src={output.comfyUrl} className="w-full h-auto object-cover block"
                        preload="none" muted loop playsInline poster={output.thumbnailUrl || undefined}
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/10 shadow-2xl">
                          <Play className="h-5 w-5 ml-1" />
                        </div>
                      </div>
                      <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md rounded-lg px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-white border border-white/10 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Video className="h-3 w-3 text-[#A779F5]" /> VIDEO
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <img src={output.thumbnailUrl || output.comfyUrl} alt={output.filename}
                        className="w-full h-auto object-cover block" loading="lazy" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/10 shadow-2xl">
                          <Maximize2 className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md rounded-lg px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-white border border-white/10 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <ImageIcon className="h-3 w-3 text-[#B7F54A]" /> IMAGE
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center p-16 border border-[#2d2650] bg-[#171120] rounded-3xl">
              <div className="w-16 h-16 rounded-full bg-[#09080D] border border-[#2d2650] flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="h-6 w-6 text-[#7b72a8]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No Outputs Found</h3>
              <p className="text-sm text-[#BEB2CC] max-w-sm mx-auto">Nothing to show for the selected filter. Try changing your filters or generate something new.</p>
            </div>
          )}
        </section>
      </div>

      {/* Lightbox */}
      <Dialog open={!!selectedOutput} onOpenChange={(o) => !o && setSelectedOutput(null)}>
        <DialogContent className="max-w-screen-2xl max-h-[95vh] w-[95vw] flex flex-col gap-0 p-0 overflow-hidden bg-[#09080D] border-[#2d2650] rounded-3xl shadow-2xl">
          <div className="sr-only">
            <DialogTitle>View Output</DialogTitle>
            <DialogDescription>Media output viewer</DialogDescription>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-black/50 relative">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#BEB2CC 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
            
            {selectedOutput?.outputType === "video" ? (
              <video src={selectedOutput.comfyUrl} className="max-w-full max-h-[80vh] rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10 relative object-contain" controls preload="metadata" />
            ) : selectedOutput ? (
              <img src={selectedOutput.comfyUrl} alt={selectedOutput.filename}
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10 relative" />
            ) : null}
          </div>
          <div className="bg-[#171120] border-t border-[#2d2650] p-5 flex flex-col sm:flex-row items-center justify-between gap-4 z-20">
            <div>
              <p className="font-mono text-sm text-white">{selectedOutput?.filename}</p>
              <p className="text-xs text-[#BEB2CC] mt-1 font-medium">Generated on {formatDate(selectedOutput?.createdAt)}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline"
                onClick={() => selectedOutput && handleCopyLink(selectedOutput.comfyUrl)}
                className="rounded-xl h-12 px-6 bg-transparent border-[#2d2650] hover:bg-[#2d2650] hover:text-white text-[#BEB2CC] font-bold">
                <Copy className="h-4 w-4 mr-2" /> Copy Link
              </Button>
              <Button asChild className="rounded-xl h-12 px-6 bg-[#B7F54A] text-[#09080D] hover:bg-[#a4de3a] font-bold">
                <a href={selectedOutput?.comfyUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" /> Download File
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
