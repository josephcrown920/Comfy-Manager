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
import { Bot, Send, User, Sparkles, Video, FileJson } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function Assistant() {
  return (
    <>
      <Show when="signed-in">
    <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-3">
          <Bot className="h-6 w-6 text-[#e8f724]" />
          AI Assistant
        </h1>
        <p className="text-[#7b72a8] mt-2 text-sm">
          Your copilot for ComfyUI. Ask for help with nodes, or describe a video idea to get a ready-to-run workflow.
        </p>
      </div>

      <Tabs defaultValue="chat" className="w-full flex-1 flex flex-col">
        <TabsList className="w-full max-w-md mx-auto grid grid-cols-2 bg-transparent border-b border-[#2d2650] h-auto p-0">
          <TabsTrigger value="chat" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#e8f724] data-[state=active]:bg-transparent data-[state=active]:text-[#e8f724] bg-transparent text-[#7b72a8] py-3">
            <Bot className="w-4 h-4 mr-2" />
            Chat Assistant
          </TabsTrigger>
          <TabsTrigger value="video" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#e8f724] data-[state=active]:bg-transparent data-[state=active]:text-[#e8f724] bg-transparent text-[#7b72a8] py-3">
            <Video className="w-4 h-4 mr-2" />
            Video Agent
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-6">
          <TabsContent value="chat" className="h-full mt-0">
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
        <div className="mx-auto flex min-h-[65vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-2xl border border-[#2d2650] bg-[#111022] p-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e8f724]/10">
              <Bot className="h-8 w-8 text-[#e8f724]" />
            </div>
            <h1 className="text-2xl font-semibold text-white">Sign in to use the AI Assistant</h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-[#b4afd0]">
              Your account keeps AI requests protected and gives you a personal usage limit.
            </p>
            <Button asChild className="mt-6 rounded-xl bg-[#e8f724] text-black hover:bg-[#d4e010]">
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
  
  // Auto-scroll to bottom
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
    <div className="flex flex-col h-[600px] border border-[#2d2650] bg-[#1e1a38] rounded-xl max-w-4xl mx-auto shadow-none">
      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        <div className="space-y-6 max-w-3xl mx-auto">
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-[#1e1a38] flex items-center justify-center shrink-0 border border-[#2d2650]">
                  <Bot className="w-4 h-4 text-[#e8f724]" />
                </div>
              )}
              <div 
                className={`px-4 py-3 rounded-xl max-w-[80%] text-sm ${
                  msg.role === 'user' 
                    ? 'bg-[#e8f724] text-black font-medium' 
                    : 'bg-[#1e1a38] text-[#f0eeff] border border-[#2d2650]'
                }`}
              >
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-pre:bg-[#1e1a38] prose-pre:border prose-pre:border-[#2d2650] max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-[#2a2448] border border-[#2d2650] flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-[#7b72a8]" />
                </div>
              )}
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-[#1e1a38] flex items-center justify-center shrink-0 border border-[#2d2650]">
                <Bot className="w-4 h-4 text-[#e8f724]" />
              </div>
              <div className="px-4 py-3 rounded-xl bg-[#1e1a38] border border-[#2d2650] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#e8f724] animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-[#e8f724] animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-[#e8f724] animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="p-4 border-t border-[#2d2650] bg-[#1e1a38]">
        <div className="max-w-3xl mx-auto relative flex items-center">
          <Textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about ComfyUI..."
            className="min-h-[60px] max-h-[150px] pr-14 resize-none rounded-xl bg-[#1e1a38] border-[#2d2650] font-sans text-sm focus-visible:ring-[#ff9500]"
          />
          <Button 
            size="icon" 
            className="absolute right-2 bottom-2 rounded-xl h-9 w-9 bg-[#e8f724] text-black hover:bg-[#d4e010]"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
          >
            <Send className="w-4 h-4" />
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-[#1e1a38] border border-[#2d2650] rounded-xl">
        <div className="p-6 border-b border-[#2d2650]">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="w-5 h-5 text-[#e8f724]" />
            Describe Your Video Idea
          </h2>
          <p className="text-sm text-[#7b72a8] mt-1">
            Tell the AI what kind of video you want to create, and it will build a complete ComfyUI workflow for you.
          </p>
        </div>
        <div className="p-6">
          <Textarea 
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="I want a 6-second cinematic video of a cyberpunk city zooming through the streets, glowing neon signs..."
            className="min-h-[120px] text-sm font-sans resize-y bg-[#1e1a38] border-[#2d2650] rounded-xl"
          />
        </div>
        <div className="p-6 pt-0">
          <Button 
            size="lg" 
            onClick={handleGeneratePlan}
            disabled={!idea.trim() || planMutation.isPending}
            className="w-full sm:w-auto bg-[#e8f724] text-black hover:bg-[#d4e010] rounded-xl"
          >
            {planMutation.isPending ? "Generating Plan..." : "Generate Workflow"}
          </Button>
        </div>
      </div>

      {planMutation.isPending && (
        <div className="bg-[#1e1a38] border border-[#2d2650] rounded-xl p-6 space-y-4 animate-pulse">
          <div className="flex items-center gap-4">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48 rounded-xl" />
              <Skeleton className="h-4 w-32 rounded-xl" />
            </div>
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {result && !planMutation.isPending && (
        <div className="bg-[#1e1a38] border border-[#2d2650] rounded-xl animate-in slide-in-from-bottom-4 duration-500 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-[#e8f724]" />
          <div className="p-6 border-b border-[#2d2650]">
            <h2 className="text-lg font-semibold">Your Workflow is Ready</h2>
            <p className="text-sm text-[#7b72a8] mt-1">
              Based on the <span className="font-mono text-[#e8f724]">{result.templateId}</span> template.
            </p>
          </div>
          <div className="p-6 space-y-6">
            <div className="bg-[#1e1a38] p-4 rounded-xl border border-[#2d2650]">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-widest text-[#f0eeff]">
                <Bot className="w-4 h-4 text-[#e8f724]" />
                AI Notes
              </h3>
              <div className="prose prose-sm dark:prose-invert max-w-none text-[#a0a0a0] prose-p:leading-relaxed">
                <ReactMarkdown>{result.notes}</ReactMarkdown>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Button 
                size="lg" 
                className="flex-1 sm:flex-none bg-[#e8f724] text-black hover:bg-[#d4e010] rounded-xl"
                onClick={handleOpenInGenerate}
              >
                <FileJson className="w-4 h-4 mr-2" />
                Open in Generate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
