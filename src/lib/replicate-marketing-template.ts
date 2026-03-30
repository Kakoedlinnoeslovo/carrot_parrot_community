import replicateMarketingAd from "@/lib/templates/replicate-marketing-ad.json";
import type { MarketingVideoAnalysis } from "@/lib/marketing-video-analyzer";
import {
  assertAcyclic,
  parseWorkflowGraph,
  safeParseWorkflowGraph,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/lib/workflow-graph";

const OPENROUTER_VISION = "openrouter/router/vision";
const GEMINI_FLASH = "google/gemini-2.0-flash-001";

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

  for (const n of g.nodes) {
    if (n.type !== "fal_model") continue;
    const id = n.id;
    if (id === "nano1" || id.startsWith("nano_")) {
      const p = typeof n.data.falInput?.prompt === "string" ? n.data.falInput.prompt : "";
      n.data.falInput = { ...n.data.falInput, prompt: `${p}\n\n${block}`.slice(0, 8000) };
    }
    if (id === "kling1" || id.startsWith("kling_")) {
      const p = typeof n.data.falInput?.prompt === "string" ? n.data.falInput.prompt : "";
      n.data.falInput = {
        ...n.data.falInput,
        prompt: `${p}\n\nPacing: ${timeline}.\n${block}`.slice(0, 8000),
      };
    }
  }
}

const LEGACY_TEMPLATE: WorkflowGraph = parseWorkflowGraph(JSON.stringify(replicateMarketingAd));

/**
 * Legacy single-chain template (extract_frames → one nano → one kling).
 */
export function getReplicateMarketingAdTemplate(): WorkflowGraph {
  return JSON.parse(JSON.stringify(LEGACY_TEMPLATE)) as WorkflowGraph;
}

/**
 * Optical-flow keyframes → per-lane OpenRouter vision → review gates (pause) → Nano Banana → motion caption → Kling → concat → mux.
 * @param lanes Number of parallel lanes (1–4). Each lane uses one keyframe index = lane index.
 */
