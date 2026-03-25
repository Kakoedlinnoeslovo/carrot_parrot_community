import type { Edge, Node } from "@xyflow/react";
import type { WorkflowGraph } from "@/lib/workflow-graph";
import { workflowGraphSchema } from "@/lib/workflow-graph";

export function graphToFlow(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => {
      if (n.type === "input_prompt") {
        return {
          id: n.id,
          type: "input_prompt",
          position: n.position,
          data: { prompt: n.data.prompt },
        };
      }
      return {
        id: n.id,
        type: "fal_model",
        position: n.position,
        data: { prompt: n.data.prompt, falModelId: n.data.falModelId },
      };
    }),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  };
}

export function flowToGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  const wNodes = nodes.map((n) => {
    if (n.type === "input_prompt") {
      const d = n.data as { prompt?: string };
      return {
        id: n.id,
        type: "input_prompt" as const,
        position: n.position,
        data: { prompt: d.prompt ?? "" },
      };
    }
    if (n.type === "fal_model") {
      const d = n.data as { prompt?: string; falModelId?: string };
      return {
        id: n.id,
        type: "fal_model" as const,
        position: n.position,
        data: {
          falModelId: (d.falModelId ?? "fal-ai/flux/schnell") as "fal-ai/flux/schnell",
          prompt: d.prompt?.trim() ? d.prompt : "scene",
        },
      };
    }
    throw new Error(`Unsupported node type: ${n.type}`);
  });
  const wEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));
  const graph = { nodes: wNodes, edges: wEdges };
  return workflowGraphSchema.parse(graph);
}
