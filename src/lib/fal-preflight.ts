import type { WorkflowGraph, WorkflowNode } from "@/lib/workflow-graph";
import { isRasterImageInputKey } from "@/lib/fal-openapi-wiring";

/**
 * If an explicit wire targets a raster field (e.g. `image_urls`) but the sanitized payload has no
 * value there, fail before queue.submit with a clear message (avoids fal 422 + stuck polling).
 */
export function missingWiredRasterInputsMessage(
  graph: WorkflowGraph,
  node: Extract<WorkflowNode, { type: "fal_model" }>,
  sanitized: Record<string, unknown>,
): string | null {
  const edges = graph.edges.filter((e) => e.target === node.id);
  for (const e of edges) {
    const h = e.targetHandle?.trim();
    if (!h || h === "in") continue;
    if (!isRasterImageInputKey(h)) continue;
    const v = sanitized[h];
    const missing =
      v === undefined ||
      v === null ||
      (typeof v === "string" && !v.trim()) ||
      (Array.isArray(v) && v.length === 0);
    if (missing) {
      return `${h} is required for this connection — add an image URL or connect a valid image upstream.`;
    }
  }
  return null;
}
