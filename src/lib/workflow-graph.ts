import { z } from "zod";
import {
  inferPrimaryImageInputKeyFromKeyList,
  isOutputPrimarilyTextual,
  pickFirstTextInputKey,
} from "@/lib/fal-openapi-wiring";
import { isQueueInfraOutputKey } from "@/lib/fal-schema-handles";

const falEndpointIdSchema = z
  .string()
  .min(3)
  .refine((s) => s.includes("/"), "Must look like a fal endpoint id (e.g. fal-ai/flux/schnell)");

const falModelDataSchema = z.preprocess((raw) => {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const o = raw as Record<string, unknown>;
  let falInput = o.falInput;
  if (falInput == null || typeof falInput !== "object" || Array.isArray(falInput)) {
    falInput = {};
  } else {
    falInput = { ...(falInput as Record<string, unknown>) };
  }
  const fi = falInput as Record<string, unknown>;
  if (typeof o.prompt === "string" && fi.prompt === undefined) {
    fi.prompt = o.prompt;
  }
  return { ...o, falInput: fi };
}, z.object({
  falModelId: falEndpointIdSchema,
  falInput: z.record(z.string(), z.unknown()),
  prompt: z.string().optional(),
  /** From OpenAPI listMappableInputKeysFromSchema — drives legacy edge migration and handles. */
  openapiInputKeys: z.array(z.string()).optional(),
  openapiOutputKeys: z.array(z.string()).optional(),
  /** Computed from input schema (audio + image_url vs start_image_url, etc.). */
  primaryImageInputKey: z.string().optional(),
}));

const inputSlotSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "text"]),
  label: z.string().default(""),
  value: z.string().default(""),
});

export const workflowNodeSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("input_prompt"),
    data: z.object({
      prompt: z.string().default(""),
    }),
    position: z.object({ x: z.number(), y: z.number() }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("input_image"),
    data: z.object({
      /** Public https URL or data:image/… URI after optional file upload */
      imageUrl: z.string().default(""),
    }),
    position: z.object({ x: z.number(), y: z.number() }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("input_group"),
    data: z.object({
      /** Named slots; each has a source handle `id` for edges */
      slots: z.array(inputSlotSchema).default([]),
    }),
    position: z.object({ x: z.number(), y: z.number() }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("output_preview"),
    data: z.object({
      title: z.string().default("Result"),
    }),
    position: z.object({ x: z.number(), y: z.number() }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("fal_model"),
    data: falModelDataSchema,
    position: z.object({ x: z.number(), y: z.number() }),
  }),
]);

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export const workflowGraphSchema = z
  .object({
    nodes: z.array(workflowNodeSchema),
    edges: z.array(workflowEdgeSchema),
  })
  .superRefine((g, ctx) => {
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      if (!nodeIds.has(e.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge references missing source node: ${e.source}`,
        });
      }
      if (!nodeIds.has(e.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge references missing target node: ${e.target}`,
        });
      }
    }
  });

export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

function isLegacyFalTarget(th: string | null | undefined): boolean {
  return th == null || th === "" || th === "in";
}

function pickImageInputKeyForTarget(tgt: WorkflowNode & { type: "fal_model" }): string {
  const d = tgt.data;
  if (typeof d.primaryImageInputKey === "string" && d.primaryImageInputKey.trim()) {
    return d.primaryImageInputKey.trim();
  }
  return inferPrimaryImageInputKeyFromKeyList(d.openapiInputKeys);
}

