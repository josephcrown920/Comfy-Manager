import { useState } from "react";
import { useListOutputs, getListOutputsQueryKey, Output } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Video, Image as ImageIcon, Download, Copy, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
];

export default function Gallery() {
  const [filter, setFilter] = useState<string>("all");
  const [selectedOutput, setSelectedOutput] = useState<Output | null>(null);

  const { data: outputs, isLoading } = useListOutputs(
    { type: filter === "all" ? undefined : (filter as any), limit: 50 },
    { query: { queryKey: getListOutputsQueryKey({ type: filter === "all" ? undefined : (filter as any), limit: 50 }) } }
  );

  const { toast } = useToast();
  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#f0eeff]">Gallery</h1>
          <p className="text-[#7b72a8] text-sm mt-0.5">All generated images and videos.</p>
        </div>

        {/* Pill filter — matches comfy.org "ALL / Node Graphs / Comfy Apps" */}
        <div className="flex items-center gap-1 bg-[#1e1a38] border border-[#2d2650] rounded-full p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                filter === f.value
                  ? "bg-[#e8f724] text-[#0d0b1a]"
                  : "text-[#7b72a8] hover:text-[#f0eeff]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className={`w-full rounded-2xl mb-3 bg-[#1e1a38] ${i % 3 === 0 ? "h-64" : "h-48"}`} />
          ))}
        </div>
      ) : outputs && outputs.length > 0 ? (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {outputs.map((output) => (
            <div
              key={output.id}
              className="relative border border-[#2d2650] bg-[#1e1a38] rounded-2xl overflow-hidden group cursor-pointer break-inside-avoid mb-3 transition-all hover:border-[#e8f724]/40 hover:shadow-lg hover:shadow-purple-900/20"
              onClick={() => setSelectedOutput(output)}
            >
              {output.outputType === "video" ? (
                <div className="relative">
                  <video src={output.comfyUrl} className="w-full h-auto object-cover block"
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                    muted loop playsInline />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="h-10 w-10 bg-black/60 flex items-center justify-center text-white backdrop-blur-sm rounded-full">
                      <Play className="h-5 w-5 ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur rounded-full px-2.5 py-1 text-xs text-white flex items-center gap-1 font-medium">
                    <Video className="h-3 w-3" /> VIDEO
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <img src={output.thumbnailUrl || output.comfyUrl} alt={output.filename}
                    className="w-full h-auto object-cover block" loading="lazy" />
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur rounded-full px-2.5 py-1 text-xs text-white flex items-center gap-1 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImageIcon className="h-3 w-3" /> IMAGE
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center p-16 border border-[#2d2650] bg-[#1e1a38] rounded-2xl text-[#4a4269]">
          <ImageIcon className="mx-auto h-10 w-10 text-[#2d2650] mb-3" />
          <h3 className="text-sm font-semibold text-[#7b72a8]">No outputs found</h3>
          <p className="mt-1 text-xs">Nothing to show for the selected filter.</p>
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!selectedOutput} onOpenChange={(o) => !o && setSelectedOutput(null)}>
        <DialogContent className="max-w-screen-xl max-h-[95vh] flex flex-col gap-0 p-0 overflow-hidden bg-[#16122a] border-[#2d2650] rounded-2xl">
          <div className="sr-only">
            <DialogTitle>View Output</DialogTitle>
            <DialogDescription>Media output viewer</DialogDescription>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-[#0e0b1e]">
            {selectedOutput?.outputType === "video" ? (
              <video src={selectedOutput.comfyUrl} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" controls autoPlay />
            ) : selectedOutput ? (
              <img src={selectedOutput.comfyUrl} alt={selectedOutput.filename}
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
            ) : null}
          </div>
          <div className="bg-[#1e1a38] border-t border-[#2d2650] p-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-sm text-[#f0eeff]">{selectedOutput?.filename}</p>
              <p className="text-xs text-[#7b72a8]">Generated {formatDate(selectedOutput?.createdAt)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm"
                onClick={() => selectedOutput && handleCopyLink(selectedOutput.comfyUrl)}
                className="rounded-full bg-transparent border-[#2d2650] hover:bg-[#2a2448] text-[#f0eeff]">
                <Copy className="h-4 w-4 mr-2" /> Copy Link
              </Button>
              <Button size="sm" asChild className="rounded-full bg-[#e8f724] text-[#0d0b1a] hover:bg-[#d4e010] font-bold">
                <a href={selectedOutput?.comfyUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" /> Download
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
