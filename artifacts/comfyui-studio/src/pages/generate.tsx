import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { 
  useListWorkflows, 
  useGetWorkflow, 
  useCreateJob, 
  getGetWorkflowQueryKey 
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { FileUpload } from "@/components/ui/file-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Play, LayoutGrid, Code, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CUSTOM_WORKFLOW_ID = "custom-workflow";

export default function Generate() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const categoryFilter = searchParams.get('category');
  
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  
  const { data: workflows, isLoading: isListLoading } = useListWorkflows();

  const filteredWorkflows = useMemo(() => {
    if (!workflows) return [];
    if (!categoryFilter) return workflows;
    return workflows.filter(w => w.category === categoryFilter);
  }, [workflows, categoryFilter]);

  if (selectedWorkflowId === CUSTOM_WORKFLOW_ID) {
    return <CustomWorkflowForm onBack={() => setSelectedWorkflowId(null)} />;
  }

  if (selectedWorkflowId) {
    return <WorkflowForm 
      workflowId={selectedWorkflowId} 
      onBack={() => setSelectedWorkflowId(null)} 
    />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <LayoutGrid className="h-8 w-8 text-primary" />
          Templates
        </h1>
        <p className="text-muted-foreground mt-2">
          Select a workflow template to begin generating.
        </p>
      </div>

      {isListLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkflows.map(workflow => (
            <Card 
              key={workflow.id} 
              className="cursor-pointer hover:border-primary transition-colors hover-elevate overflow-hidden group"
              onClick={() => setSelectedWorkflowId(workflow.id)}
            >
              <div className="h-2 bg-gradient-to-r from-primary to-accent opacity-50 group-hover:opacity-100 transition-opacity" />
              <CardHeader>
                <CardTitle className="flex justify-between items-start">
                  <span>{workflow.name}</span>
                </CardTitle>
                <CardDescription className="line-clamp-2 mt-2 text-sm">{workflow.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mt-4 text-xs font-medium text-muted-foreground">
                  <span className="bg-secondary px-2 py-1 rounded capitalize">{workflow.category.replace('-', ' ')}</span>
                  {workflow.estimatedTime && (
                    <span className="flex items-center gap-1">⏱ {workflow.estimatedTime}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {filteredWorkflows.length === 0 && !isListLoading && (
         <div className="text-center p-12 border border-dashed rounded-xl text-muted-foreground">
           No workflows found for this category.
         </div>
      )}
    </div>
  );
}

function CustomWorkflowForm({ onBack }: { onBack: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createJob = useCreateJob();
  const [workflowJson, setWorkflowJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const validateJson = (value: string): boolean => {
    if (!value.trim()) {
      setJsonError("Workflow JSON is required.");
      return false;
    }
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setJsonError("Workflow JSON must be an object (the ComfyUI API-format prompt graph).");
        return false;
      }
      setJsonError(null);
      return true;
    } catch (err: any) {
      setJsonError(`Invalid JSON: ${err.message}`);
      return false;
    }
  };

  const handleChange = (value: string) => {
    setWorkflowJson(value);
    if (jsonError) validateJson(value);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateJson(workflowJson)) return;

    createJob.mutate(
      { data: { workflowId: CUSTOM_WORKFLOW_ID, params: { workflow_json: workflowJson } } },
      {
        onSuccess: () => {
          toast({ title: "Job created successfully!" });
          setLocation("/jobs");
        },
        onError: (err: any) => {
          toast({ title: "Failed to create job", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="animate-in slide-in-from-right-8 duration-300">
      <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <Card className="border-border">
          <CardHeader className="bg-secondary/30 border-b">
            <CardTitle className="text-2xl flex items-center gap-2">
              <Code className="h-6 w-6 text-primary" />
              Custom Workflow
            </CardTitle>
            <CardDescription>
              Paste your ComfyUI API-format workflow JSON and run it directly on your server.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Alert className="mb-6 border-primary/30 bg-primary/5">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                Export your workflow from ComfyUI using <strong>Save (API format)</strong> in the settings menu, then paste the resulting JSON below. The workflow is submitted unchanged to your ComfyUI server.
              </AlertDescription>
            </Alert>

            <form id="custom-workflow-form" onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base">
                  Workflow JSON <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={workflowJson}
                  onChange={(e) => handleChange(e.target.value)}
                  placeholder={'{\n  "1": {\n    "class_type": "KSampler",\n    "inputs": { ... }\n  }\n}'}
                  className={`font-mono text-xs min-h-[400px] resize-y ${jsonError ? "border-destructive" : ""}`}
                  spellCheck={false}
                />
                {jsonError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {jsonError}
                  </p>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Ready?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="submit"
                form="custom-workflow-form"
                size="lg"
                className="w-full text-base py-6 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all"
                disabled={createJob.isPending}
              >
                {createJob.isPending ? "Starting Job..." : (
                  <>
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Run Workflow
                  </>
                )}
              </Button>
              <div className="text-xs text-muted-foreground text-center">
                This job will be added to your queue.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function WorkflowForm({ workflowId, onBack }: { workflowId: string, onBack: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: workflow, isLoading } = useGetWorkflow(workflowId, {
    query: {
      enabled: !!workflowId,
      queryKey: getGetWorkflowQueryKey(workflowId)
    }
  });

  const createJob = useCreateJob();
  const [formData, setFormData] = useState<Record<string, any>>({});

  const handleParamChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflow) return;

    // Validate required fields
    for (const param of workflow.params) {
      if (param.required && formData[param.key] === undefined && param.defaultValue === undefined) {
        toast({ title: `Missing required field: ${param.label}`, variant: "destructive" });
        return;
      }
    }

    // Merge defaults
    const finalParams = { ...formData };
    for (const param of workflow.params) {
      if (finalParams[param.key] === undefined && param.defaultValue !== undefined) {
        finalParams[param.key] = param.defaultValue;
      }
    }

    createJob.mutate({
      data: {
        workflowId: workflow.id,
        params: finalParams
      }
    }, {
      onSuccess: (job) => {
        toast({ title: "Job created successfully!" });
        setLocation("/jobs");
      },
      onError: (err: any) => {
        toast({ title: "Failed to create job", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading || !workflow) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-[400px] w-full max-w-2xl rounded-xl" />
      </div>
    );
  }

  return (
    <div className="animate-in slide-in-from-right-8 duration-300">
      <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <Card className="border-border">
          <CardHeader className="bg-secondary/30 border-b">
            <CardTitle className="text-2xl">{workflow.name}</CardTitle>
            <CardDescription>{workflow.description}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form id="workflow-form" onSubmit={onSubmit} className="space-y-6">
              {workflow.params.map(param => {
                const value = formData[param.key] !== undefined ? formData[param.key] : (param.defaultValue || "");
                
                return (
                  <div key={param.key} className="space-y-2">
                    <Label className="flex items-center justify-between text-base">
                      <span>{param.label} {param.required && <span className="text-destructive">*</span>}</span>
                    </Label>
                    {param.description && <p className="text-sm text-muted-foreground">{param.description}</p>}
                    
                    {param.type === 'text' && (
                      param.max && param.max > 100 ? (
                        <Textarea 
                          value={value}
                          onChange={(e) => handleParamChange(param.key, e.target.value)}
                          placeholder={param.defaultValue?.toString() || ""}
                          className="font-mono text-sm h-32"
                        />
                      ) : (
                        <Input 
                          type="text" 
                          value={value}
                          onChange={(e) => handleParamChange(param.key, e.target.value)}
                          placeholder={param.defaultValue?.toString() || ""}
                        />
                      )
                    )}

                    {param.type === 'number' && (
                      <Input 
                        type="number" 
                        value={value}
                        onChange={(e) => handleParamChange(param.key, Number(e.target.value))}
                        min={param.min || undefined}
                        max={param.max || undefined}
                      />
                    )}

                    {param.type === 'slider' && (
                      <div className="pt-4 pb-2">
                        <Slider 
                          value={[Number(value) || 0]} 
                          min={param.min || 0} 
                          max={param.max || 100}
                          step={1}
                          onValueChange={(v) => handleParamChange(param.key, v[0])}
                        />
                        <div className="mt-2 text-right text-sm text-primary font-mono font-medium">
                          {value}
                        </div>
                      </div>
                    )}

                    {param.type === 'select' && (
                      <Select value={value} onValueChange={(v) => handleParamChange(param.key, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          {param.options?.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {param.type === 'file' && (
                      <FileUpload 
                        accept={param.accept || undefined}
                        onFileSelect={(filename) => handleParamChange(param.key, filename)}
                      />
                    )}
                  </div>
                );
              })}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Ready?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                type="submit" 
                form="workflow-form"
                size="lg" 
                className="w-full text-base py-6 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all"
                disabled={createJob.isPending}
              >
                {createJob.isPending ? "Starting Job..." : (
                  <>
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Generate
                  </>
                )}
              </Button>
              <div className="text-xs text-muted-foreground text-center">
                This job will be added to your queue.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
