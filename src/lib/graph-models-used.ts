import type { WorkflowGraph } from "@/lib/workflow-graph";

export type FalModelUsedRow = { id: string; count: number };

/**
 * fal_model endpoints in graph node order, aggregated with counts when duplicated.
 */
export function extractFalModelsUsed(graph: WorkflowGraph): FalModelUsedRow[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const n of graph.nodes) {
    if (n.type !== "fal_model") continue;
    const id = n.data.falModelId?.trim() ?? "";
    if (!id) continue;
    if (!counts.has(id)) {
      order.push(id);
      counts.set(id, 1);
    } else {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return order.map((id) => ({ id, count: counts.get(id) ?? 1 }));
}