export function buildMarketingRemixLanesGraph(lanes: number): WorkflowGraph {
  const K = Math.min(4, Math.max(1, Math.floor(lanes)));
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  nodes.push({
    id: "iv1",
    type: "input_video",
    data: { videoUrl: "" },
    position: { x: 0, y: 200 },
  });
  nodes.push({
    id: "in_prompt",
    type: "input_prompt",
    data: { prompt: "Cinematic product ad, vertical 9:16, bold text overlays, brand-safe." },
    position: { x: 0, y: 0 },
  });
  nodes.push({
    id: "mp_kf",
    type: "media_process",
    data: {
      operation: "extract_keyframes",
      params: { sceneThreshold: 0.35, keyframeMaxSegments: K },
    },
    position: { x: 220, y: 200 },
  });
  nodes.push({
    id: "mp_audio",
    type: "media_process",
    data: { operation: "extract_audio", params: {} },
    position: { x: 220, y: 60 },
  });
  nodes.push({
    id: "mp_sync",
    type: "media_process",
    data: { operation: "sync_barrier", params: {} },
    position: { x: 520, y: 40 },
  });
  nodes.push({
    id: "mp_concat",
    type: "media_process",
    data: { operation: "concat_videos", params: {} },
    position: { x: 1480, y: 200 },
  });
  nodes.push({
    id: "mp_mux",
    type: "media_process",
    data: { operation: "mux_audio_video", params: {} },
    position: { x: 1720, y: 200 },
  });
  nodes.push({
    id: "out1",
    type: "output_preview",
    data: { title: "Final ad" },
    position: { x: 1960, y: 200 },
  });

  edges.push({
    id: "e_iv_kf",
    source: "iv1",
    target: "mp_kf",
    sourceHandle: "video",
    targetHandle: "video_url",
  });
  edges.push({
    id: "e_iv_audio",
    source: "iv1",
    target: "mp_audio",
    sourceHandle: "video",
    targetHandle: "video_url",
  });

  for (let i = 0; i < K; i++) {
    const y = 120 + i * 220;
    const pickId = `pick_${i}`;
    const visionId = `vision_${i}`;
    const gateId = `gate_${i}`;
    const motionId = `motion_${i}`;
    const nanoId = `nano_${i}`;
    const klingId = `kling_${i}`;

    nodes.push({
      id: pickId,
      type: "media_process",
      data: { operation: "pick_image", params: { index: i } },
      position: { x: 480, y },
    });
    nodes.push({
      id: visionId,
      type: "fal_model",
      data: {
        falModelId: OPENROUTER_VISION,
        falInput: {
          model: GEMINI_FLASH,
          prompt:
            "Describe this advertising frame briefly: subjects, on-screen text, mood, palette, and product focus.",
        },
        openapiInputKeys: ["image_url", "prompt", "model"],
        primaryImageInputKey: "image_url",
      },
      position: { x: 720, y },
    });
    nodes.push({
      id: gateId,
      type: "review_gate",
      data: { text: "" },
      position: { x: 960, y },
    });
    nodes.push({
      id: nanoId,
      type: "fal_model",
      data: {
        falModelId: "fal-ai/nano-banana-2/edit",
        falInput: { prompt: "Polished marketing frame, vertical 9:16, keep composition." },
        openapiInputKeys: ["prompt", "image_urls"],
        primaryImageInputKey: "image_urls",
      },
      position: { x: 1180, y },
    });
    nodes.push({
      id: motionId,
      type: "fal_model",
      data: {
        falModelId: OPENROUTER_VISION,
        falInput: {
          model: GEMINI_FLASH,
          prompt:
            "Given the edited frame and the creative brief, output ONE short phrase of subtle camera motion for image-to-video (e.g. slow push-in, gentle pan right).",
        },
        openapiInputKeys: ["image_url", "prompt", "model"],
        primaryImageInputKey: "image_url",
      },
      position: { x: 1180, y: y + 70 },
    });
    nodes.push({
      id: klingId,
      type: "fal_model",
      data: {
        falModelId: "fal-ai/kling-video/v1/pro/image-to-video",
        falInput: { prompt: "Subtle camera motion, vertical ad." },
        openapiInputKeys: ["prompt", "start_image_url"],
        primaryImageInputKey: "start_image_url",
      },
      position: { x: 1400, y },
    });

    edges.push({
      id: `e_kf_pick_${i}`,
      source: "mp_kf",
      target: pickId,
      sourceHandle: "out",
      targetHandle: "image_urls",
    });
    edges.push({
      id: `e_pick_vis_${i}`,
      source: pickId,
      target: visionId,
      sourceHandle: "out",
      targetHandle: "image_url",
    });
    edges.push({
      id: `e_vis_sync_${i}`,
      source: visionId,
      target: "mp_sync",
      sourceHandle: "out",
      targetHandle: "barrier_in",
    });
    edges.push({
      id: `e_vis_gate_${i}`,
      source: visionId,
      target: gateId,
      sourceHandle: "out",
      targetHandle: "in",
    });
    edges.push({
      id: `e_sync_gate_${i}`,
      source: "mp_sync",
      target: gateId,
      sourceHandle: "out",
      targetHandle: "barrier_in",
    });
    edges.push({
      id: `e_gate_nano_${i}`,
      source: gateId,
      target: nanoId,
      sourceHandle: "out",
      targetHandle: "prompt",
    });
    edges.push({
      id: `e_pick_nano_${i}`,
      source: pickId,
      target: nanoId,
      sourceHandle: "out",
      targetHandle: "image_urls",
    });
    edges.push({
      id: `e_prompt_nano_${i}`,
      source: "in_prompt",
      target: nanoId,
      sourceHandle: "prompt",
      targetHandle: "prompt",
    });
    edges.push({
      id: `e_nano_motion_${i}`,
      source: nanoId,
      target: motionId,
      sourceHandle: "out",
      targetHandle: "image_url",
    });
    edges.push({
      id: `e_gate_motion_${i}`,
      source: gateId,
      target: motionId,
      sourceHandle: "out",
      targetHandle: "prompt",
    });
    edges.push({
      id: `e_motion_kling_${i}`,
      source: motionId,
      target: klingId,
      sourceHandle: "out",
      targetHandle: "prompt",
    });
    edges.push({
      id: `e_nano_kling_${i}`,
      source: nanoId,
      target: klingId,
      sourceHandle: "out",
      targetHandle: "start_image_url",
    });
    edges.push({
      id: `e_prompt_kling_${i}`,
      source: "in_prompt",
      target: klingId,
      sourceHandle: "prompt",
      targetHandle: "prompt",
    });
    edges.push({
      id: `e_kling_concat_${i}`,
      source: klingId,
      target: "mp_concat",
      sourceHandle: "out",
      targetHandle: `video_${i}`,
    });
  }

  edges.push({
    id: "e_concat_mux",
    source: "mp_concat",
    target: "mp_mux",
    sourceHandle: "out",
    targetHandle: "video_url",
  });
  edges.push({
    id: "e_audio_mux",
    source: "mp_audio",
    target: "mp_mux",
    sourceHandle: "out",
    targetHandle: "audio_url",
  });
  edges.push({
    id: "e_mux_out",
    source: "mp_mux",
    target: "out1",
    sourceHandle: "out",
    targetHandle: null,
  });

  const raw = { nodes, edges };
  const parsed = safeParseWorkflowGraph(JSON.stringify(raw));
  if (!parsed.success) {
    throw new Error("buildMarketingRemixLanesGraph: invalid graph");
  }
  assertAcyclic(parsed.data);
  return parsed.data;
}

/**
 * Default marketing remix: 2 lanes (2 optical-flow keyframes). Video URL injected at `iv1`.
 */
export function buildReplicateWorkflowFromVideoUrl(
  videoUrl: string,
  analysis?: MarketingVideoAnalysis,
): WorkflowGraph {
  const trimmed = videoUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Video URL must start with http:// or https://");
  }
  const g = buildMarketingRemixLanesGraph(2);
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
