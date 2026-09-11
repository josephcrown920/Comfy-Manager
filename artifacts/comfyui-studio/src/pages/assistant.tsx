import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Show } from "@clerk/react";
import { 
  useAssistantChat, 
  useAssistantVideoPlan, 
  type AssistantChatMessage 
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Sparkles, Video, FileJson, Loader2 } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/creation-design/page-header";
import exampleVisual from "@/assets/thumbnails/film-grade.jpg";

export default function Assistant() {
  return (
    <>
      <Show when="signed-in">
        <div className="min-h-[100dvh] bg-[#09080D] text-white animate-in fade-in duration-300 pb-20 px-6 sm:px-12 pt-8 flex flex-col">
          <PageHeader
            eyebrow="Copilot"
            title="AI Assistant"
            description="Your copilot for ComfyUI. Ask for help with nodes, or describe a video idea to get a ready-to-run workflow."
          />

          <Tabs defaultValue="chat" className="w-full flex-1 flex flex-col max-w-5xl mx-auto">
            <TabsList className="w-full max-w-md mx-auto grid grid-cols-2 bg-[#171120] border border-[#A779F5]/30 rounded-xl p-1 mb-8">
              <TabsTrigger value="chat" className="rounded-lg data-[state=active]:bg-[#B7F54A] data-[state=active]:text-[#09080D] text-[#BEB2CC] py-3 text-sm font-bold uppercase tracking-widest transition-all">
                <Bot className="w-4 h-4 mr-2" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="video" className="rounded-lg data-[state=active]:bg-[#B7F54A] data-[state=active]:text-[#09080D] text-[#BEB2CC] py-3 text-sm font-bold uppercase tracking-widest transition-all">
                <Video className="w-4 h-4 mr-2" />
                Plan Video
              </TabsTrigger>
            </TabsList>

            <div className="flex-1">
              <TabsContent value="chat" className="h-[600px] mt-0">
                <ChatTab />
              </TabsContent>
              <TabsContent value="video" className="h-full mt-0">
                <VideoAgentTab />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </Show>
      <Show when="signed-out">
        <div className="min-h-screen bg-[#09080D] flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-3xl border border-[#A779F5]/30 bg-[#171120] p-10 text-center shadow-2xl">
            <div className="mb-8 rounded-2xl bg-[#09080D] border border-[#A779F5]/30 p-5 overflow-hidden relative">
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-[#A779F5]/20 border border-[#A779F5]/30 text-[#A779F5] text-[10px] font-bold uppercase tracking-wider">Example</div>
              <div className="mt-8 flex flex-col gap-3 text-left">
                <div className="bg-[#B7F54A]/10 text-[#B7F54A] p-4 rounded-xl text-sm font-medium border border-[#B7F54A]/30">
                  "I want a 6-second cinematic video of a cyberpunk city zooming through the streets..."
                </div>
                <div className="flex justify-center">
                  <div className="h-5 w-[1px] bg-[#A779F5]/50" />
                </div>
                <div className="relative aspect-video rounded-xl overflow-hidden border border-[#A779F5]/30">
                  <img src={exampleVisual} alt="Example result" className="w-full h-full object-cover opacity-80" />
                  <div className="absolute bottom-3 left-3">
                    <span className="bg-[#09080D]/80 backdrop-blur text-[#BEB2CC] font-mono text-xs px-3 py-1.5 rounded-lg border border-[#A779F5]/30 flex items-center gap-2">
                      <FileJson className="w-3 h-3 text-[#A779F5]" /> Workflow Ready
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <h1 className="text-3xl font-black text-white mb-4">Sign in to use the AI Assistant</h1>
            <p className="mx-auto max-w-md text-base text-[#BEB2CC] leading-relaxed">
              Your account keeps AI requests protected and gives you a personal usage limit.
            </p>
            <Button asChild className="mt-8 rounded-xl bg-[#B7F54A] text-[#09080D] hover:bg-[#A3E030] py-6 px-8 font-bold text-base shadow-[0_0_20px_rgba(183,245,74,0.3)]">
              <a href={`${import.meta.env.BASE_URL}sign-in`}>Sign in or create an account</a>
            </Button>
          </div>
        </div>
      </Show>
    </>
  );
}

function ChatTab() {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([
    { role: "assistant", content: "Hi! I'm your ComfyUI copilot. Need help understanding a node, or how to build a specific workflow?" }
  ]);
  const [input, setInput] = useState("");
  const chatMutation = useAssistantChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMsg: AssistantChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    chatMutation.mutate({
      data: { messages: newMessages }
    }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      },
      onError: () => {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error connecting to the AI. Please try again." }]);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full border border-[#A779F5]/30 bg-[#171120] rounded-3xl overflow-hidden shadow-2xl">
      <ScrollArea className="flex-1 p-8" ref={scrollRef}>
        <div className="space-y-8 max-w-3xl mx-auto">
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-10 h-10 rounded-xl bg-[#09080D] flex items-center justify-center shrink-0 border border-[#A779F5]/30 shadow-lg">
                  <Bot className="w-5 h-5 text-[#A779F5]" />
                </div>
              )}
              <div 
                className={`px-6 py-4 rounded-2xl max-w-[85%] text-base shadow-md ${
                  msg.role === 'user' 
                    ? 'bg-[#B7F54A] text-[#09080D] font-medium'
                    : 'bg-[#09080D] text-white border border-[#A779F5]/30'
                }`}
              >
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div className="prose prose-sm md:prose-base dark:prose-invert prose-p:leading-relaxed prose-pre:bg-[#171120] prose-pre:border prose-pre:border-[#A779F5]/20 max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-10 h-10 rounded-xl bg-[#09080D] border border-[#A779F5]/30 flex items-center justify-center shrink-0 shadow-lg">
                  <User className="w-5 h-5 text-[#BEB2CC]" />
                </div>
              )}
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex gap-4 justify-start">
              <div className="w-10 h-10 rounded-xl bg-[#09080D] flex items-center justify-center shrink-0 border border-[#A779F5]/30 shadow-lg">
                <Bot className="w-5 h-5 text-[#A779F5]" />
              </div>
              <div className="px-6 py-5 rounded-2xl bg-[#09080D] border border-[#A779F5]/30 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#A779F5] animate-bounce" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#A779F5] animate-bounce [animation-delay:0.2s]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#A779F5] animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="p-6 border-t border-[#A779F5]/30 bg-[#09080D]">
        <div className="max-w-3xl mx-auto relative flex items-center bg-[#171120] rounded-2xl border border-[#A779F5]/30 focus-within:border-[#B7F54A] focus-within:ring-1 focus-within:ring-[#B7F54A]/50 transition-all p-2">
          <Textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about ComfyUI..."
            className="min-h-[60px] max-h-[200px] pr-16 resize-none rounded-xl bg-transparent border-0 focus-visible:ring-0 text-base py-3"
          />
          <Button 
            size="icon" 
            aria-label="Send message"
            className="absolute right-3 bottom-3 rounded-xl h-10 w-10 bg-[#B7F54A] text-[#09080D] hover:bg-[#A3E030] shadow-[0_0_15px_rgba(183,245,74,0.2)] disabled:bg-[#171120] disabled:text-[#BEB2CC] disabled:border disabled:border-[#A779F5]/30"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function VideoAgentTab() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<{
    templateId: string;
    workflowJson: string;
    notes: string;
  } | null>(null);
  
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const planMutation = useAssistantVideoPlan();

  const handleGeneratePlan = () => {
    if (!idea.trim()) return;
    
    planMutation.mutate({
      data: { idea: idea.trim() }
    }, {
      onSuccess: (data) => {
        setResult(data);
      },
      onError: (err: any) => {
        toast({
          title: "Failed to generate plan",
          description: err.message,
          variant: "destructive"
        });
      }
    });
  };

  const handleOpenInGenerate = () => {
    if (!result) return;
    sessionStorage.setItem('assistant-workflow', result.workflowJson);
    setLocation("/generate");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-[#171120] border border-[#A779F5]/30 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-[#A779F5]/20 bg-[#09080D]">
          <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
            <div className="p-2 rounded-xl bg-[#B7F54A]/10 border border-[#B7F54A]/30">
              <Sparkles className="w-6 h-6 text-[#B7F54A]" />
            </div>
            Describe Your Video Idea
          </h2>
          <p className="text-base text-[#BEB2CC] mt-3">
            Tell the AI what kind of video you want to create, and it will build a complete ComfyUI workflow for you.
          </p>
        </div>
        <div className="p-8">
          <Textarea 
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="I want a 6-second cinematic video of a cyberpunk city zooming through the streets, glowing neon signs..."
            className="min-h-[160px] text-base leading-relaxed resize-y bg-[#09080D] border-[#A779F5]/30 rounded-2xl text-white placeholder:text-[#BEB2CC]/40 focus-visible:ring-[#B7F54A] p-5"
          />
        </div>
        <div className="p-8 pt-0">
          <Button 
            size="lg" 
            onClick={handleGeneratePlan}
            disabled={!idea.trim() || planMutation.isPending}
            className="w-full sm:w-auto bg-[#B7F54A] text-[#09080D] hover:bg-[#A3E030] rounded-xl font-bold py-6 px-8 shadow-[0_0_20px_rgba(183,245,74,0.3)] transition-all"
          >
            {planMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Generating Plan...</> : <><Sparkles className="mr-2 h-5 w-5" /> Generate Workflow</>}
          </Button>
        </div>
      </div>

      {planMutation.isPending && (
        <div className="bg-[#171120] border border-[#A779F5]/30 rounded-3xl p-8 space-y-6 animate-pulse shadow-2xl">
          <div className="flex items-center gap-5">
            <Skeleton className="w-14 h-14 rounded-2xl bg-[#09080D]" />
            <div className="space-y-3">
              <Skeleton className="h-6 w-64 rounded-xl bg-[#09080D]" />
              <Skeleton className="h-4 w-40 rounded-xl bg-[#09080D]" />
            </div>
          </div>
          <Skeleton className="h-32 w-full rounded-2xl bg-[#09080D]" />
        </div>
      )}

      {result && !planMutation.isPending && (
        <div className="bg-[#171120] border border-[#A779F5]/30 rounded-3xl animate-in slide-in-from-bottom-4 duration-500 overflow-hidden relative shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#B7F54A] to-[#A779F5]" />
          <div className="p-8 border-b border-[#A779F5]/20 bg-[#09080D]">
            <h2 className="text-2xl font-bold text-white mb-2">Your Workflow is Ready</h2>
            <p className="text-sm text-[#BEB2CC] flex items-center gap-2">
              Based on the <span className="font-mono px-2 py-1 bg-[#A779F5]/20 text-[#A779F5] rounded-md border border-[#A779F5]/30 font-bold">{result.templateId}</span> template.
            </p>
          </div>
          <div className="p-8 space-y-8">
            <div className="bg-[#09080D] p-6 rounded-2xl border border-[#A779F5]/20">
              <h3 className="font-bold mb-4 flex items-center gap-3 text-sm uppercase tracking-widest text-[#A779F5]">
                <Bot className="w-5 h-5" />
                AI Notes
              </h3>
              <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-[#BEB2CC] prose-p:leading-relaxed">
                <ReactMarkdown>{result.notes}</ReactMarkdown>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Button 
                size="lg" 
                className="flex-1 sm:flex-none bg-[#B7F54A] text-[#09080D] hover:bg-[#A3E030] rounded-xl font-bold py-6 px-8 shadow-[0_0_20px_rgba(183,245,74,0.3)] transition-all"
                onClick={handleOpenInGenerate}
              >
                <FileJson className="w-5 h-5 mr-2" />
                Open in Generate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
