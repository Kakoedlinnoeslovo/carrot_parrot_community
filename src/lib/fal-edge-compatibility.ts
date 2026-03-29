/**
 * Static edge compatibility for workflow graphs (editor + optional server validation).
 * Does not prove runtime artifact shapes — uses OpenAPI key lists and optional JSON Schema fragments.
 */

import type { WorkflowGraph, WorkflowNode } from "@/lib/workflow-graph";
import {
  isOutputPrimarilyTextual,
  isRasterImageInputKey,
  isTextLikeInputKey,
} from "@/lib/fal-openapi-wiring";

export type EdgeCompatibilityLevel = "ok" | "warn" | "error";

export type EdgeCompatibilityResult = {
  level: EdgeCompatibilityLevel;
  reason: string;
  /** When schema allows auto-fix at merge time (e.g. wrap string in array). */
  coercible?: boolean;
};

type MinimalFalData = {
  openapiOutputKeys?: string[];
  openapiInputKeys?: string[];
};

/** JSON Schema fragment for a single input property (queue input schema). */
export type JsonSchemaPropertyFragment = Record<string, unknown> | null | undefined;

function hasMediaOutputKeys(keys: string[]): boolean {
  return keys.some((k) => {
    const lower = k.toLowerCase();
    if (/^(images|image|video|videos|media|audio)$/i.test(k)) return true;
    if (/_url$|_urls$/i.test(lower) || /^(url|urls)$/i.test(lower)) return true;
    return false;
  });
}

function hasTextOutputKeys(keys: string[]): boolean {
  return keys.some((k) => /^(text|output|caption|content)$/i.test(k));
}

/**
 * What kind of signal a fal_model `out` port tends to emit, from OpenAPI output keys only.
 */
export function inferFalModelSourceKind(
  openapiOutputKeys: string[] | undefined,
  sourceHandle: string | null | undefined,
): "text" | "image" | "mixed" | "any" {
  const sh = sourceHandle ?? "out";
  if (sh === "text" || sh === "prompt") return "text";
  if (sh === "images" || sh === "image" || /^(video|videos|audio|media|data)$/i.test(sh)) {
    return "image";
  }
  if (sh !== "out" && sh !== "") return "any";

  const keys = openapiOutputKeys?.length ? openapiOutputKeys : [];
  if (keys.length === 0) return "any";

  if (isOutputPrimarilyTextual(openapiOutputKeys)) return "text";

  const hasMedia = hasMediaOutputKeys(keys);
  const hasText = hasTextOutputKeys(keys);
  if (hasMedia && hasText) return "mixed";
  if (hasMedia) return "image";
  if (hasText) return "text";
  return "any";
}

export type TargetFieldExpectation = "text" | "image" | "any";

export function inferTargetFieldExpectation(targetHandle: string | null | undefined): TargetFieldExpectation {
  const h = (targetHandle ?? "").trim();
  if (!h) return "any";
  if (isRasterImageInputKey(h)) return "image";
  if (isTextLikeInputKey(h)) return "text";
  return "any";
}

function inferInputNodeSourceKind(
  source: WorkflowNode,
  sourceHandle: string | null | undefined,
): "text" | "image" | "any" {
  if (source.type === "input_prompt") return "text";
  if (source.type === "input_image") return "image";
  if (source.type === "input_group") {
    const slots = source.data.slots ?? [];
    const slot = slots.find((s) => s.id === sourceHandle);
    if (slot?.kind === "image") return "image";
    if (slot?.kind === "text") return "text";
    return "any";
  }
  return "any";
}

function schemaSuggestsStringArray(prop: JsonSchemaPropertyFragment): boolean {
  if (!prop || typeof prop !== "object") return false;
  const p = prop as { type?: unknown; items?: unknown };
  if (p.type === "array") {
    const items = p.items;
    if (items && typeof items === "object" && !Array.isArray(items)) {
      const it = items as { type?: unknown };
      if (it.type === "string") return true;
    }
    return true;
  }
  if (Array.isArray(p.type) && p.type.includes("array")) return true;
  return false;
}

function schemaSuggestsNumber(prop: JsonSchemaPropertyFragment): boolean {
  if (!prop || typeof prop !== "object") return false;
  const p = prop as { type?: unknown };
  const t = p.type;
  if (t === "number" || t === "integer") return true;
  if (Array.isArray(t) && (t.includes("number") || t.includes("integer"))) return true;
  return false;
}

/**
 * Classify a single edge using graph structure and optional OpenAPI hints.
 */
