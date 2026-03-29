import replicateMarketingAd from "@/lib/templates/replicate-marketing-ad.json";
import {
  assertAcyclic,
  parseWorkflowGraph,
  safeParseWorkflowGraph,
  type WorkflowGraph,
} from "@/lib/workflow-graph";

const TEMPLATE: WorkflowGraph = parseWorkflowGraph(JSON.stringify(replicateMarketingAd));

/**
 * Canonical marketing-ad remix graph: input video → extract audio/frames → Nano Banana → Kling i2v → mux → preview.
 * Invariants: single `input_video` node id `iv1`; video URL is injected there.
 */
export function getReplicateMarketingAdTemplate(): WorkflowGraph {
  return JSON.parse(JSON.stringify(TEMPLATE)) as WorkflowGraph;
}

export function buildReplicateWorkflowFromVideoUrl(videoUrl: string): WorkflowGraph {
  const trimmed = videoUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Video URL must start with http:// or https://");
  }
  const g = getReplicateMarketingAdTemplate();
  const iv = g.nodes.find((n) => n.id === "iv1" && n.type === "input_video");
  if (!iv || iv.type !== "input_video") {
    throw new Error("Template missing input_video iv1");
  }
  iv.data.videoUrl = trimmed;
  assertAcyclic(g);
  const parsed = safeParseWorkflowGraph(JSON.stringify(g));
  if (!parsed.success) {
    throw new Error("Generated graph invalid");
  }
  return parsed.data;
}

export function validateReplicateMarketingGraph(graphJson: string): boolean {
  const p = safeParseWorkflowGraph(graphJson);
  if (!p.success) return false;
  try {
    assertAcyclic(p.data);
  } catch {
    return false;
  }
  return p.data.nodes.some((n) => n.type === "input_video");
}
