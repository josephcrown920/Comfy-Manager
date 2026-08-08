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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Gallery</h1>
          <p className="text-muted-foreground">All generated images and videos.</p>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="w-full sm:w-auto">
          <TabsList className="w-full sm:w-auto bg-muted">
            <TabsTrigger value="all" className="flex-1 sm:flex-none">All</TabsTrigger>
            <TabsTrigger value="image" className="flex-1 sm:flex-none">Images</TabsTrigger>
            <TabsTrigger value="video" className="flex-1 sm:flex-none">Videos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {[1,2,3,4,5,6,7,8].map(i => (
            <Skeleton key={i} className={`w-full rounded-xl mb-4 ${i % 3 === 0 ? 'h-64' : 'h-48'}`} />
          ))}
        </div>
      ) : outputs && outputs.length > 0 ? (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {outputs.map((output) => (
            <div 
              key={output.id} 
              className="relative rounded-xl border bg-muted overflow-hidden group cursor-pointer break-inside-avoid mb-4 shadow-sm hover:shadow-md hover:ring-1 hover:ring-primary/50 transition-all"
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
                    <div className="h-10 w-10 rounded-full bg-black/60 flex items-center justify-center text-white backdrop-blur-sm">
                      <Play className="h-5 w-5 ml-1" />
                    </div>
                  </div>
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur rounded px-2 py-1 text-xs text-white flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    Video
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <img 
                    src={output.thumbnailUrl || output.comfyUrl} 
                    alt={output.filename} 
                    className="w-full h-auto object-cover block group-hover:scale-105 transition-transform duration-700" 
                    loading="lazy"
                  />
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur rounded px-2 py-1 text-xs text-white flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImageIcon className="h-3 w-3" />
                    Image
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center p-16 border border-dashed rounded-xl text-muted-foreground bg-muted/20">
          <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
          <h3 className="text-lg font-medium text-foreground">No outputs found</h3>
          <p className="mt-1">Nothing to show for the selected filter.</p>
        </div>
      )}

      {/* Lightbox Dialog */}
      <Dialog open={!!selectedOutput} onOpenChange={(o) => !o && setSelectedOutput(null)}>
        <DialogContent className="max-w-screen-xl max-h-[95vh] flex flex-col gap-0 p-0 overflow-hidden bg-black/95 border-none border-primary/20">
          <div className="sr-only">
             <DialogTitle>View Output</DialogTitle>
             <DialogDescription>Media output viewer</DialogDescription>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {selectedOutput?.outputType === 'video' ? (
              <video 
                src={selectedOutput.comfyUrl} 
                className="max-w-full max-h-[80vh] rounded shadow-2xl" 
                controls 
                autoPlay 
              />
            ) : selectedOutput ? (
              <img 
                src={selectedOutput.comfyUrl} 
                alt={selectedOutput.filename} 
                className="max-w-full max-h-[80vh] object-contain rounded shadow-2xl" 
              />
            ) : null}
          </div>
          <div className="bg-background/90 backdrop-blur border-t p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{selectedOutput?.filename}</p>
              <p className="text-xs text-muted-foreground">Generated {formatDate(selectedOutput?.createdAt)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => selectedOutput && handleCopyLink(selectedOutput.comfyUrl)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
              <Button size="sm" asChild>
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
