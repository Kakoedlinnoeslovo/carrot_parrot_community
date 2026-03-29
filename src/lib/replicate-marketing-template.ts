import replicateMarketingAd from "@/lib/templates/replicate-marketing-ad.json";
import type { MarketingVideoAnalysis } from "@/lib/marketing-video-analyzer";
import {
  assertAcyclic,
  parseWorkflowGraph,
  safeParseWorkflowGraph,
  type WorkflowGraph,
} from "@/lib/workflow-graph";

function mergeAnalysisIntoGraph(g: WorkflowGraph, analysis: MarketingVideoAnalysis): void {
  const timeline = analysis.segments.map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s`).join("; ");
  const header = `[${analysis.durationSec.toFixed(1)}s, ${analysis.segments.length} segments, ${analysis.segmentationMethod}]`;
  const speech = analysis.speechText
    ? `\nSpoken (local ASR${analysis.speechFromLocalAsr ? "" : " unavailable"}): ${analysis.speechText.slice(0, 1200)}`
    : "";
  const ocr = analysis.ocrText
    ? `\nOn-screen text (OCR${analysis.textFromLocalOcr ? "" : " unavailable"}): ${analysis.ocrText.slice(0, 600)}`
    : "";
  const block = `${header}\nTimeline: ${timeline}${speech}${ocr}`;

  const promptNode = g.nodes.find((n) => n.id === "in_prompt" && n.type === "input_prompt");
  if (promptNode?.type === "input_prompt") {
    const base = promptNode.data.prompt;
    promptNode.data.prompt = `${base}\n\n${block}`.slice(0, 12_000);
  }

  const nano = g.nodes.find((n) => n.id === "nano1" && n.type === "fal_model");
  if (nano?.type === "fal_model") {
    const p = typeof nano.data.falInput?.prompt === "string" ? nano.data.falInput.prompt : "";
    nano.data.falInput = { ...nano.data.falInput, prompt: `${p}\n\n${block}`.slice(0, 8000) };
  }
  const kling = g.nodes.find((n) => n.id === "kling1" && n.type === "fal_model");
  if (kling?.type === "fal_model") {
    const p = typeof kling.data.falInput?.prompt === "string" ? kling.data.falInput.prompt : "";
    kling.data.falInput = {
      ...kling.data.falInput,
      prompt: `${p}\n\nPacing: ${timeline}.\n${block}`.slice(0, 8000),
    };
  }
}

const TEMPLATE: WorkflowGraph = parseWorkflowGraph(JSON.stringify(replicateMarketingAd));

/**
 * Canonical marketing-ad remix graph: input video → extract audio/frames → Nano Banana → Kling i2v → mux → preview.
 * Invariants: single `input_video` node id `iv1`; video URL is injected there.
 */
export function getReplicateMarketingAdTemplate(): WorkflowGraph {
  return JSON.parse(JSON.stringify(TEMPLATE)) as WorkflowGraph;
}

export function buildReplicateWorkflowFromVideoUrl(
  videoUrl: string,
  analysis?: MarketingVideoAnalysis,
): WorkflowGraph {
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
  if (analysis) {
    mergeAnalysisIntoGraph(g, analysis);
  }
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
