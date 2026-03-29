import { nanoid } from "nanoid";
import { z } from "zod";
import {
  migrateWorkflowGraphEdges,
  workflowGraphSchema,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/lib/workflow-graph";

export const WORKFLOW_CLIPBOARD_PREFIX = "carrot_parrot_workflow_clipboard:v1:" as const;

const clipboardPayloadSchema = z.object({
  graph: workflowGraphSchema,
});

/**
 * Text written to the system clipboard for a single-node workflow fragment.
 */
export function serializeWorkflowClipboard(graph: WorkflowGraph): string {
  return WORKFLOW_CLIPBOARD_PREFIX + JSON.stringify({ graph });
}

/**
 * Parses clipboard text into a validated graph, or null if not our payload or invalid.
 * Only accepts exactly one node and no edges (single-node copy contract).
 */
export function parseWorkflowClipboard(text: string): WorkflowGraph | null {
  if (!text.startsWith(WORKFLOW_CLIPBOARD_PREFIX)) return null;
  const json = text.slice(WORKFLOW_CLIPBOARD_PREFIX.length);
  try {
    const raw = JSON.parse(json) as unknown;
    const p = clipboardPayloadSchema.safeParse(raw);
    if (!p.success) return null;
    const g = migrateWorkflowGraphEdges(p.data.graph);
    if (g.nodes.length !== 1 || g.edges.length !== 0) return null;
    return g;
  } catch {
    return null;
  }
}

/**
 * Clone a single-node graph with a fresh node id and fresh input_group slot ids.
 */
export function remapSingleNodePaste(graph: WorkflowGraph): WorkflowGraph {
  if (graph.nodes.length !== 1) {
    throw new Error("remapSingleNodePaste expects exactly one node");
  }
  const n = graph.nodes[0];
  const newNodeId = nanoid(10);
  const next = remapWorkflowNodeIds(n, newNodeId);
  return migrateWorkflowGraphEdges(
    workflowGraphSchema.parse({ nodes: [next], edges: [] }),
  );
}

function remapWorkflowNodeIds(node: WorkflowNode, newId: string): WorkflowNode {
  const pos = { ...node.position };
  if (node.type === "input_group") {
    const slots = (node.data.slots ?? []).map((s) => ({
      ...s,
      id: `slot-${nanoid(6)}`,
    }));
    return { ...node, id: newId, position: pos, data: { slots } };
  }
  return { ...node, id: newId, position: pos } as WorkflowNode;
}
