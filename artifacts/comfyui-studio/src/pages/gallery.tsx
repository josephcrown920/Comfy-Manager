import { useState } from "react";
import { useListOutputs, getListOutputsQueryKey, Output } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Video, Image as ImageIcon, Download, Copy, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

export default function Gallery() {
  const [filter, setFilter] = useState<string>("all");
  const [selectedOutput, setSelectedOutput] = useState<Output | null>(null);
  
  const { data: outputs, isLoading } = useListOutputs({
    type: filter === 'all' ? undefined : filter as any,
    limit: 50
  }, {
    query: {
      queryKey: getListOutputsQueryKey({ type: filter === 'all' ? undefined : filter as any, limit: 50 })
    }
  });

  const { toast } = useToast();

  const handleCopyLink = (url: string) => {
    // In a real app we'd construct the full URL if comfyUrl is relative
    // Here we just copy the raw string for demonstration
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-[#3a3a3a] pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Gallery</h1>
          <p className="text-[#888888] text-sm">All generated images and videos.</p>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="w-full sm:w-auto bg-transparent">
          <TabsList className="w-full sm:w-auto bg-transparent border-none gap-4">
            <TabsTrigger value="all" className="flex-1 sm:flex-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-[#ff9500] data-[state=active]:border-b-2 data-[state=active]:border-[#ff9500] rounded-none px-2 pb-2 h-auto text-[#888888]">All</TabsTrigger>
            <TabsTrigger value="image" className="flex-1 sm:flex-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-[#ff9500] data-[state=active]:border-b-2 data-[state=active]:border-[#ff9500] rounded-none px-2 pb-2 h-auto text-[#888888]">Images</TabsTrigger>
            <TabsTrigger value="video" className="flex-1 sm:flex-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-[#ff9500] data-[state=active]:border-b-2 data-[state=active]:border-[#ff9500] rounded-none px-2 pb-2 h-auto text-[#888888]">Videos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {[1,2,3,4,5,6,7,8].map(i => (
            <Skeleton key={i} className={`w-full rounded-[2px] mb-4 ${i % 3 === 0 ? 'h-64' : 'h-48'}`} />
          ))}
        </div>
      ) : outputs && outputs.length > 0 ? (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {outputs.map((output) => (
            <div 
              key={output.id} 
              className="relative border border-[#3a3a3a] bg-[#1a1a1a] overflow-hidden group cursor-pointer break-inside-avoid mb-4 transition-all hover:ring-1 hover:ring-[#ff9500]/60"
              onClick={() => setSelectedOutput(output)}
            >
              {output.outputType === 'video' ? (
                <div className="relative">
                  <video 
                    src={output.comfyUrl} 
                    className="w-full h-auto object-cover block"
                    onMouseEnter={e => e.currentTarget.play()}
                    onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                    muted
                    loop
                    playsInline
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="h-10 w-10 bg-black/60 flex items-center justify-center text-white backdrop-blur-sm rounded-[2px]">
                      <Play className="h-5 w-5 ml-1" />
                    </div>
                  </div>
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur rounded-[2px] px-2 py-1 text-xs text-white flex items-center gap-1 font-mono">
                    <Video className="h-3 w-3" />
                    VIDEO
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <img 
                    src={output.thumbnailUrl || output.comfyUrl} 
                    alt={output.filename} 
                    className="w-full h-auto object-cover block" 
                    loading="lazy"
                  />
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur rounded-[2px] px-2 py-1 text-xs text-white flex items-center gap-1 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImageIcon className="h-3 w-3" />
                    IMAGE
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center p-16 border border-[#3a3a3a] bg-[#242424] rounded-[2px] text-[#555555]">
          <ImageIcon className="mx-auto h-12 w-12 text-[#3a3a3a] mb-3" />
          <h3 className="text-sm font-medium text-[#e0e0e0] uppercase tracking-widest">No outputs found</h3>
          <p className="mt-1 text-xs">Nothing to show for the selected filter.</p>
        </div>
      )}

      {/* Lightbox Dialog */}
      <Dialog open={!!selectedOutput} onOpenChange={(o) => !o && setSelectedOutput(null)}>
        <DialogContent className="max-w-screen-xl max-h-[95vh] flex flex-col gap-0 p-0 overflow-hidden bg-[#1a1a1a] border-[#3a3a3a] rounded-[2px]">
          <div className="sr-only">
             <DialogTitle>View Output</DialogTitle>
             <DialogDescription>Media output viewer</DialogDescription>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#000000]">
            {selectedOutput?.outputType === 'video' ? (
              <video 
                src={selectedOutput.comfyUrl} 
                className="max-w-full max-h-[80vh] shadow-2xl" 
                controls 
                autoPlay 
              />
            ) : selectedOutput ? (
              <img 
                src={selectedOutput.comfyUrl} 
                alt={selectedOutput.filename} 
                className="max-w-full max-h-[80vh] object-contain shadow-2xl" 
              />
            ) : null}
          </div>
          <div className="bg-[#1a1a1a] border-t border-[#3a3a3a] p-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-sm">{selectedOutput?.filename}</p>
              <p className="text-xs text-[#888888]">Generated {formatDate(selectedOutput?.createdAt)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => selectedOutput && handleCopyLink(selectedOutput.comfyUrl)} className="rounded-[2px] bg-transparent border-[#3a3a3a] hover:bg-[#2d2d2d]">
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
              <Button size="sm" asChild className="rounded-[2px] bg-[#ff9500] text-black hover:bg-[#ff8000]">
                <a href={selectedOutput?.comfyUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
