import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  Node,
  Edge,
  MarkerType
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { AlertCircle } from "lucide-react";

// Dagre is often used for layout, but let's do a simple layered depth layout.
function generateLayout(nodesInfo: Record<string, any>) {
  const nodeMap = new Map<string, any>();
  const incomingCount = new Map<string, number>();
  const children = new Map<string, string[]>();

  // Init
  for (const [id, node] of Object.entries(nodesInfo)) {
    nodeMap.set(id, node);
    incomingCount.set(id, 0);
    children.set(id, []);
  }

  // Build graph
  for (const [id, node] of Object.entries(nodesInfo)) {
    if (!node.inputs) continue;
    for (const val of Object.values(node.inputs)) {
      if (Array.isArray(val) && val.length >= 2 && typeof val[0] === "string") {
        const sourceId = val[0];
        if (nodeMap.has(sourceId)) {
          incomingCount.set(id, (incomingCount.get(id) || 0) + 1);
          children.get(sourceId)?.push(id);
        }
      }
    }
  }

  // Topo sort & level assignment
  const depths = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, count] of incomingCount.entries()) {
    if (count === 0) {
      depths.set(id, 0);
      queue.push(id);
    }
  }

  let maxDepth = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currDepth = depths.get(curr)!;
    maxDepth = Math.max(maxDepth, currDepth);

    for (const child of children.get(curr) || []) {
      const inc = incomingCount.get(child)! - 1;
      incomingCount.set(child, inc);
      const childDepth = Math.max(depths.get(child) || 0, currDepth + 1);
      depths.set(child, childDepth);
      if (inc === 0) {
        queue.push(child);
      }
    }
  }

  // For any cycle leftovers, assign maxDepth + 1
  for (const [id, count] of incomingCount.entries()) {
    if (count > 0 && !depths.has(id)) {
      depths.set(id, maxDepth + 1);
    }
  }

  // Position nodes
  const nodesByDepth: Record<number, string[]> = {};
  for (const [id, node] of Object.entries(nodesInfo)) {
    const d = depths.get(id) || 0;
    if (!nodesByDepth[d]) nodesByDepth[d] = [];
    nodesByDepth[d].push(id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const nodeWidth = 220;
  const nodeHeight = 120;
  const xGap = 100;
  const yGap = 50;

  for (const [dStr, ids] of Object.entries(nodesByDepth)) {
    const d = parseInt(dStr, 10);
    const x = d * (nodeWidth + xGap);
    ids.forEach((id, idx) => {
      const y = idx * (nodeHeight + yGap);
      positions.set(id, { x, y });
    });
  }

  return positions;
}

const ComfyNode = ({ data }: { data: any }) => {
  return (
    <Card className="w-[200px] border-primary/20 bg-card/80 backdrop-blur-sm shadow-md rounded-xl overflow-hidden">
      <Handle type="target" position={Position.Left} className="w-2 h-6 rounded-sm bg-muted-foreground border-none left-[-4px]" />
      <div className="px-3 py-2 bg-secondary/50 border-b border-primary/10 flex items-center gap-2">
        <Layers className="h-3 w-3 text-primary" />
        <span className="text-xs font-bold font-display truncate text-foreground/90">{data.label}</span>
      </div>
      <div className="p-3 bg-card/50 text-[10px] text-muted-foreground break-all max-h-[80px] overflow-hidden">
        ID: {data.id}
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-6 rounded-sm bg-primary border-none right-[-4px]" />
    </Card>
  );
};

const nodeTypes = {
  comfy: ComfyNode,
};

export function WorkflowVisualizer({ jsonString }: { jsonString: string }) {
  const { nodes, edges, error } = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonString);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("JSON must be a record mapping node IDs to node configurations.");
      }

      const positions = generateLayout(parsed);
      const outNodes: Node[] = [];
      const outEdges: Edge[] = [];

      for (const [id, node] of Object.entries(parsed)) {
        const info = node as any;
        const pos = positions.get(id) || { x: 0, y: 0 };
        
        outNodes.push({
          id,
          type: "comfy",
          position: pos,
          data: { label: info.class_type || "Unknown Node", id },
        });

        if (info.inputs) {
          for (const [inputName, val] of Object.entries(info.inputs)) {
            if (Array.isArray(val) && val.length >= 2 && typeof val[0] === "string") {
              const sourceId = val[0];
              outEdges.push({
                id: `e-${sourceId}-${id}-${inputName}`,
                source: sourceId,
                target: id,
                animated: true,
                style: { stroke: 'hsl(var(--primary))', strokeWidth: 2, opacity: 0.5 },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: 'hsl(var(--primary))',
                  width: 15,
                  height: 15,
                },
              });
            }
          }
        }
      }

      return { nodes: outNodes, edges: outEdges, error: null };
    } catch (err: any) {
      return { nodes: [] as Node[], edges: [] as Edge[], error: err.message as string };
    }
  }, [jsonString]);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <AlertCircle className="h-8 w-8 mb-4 text-destructive" />
        <p>Invalid workflow JSON to visualize.</p>
        <p className="text-xs mt-2 opacity-50">{error}</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground p-8">
        Empty workflow. Add nodes to see the diagram.
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[400px] bg-background/50 rounded-md overflow-hidden border border-border/50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        className="dark"
        minZoom={0.1}
      >
        <Background gap={12} size={1} color="hsl(var(--muted-foreground)/0.2)" />
        <Controls className="fill-foreground text-foreground border-border bg-card" />
      </ReactFlow>
    </div>
  );
}