export function classifyEdgeCompatibility(args: {
  source: WorkflowNode;
  targetHandle: string | null | undefined;
  sourceHandle: string | null | undefined;
  /** Queue input schema `properties[targetHandle]` when available. */
  targetPropertySchema?: JsonSchemaPropertyFragment;
}): EdgeCompatibilityResult {
  const { source, targetHandle, sourceHandle, targetPropertySchema } = args;
  const th = (targetHandle ?? "").trim();
  if (!th) {
    return { level: "error", reason: "fal_model inputs need a named target field (no empty handle)." };
  }

  const want = inferTargetFieldExpectation(targetHandle);

  let srcKind: "text" | "image" | "mixed" | "any";
  if (source.type === "fal_model") {
    const d = source.data as MinimalFalData;
    srcKind = inferFalModelSourceKind(d.openapiOutputKeys, sourceHandle);
  } else {
    const k = inferInputNodeSourceKind(source, sourceHandle);
    srcKind = k === "any" ? "any" : k;
  }

  if (want === "any") {
    return { level: "ok", reason: "Generic input field — any upstream type is allowed." };
  }

  if (srcKind === "any") {
    return {
      level: "warn",
      reason:
        "Upstream output shape is unknown (missing OpenAPI hints). Verify this wire at run time.",
    };
  }

  // Definite kind mismatches (input nodes and fal sources with known kind)
  if (want === "text" && srcKind === "image") {
    return {
      level: "error",
      reason: "Text input required but upstream provides image/URLs only.",
    };
  }
  if (want === "image" && srcKind === "text") {
    return {
      level: "error",
      reason: "Image/URL input required but upstream provides text only.",
    };
  }

  if (srcKind === "mixed") {
    if (want === "text" || want === "image") {
      return {
        level: "warn",
        reason:
          "Upstream emits both text and media; this target uses only one kind. Confirm the artifact matches.",
      };
    }
  }

  // Schema-aware hints (optional)
  if (targetPropertySchema && typeof targetPropertySchema === "object") {
    if (schemaSuggestsStringArray(targetPropertySchema) && want === "image") {
      return {
        level: "ok",
        reason: "Array of strings matches URL list fields; merge can coerce a single URL to an array if needed.",
        coercible: true,
      };
    }
    if (schemaSuggestsNumber(targetPropertySchema) && (srcKind === "text" || srcKind === "mixed")) {
      return {
        level: "warn",
        reason:
          "Target field expects a number; upstream provides text. Ensure the text is numeric or set the field manually.",
      };
    }
  }

  return { level: "ok", reason: "Wire kinds match." };
}

function nodeById(graph: WorkflowGraph, id: string): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/**
 * Classify every edge in the graph. Skips edges not targeting fal_model or without explicit target handles.
 */
export function classifyWorkflowGraphEdges(
  graph: WorkflowGraph,
  targetPropertySchemaByEndpointAndKey?: Map<string, Map<string, JsonSchemaPropertyFragment>>,
): Map<string, EdgeCompatibilityResult> {
  const out = new Map<string, EdgeCompatibilityResult>();

  for (const e of graph.edges) {
    const target = nodeById(graph, e.target);
    if (!target || target.type !== "fal_model") continue;
    const th = e.targetHandle ?? null;
    if (!th || !String(th).trim() || th === "in") continue;

    const source = nodeById(graph, e.source);
    if (!source) continue;

    const endpointId =
      target.type === "fal_model" ? String((target.data as { falModelId?: string }).falModelId ?? "").trim() : "";

    let propSchema: JsonSchemaPropertyFragment = undefined;
    if (endpointId && targetPropertySchemaByEndpointAndKey) {
      const m = targetPropertySchemaByEndpointAndKey.get(endpointId);
      propSchema = m?.get(th);
    }

    const result = classifyEdgeCompatibility({
      source,
      targetHandle: th,
      sourceHandle: e.sourceHandle ?? null,
      targetPropertySchema: propSchema,
    });
    out.set(e.id, result);
  }

  return out;
}

export function graphHasBlockingEdgeIssues(classifications: Map<string, EdgeCompatibilityResult>): boolean {
  for (const r of classifications.values()) {
    if (r.level === "error") return true;
  }
  return false;
}

/**
 * Build `endpointId → (inputKey → JSON Schema property)` from editor `detailByEndpoint` queue input schemas.
 */
export function buildPropertySchemaMapFromInputSchemas(
  detailByEndpoint: Record<string, { input: unknown } | undefined>,
  endpointIds: Iterable<string>,
): Map<string, Map<string, JsonSchemaPropertyFragment>> {
  const out = new Map<string, Map<string, JsonSchemaPropertyFragment>>();
  for (const id of endpointIds) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    const detail = detailByEndpoint[trimmed];
    const input = detail?.input;
    if (!input || typeof input !== "object") continue;
    const props = (input as { properties?: Record<string, unknown> }).properties;
    if (!props || typeof props !== "object") continue;
    const inner = new Map<string, JsonSchemaPropertyFragment>();
    for (const [k, v] of Object.entries(props)) {
      inner.set(k, v as JsonSchemaPropertyFragment);
    }
    out.set(trimmed, inner);
  }
  return out;
}