/** Best-effort explicit fal input for edges that used legacy `in` / missing targetHandle. */
function inferLegacyTargetHandle(graph: WorkflowGraph, edge: WorkflowEdge): string {
  const src = graph.nodes.find((n) => n.id === edge.source);
  const tgt = graph.nodes.find((n) => n.id === edge.target);
  if (!src || tgt?.type !== "fal_model") return "prompt";

  if (src.type === "input_prompt") return "prompt";
  if (src.type === "input_image") return "image_url";

  if (src.type === "input_group") {
    const slots = src.data.slots ?? [];
    const slot = slots.find((s) => s.id === edge.sourceHandle);
    if (slot?.kind === "text") return "prompt";
    return "image_url";
  }

  if (src.type === "fal_model") {
    let sh = edge.sourceHandle ?? "out";
    if (sh && isQueueInfraOutputKey(sh)) sh = "out";
    if (sh === "images" || sh === "media") return pickImageInputKeyForTarget(tgt);
    if (sh === "text") return "prompt";
    if (sh === "out" || sh === "") {
      const srcData = src.data as {
        openapiOutputKeys?: string[];
      };
      const tgtData = tgt.data as {
        openapiInputKeys?: string[];
        primaryImageInputKey?: string;
      };
      if (isOutputPrimarilyTextual(srcData.openapiOutputKeys)) {
        return pickFirstTextInputKey(tgtData.openapiInputKeys);
      }
      const tgtKeys = tgtData.openapiInputKeys;
      const hasRasterIn = tgtKeys?.some((k) =>
        /image|frame|mask|start_image|garment|model_|reference/i.test(k),
      );
      if (hasRasterIn) {
        return pickImageInputKeyForTarget(tgt);
      }
      // Typical fal → fal: prior image into img2img / edit — default raster field
      return pickImageInputKeyForTarget(tgt);
    }
    return "prompt";
  }

  return "prompt";
}

/**
 * Single fal output handle `out`, no legacy `in` targets; remaps old source handles to `out`.
 */
export function migrateWorkflowGraphEdges(graph: WorkflowGraph): WorkflowGraph {
  const typeById = new Map(graph.nodes.map((n) => [n.id, n.type]));
  const edges = graph.edges.map((e) => {
    let targetHandle = e.targetHandle;
    if (typeById.get(e.target) === "fal_model" && isLegacyFalTarget(targetHandle)) {
      targetHandle = inferLegacyTargetHandle(graph, e);
    }

    let sourceHandle = e.sourceHandle;
    if (typeById.get(e.source) === "fal_model" && sourceHandle && isQueueInfraOutputKey(sourceHandle)) {
      sourceHandle = "out";
    }
    if (
      typeById.get(e.source) === "fal_model" &&
      (sourceHandle === "text" || sourceHandle === "images" || sourceHandle === "media")
    ) {
      sourceHandle = "out";
    }

    return { ...e, sourceHandle, targetHandle };
  });

  return { ...graph, edges };
}

export function parseWorkflowGraph(json: string): WorkflowGraph {
  const raw = JSON.parse(json) as unknown;
  const parsed = workflowGraphSchema.parse(raw);
  return migrateWorkflowGraphEdges(parsed);
}

export function safeParseWorkflowGraph(json: string) {
  try {
    const raw = JSON.parse(json) as unknown;
    const r = workflowGraphSchema.safeParse(raw);
    if (!r.success) return r;
    return { success: true as const, data: migrateWorkflowGraphEdges(r.data) };
  } catch {
    return { success: false as const, error: new Error("Invalid JSON") };
  }
}

/** Returns true if the directed graph has a cycle (invalid for MVP execution). */
export function hasCycle(graph: WorkflowGraph): boolean {
  const ids = graph.nodes.map((n) => n.id);
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of graph.edges) {
    adj.get(e.source)?.push(e.target);
  }
  const state = new Map<string, 0 | 1 | 2>(); // 0=unseen, 1=stack, 2=done

  function dfs(u: string): boolean {
    const s = state.get(u) ?? 0;
    if (s === 2) return false;
    if (s === 1) return true;
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      if (dfs(v)) return true;
    }
    state.set(u, 2);
    return false;
  }

  for (const id of ids) {
    if (dfs(id)) return true;
  }
  return false;
}

export function assertAcyclic(graph: WorkflowGraph) {
  if (hasCycle(graph)) {
    throw new Error("Workflow graph must be acyclic.");
  }
}
