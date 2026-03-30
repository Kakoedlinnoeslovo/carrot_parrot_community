import type { Edge, Node } from "@xyflow/react";
import type { WorkflowGraph } from "@/lib/workflow-graph";
import {
  mediaProcessOperationSchema,
  migrateWorkflowGraphEdges,
  workflowGraphSchema,
} from "@/lib/workflow-graph";

const DEFAULT_FAL_MODEL = "fal-ai/flux/schnell";
const DEFAULT_FAL_INPUT: Record<string, unknown> = {
  prompt: "Describe the image",
  num_images: 1,
};

export function graphToFlow(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
  const g = migrateWorkflowGraphEdges(graph);
  return {
    nodes: g.nodes.map((n) => {
      if (n.type === "input_prompt") {
        return {
          id: n.id,
          type: "input_prompt",
          position: n.position,
          data: { prompt: n.data.prompt },
        };
      }
      if (n.type === "input_image") {
        return {
          id: n.id,
          type: "input_image",
          position: n.position,
          data: { imageUrl: n.data.imageUrl },
        };
      }
      if (n.type === "input_group") {
        return {
          id: n.id,
          type: "input_group",
          position: n.position,
          data: { slots: n.data.slots },
        };
      }
      if (n.type === "input_video") {
        return {
          id: n.id,
          type: "input_video",
          position: n.position,
          data: { videoUrl: n.data.videoUrl },
        };
      }
      if (n.type === "review_gate") {
        return {
          id: n.id,
          type: "review_gate",
          position: n.position,
          data: { text: n.data.text ?? "" },
        };
      }
      if (n.type === "media_process") {
        return {
          id: n.id,
          type: "media_process",
          position: n.position,
          data: {
            operation: n.data.operation,
            params: n.data.params ?? {},
          },
        };
      }
      if (n.type === "output_preview") {
        return {
          id: n.id,
          type: "output_preview",
          position: n.position,
          data: { title: n.data.title },
        };
      }
      const fd = n.data;
      return {
        id: n.id,
        type: "fal_model",
        position: n.position,
        data: {
          falModelId: fd.falModelId,
          falInput: fd.falInput,
          ...(fd.openapiInputKeys != null ? { openapiInputKeys: fd.openapiInputKeys } : {}),
          ...(fd.openapiOutputKeys != null ? { openapiOutputKeys: fd.openapiOutputKeys } : {}),
          ...(fd.primaryImageInputKey != null && fd.primaryImageInputKey !== ""
            ? { primaryImageInputKey: fd.primaryImageInputKey }
            : {}),
        },
      };
    }),
    edges: g.edges.map((e) => ({
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
    if (n.type === "input_image") {
      const d = n.data as { imageUrl?: string };
      return {
        id: n.id,
        type: "input_image" as const,
        position: n.position,
        data: { imageUrl: d.imageUrl ?? "" },
      };
    }
    if (n.type === "input_group") {
      const d = n.data as {
        slots?: { id: string; kind: "image" | "text"; label: string; value: string }[];
      };
      return {
        id: n.id,
        type: "input_group" as const,
        position: n.position,
        data: { slots: Array.isArray(d.slots) ? d.slots : [] },
      };
    }
    if (n.type === "input_video") {
      const d = n.data as { videoUrl?: string };
      return {
        id: n.id,
        type: "input_video" as const,
        position: n.position,
        data: { videoUrl: d.videoUrl ?? "" },
      };
    }
    if (n.type === "review_gate") {
      const d = n.data as { text?: string };
      return {
        id: n.id,
        type: "review_gate" as const,
        position: n.position,
        data: { text: d.text ?? "" },
      };
    }
    if (n.type === "media_process") {
      const d = n.data as {
        operation?: string;
        params?: {
          fps?: number;
          maxFrames?: number;
          sceneThreshold?: number;
          secondsPerFrame?: number;
          maxWidth?: number;
          index?: number;
          keyframeMaxSegments?: number;
        };
      };
      const parsed = mediaProcessOperationSchema.safeParse(d.operation);
      const op = parsed.success ? parsed.data : "extract_audio";
      return {
        id: n.id,
        type: "media_process" as const,
        position: n.position,
        data: {
          operation: op,
          params: d.params && typeof d.params === "object" ? d.params : {},
        },
      };
    }
    if (n.type === "output_preview") {
      const d = n.data as { title?: string };
      return {
        id: n.id,
        type: "output_preview" as const,
        position: n.position,
        data: { title: d.title?.trim() ? d.title : "Result" },
      };
    }
    if (n.type === "fal_model") {
      const d = n.data as {
        falModelId?: string;
        falInput?: Record<string, unknown>;
        openapiInputKeys?: string[];
        openapiOutputKeys?: string[];
        primaryImageInputKey?: string;
      };
      const falModelId = d.falModelId?.trim() || DEFAULT_FAL_MODEL;
      const raw = d.falInput;
      const falInput =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? { ...raw }
          : { ...DEFAULT_FAL_INPUT };
      return {
        id: n.id,
        type: "fal_model" as const,
        position: n.position,
        data: {
          falModelId,
          falInput,
          ...(d.openapiInputKeys != null ? { openapiInputKeys: d.openapiInputKeys } : {}),
          ...(d.openapiOutputKeys != null ? { openapiOutputKeys: d.openapiOutputKeys } : {}),
          ...(d.primaryImageInputKey != null && d.primaryImageInputKey !== ""
            ? { primaryImageInputKey: d.primaryImageInputKey }
            : {}),
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
  return migrateWorkflowGraphEdges(workflowGraphSchema.parse(graph));
}
