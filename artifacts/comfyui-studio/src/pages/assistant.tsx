import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
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
    <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <Bot className="h-8 w-8 text-primary" />
          AI Assistant
        </h1>
        <p className="text-muted-foreground mt-2">
          Your copilot for ComfyUI. Ask for help with nodes, or describe a video idea to get a ready-to-run workflow.
        </p>
      </div>

      <Tabs defaultValue="chat" className="w-full flex-1 flex flex-col">
        <TabsList className="w-full max-w-md mx-auto grid grid-cols-2 bg-secondary/50">
          <TabsTrigger value="chat" className="data-[state=active]:bg-card data-[state=active]:text-primary">
            <Bot className="w-4 h-4 mr-2" />
            Chat Assistant
          </TabsTrigger>
          <TabsTrigger value="video" className="data-[state=active]:bg-card data-[state=active]:text-primary">
            <Video className="w-4 h-4 mr-2" />
            Video Agent
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-4">
          <TabsContent value="chat" className="h-full mt-0">
            <ChatTab />
          </TabsContent>
          <TabsContent value="video" className="h-full mt-0">
            <VideoAgentTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
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
    <Card className="flex flex-col h-[600px] border-border/50 shadow-sm max-w-4xl mx-auto">
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div 
                className={`px-4 py-3 rounded-2xl max-w-[80%] text-sm ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                    : 'bg-secondary/50 text-foreground border border-border/50 rounded-tl-sm'
                }`}
              >
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-pre:bg-background/80 prose-pre:border prose-pre:border-border max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-secondary/50 border border-border/50 rounded-tl-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="p-4 border-t bg-card/50">
        <div className="max-w-3xl mx-auto relative flex items-center">
          <Textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about ComfyUI..."
            className="min-h-[60px] max-h-[150px] pr-12 resize-none rounded-xl bg-background border-border/60 focus-visible:ring-primary/30"
          />
          <Button 
            size="icon" 
            className="absolute right-2 bottom-2 rounded-lg h-9 w-9"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
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
      <Card className="border-primary/20 shadow-[0_0_20px_rgba(var(--primary),0.05)] bg-gradient-to-b from-card to-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-primary" />
            Describe Your Video Idea
          </CardTitle>
          <CardDescription>
            Tell the AI what kind of video you want to create, and it will build a complete ComfyUI workflow for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea 
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="I want a 6-second cinematic video of a cyberpunk city zooming through the streets, glowing neon signs..."
            className="min-h-[120px] text-base resize-y bg-background border-border focus-visible:ring-primary/30"
          />
        </CardContent>
        <CardFooter>
          <Button 
            size="lg" 
            onClick={handleGeneratePlan}
            disabled={!idea.trim() || planMutation.isPending}
            className="w-full sm:w-auto"
          >
            {planMutation.isPending ? "Generating Plan..." : "Generate Workflow"}
          </Button>
        </CardFooter>
      </Card>

      {planMutation.isPending && (
        <Card className="border-border/50 animate-pulse">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full max-w-sm" />
          </CardContent>
        </Card>
      )}

      {result && !planMutation.isPending && (
        <Card className="border-border/80 animate-in slide-in-from-bottom-4 duration-500 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-primary to-accent" />
          <CardHeader>
            <CardTitle className="text-xl">Your Workflow is Ready</CardTitle>
            <CardDescription>
              Based on the {result.templateId} template.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-secondary/30 p-4 rounded-xl border border-border/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                AI Notes
              </h3>
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground prose-p:leading-relaxed">
                <ReactMarkdown>{result.notes}</ReactMarkdown>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Button 
                size="lg" 
                className="flex-1 sm:flex-none shadow-md hover:shadow-lg transition-shadow"
                onClick={handleOpenInGenerate}
              >
                <FileJson className="w-4 h-4 mr-2" />
                Open in Generate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
