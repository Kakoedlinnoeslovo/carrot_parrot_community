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
const NANO_T2I = "fal-ai/nano-banana-2";

/** Horizontal spacing between pipeline stages (px). */
const STAGE_X = 420;
/** Vertical spacing between parallel lanes (px). */
const LANE_Y = 320;
const Y0 = 100;

/** When merging marketing analysis into prompts, omit speech and/or OCR lines. */
export type MergeAnalysisOptions = {
  includeSpeech?: boolean;
  includeOcr?: boolean;
};

function mergeAnalysisIntoGraph(
  g: WorkflowGraph,
  analysis: MarketingVideoAnalysis,
  opts?: MergeAnalysisOptions,
): void {
  const includeSpeech = opts?.includeSpeech !== false;
  const includeOcr = opts?.includeOcr !== false;
  const timeline = analysis.segments.map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s`).join("; ");
  const header = `[${analysis.durationSec.toFixed(1)}s, ${analysis.segments.length} segments, ${analysis.segmentationMethod}]`;
  const speech =
    includeSpeech && analysis.speechText
      ? `\nSpoken (local ASR${analysis.speechFromLocalAsr ? "" : " unavailable"}): ${analysis.speechText.slice(0, 1200)}`
      : "";
  const ocr =
    includeOcr && analysis.ocrText
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
      const p = typeof n.data.falInput?.prompt === "string" ? n.data.falInput.prompt.trim() : "";
      const next = p ? `${p}\n\n${block}` : block;
      n.data.falInput = { ...n.data.falInput, prompt: next.slice(0, 8000) };
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

type MarketingRemixKeyframeMode = "optical_flow" | "manual";

/**
 * Optical-flow keyframes → per-lane OpenRouter vision → review gates (pause) → Nano Banana text-to-image
 * → per-lane `images_to_video` (static clip) → concat → mux.
 *
 * **Manual variant** (`buildMarketingRemixManualKeyframesGraph`): `video_keyframe_picker` + `extract_keyframes_manual`
 * → same `pick_image` / vision / … lanes. Set `frameTimesSec` on the picker (length must match lane count) or in
 * `mp_kf` params; users typically adjust times in the editor timeline.
 *
 * Optional Kling i2v: replace each `slide_*` `images_to_video` node with `fal-ai/kling-video/.../image-to-video`
 * and wire `nano_*` `out` → `start_image_url`, optionally inserting a motion-caption `openrouter/router/vision` node.
 *
 * @param lanes Number of parallel lanes (1–12). Each lane uses one keyframe index = lane index.
 * `extract_keyframes` uses `keyframeMaxSegments: K` (capped at 24 in the runner).
 */
export function buildMarketingRemixLanesGraph(lanes: number): WorkflowGraph {
  return buildMarketingRemixLanesGraphImpl(lanes, "optical_flow");
}

/**
 * Same lane layout as {@link buildMarketingRemixLanesGraph}, but video enters via `video_keyframe_picker` (`vkp1`)
 * and `mp_kf` runs `extract_keyframes_manual` (seconds from the picker’s `frameTimesSec`, defaulting to K spaced stamps).
 */
export function buildMarketingRemixManualKeyframesGraph(lanes: number): WorkflowGraph {
  return buildMarketingRemixLanesGraphImpl(lanes, "manual");
}

function buildMarketingRemixLanesGraphImpl(
  lanes: number,
  mode: MarketingRemixKeyframeMode,
): WorkflowGraph {
  const K = Math.min(12, Math.max(1, Math.floor(lanes)));
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  const x = {
    inputs: 0,
    mpIngest: STAGE_X,
    mpSync: STAGE_X * 2 + 40,
    pick: STAGE_X * 3,
    vision: STAGE_X * 4,
    gate: STAGE_X * 5,
    nano: STAGE_X * 6,
    slide: STAGE_X * 7,
    concat: STAGE_X * 8 + 80,
    mux: STAGE_X * 9 + 80,
    out: STAGE_X * 10 + 80,
  };

  if (mode === "optical_flow") {
    nodes.push({
      id: "iv1",
      type: "input_video",
      data: { videoUrl: "" },
      position: { x: x.inputs, y: Y0 + LANE_Y },
    });
  } else {
    nodes.push({
      id: "vkp1",
      type: "video_keyframe_picker",
      data: {
        videoUrl: "",
        /** One timestamp per lane; users replace via timeline in the editor. */
        frameTimesSec: Array.from({ length: K }, (_, i) => i * 2),
      },
      position: { x: x.inputs, y: Y0 + LANE_Y },
    });
  }
  nodes.push({
    id: "mp_kf",
    type: "media_process",
    data:
      mode === "optical_flow"
        ? {
            operation: "extract_keyframes",
            params: { sceneThreshold: 0.35, keyframeMaxSegments: K },
          }
        : {
            operation: "extract_keyframes_manual",
            params: {},
          },
    position: { x: x.mpIngest, y: Y0 + LANE_Y },
  });
  nodes.push({
    id: "mp_audio",
    type: "media_process",
    data: { operation: "extract_audio", params: {} },
    position: { x: x.mpIngest, y: 0 },
  });
  nodes.push({
    id: "mp_sync",
    type: "media_process",
    data: { operation: "sync_barrier", params: {} },
    position: { x: x.mpSync, y: 20 },
  });
  nodes.push({
    id: "mp_concat",
    type: "media_process",
    data: { operation: "concat_videos", params: {} },
    position: { x: x.concat, y: Y0 + LANE_Y },
  });
  nodes.push({
    id: "mp_mux",
    type: "media_process",
    data: { operation: "mux_audio_video", params: {} },
    position: { x: x.mux, y: Y0 + LANE_Y },
  });
  nodes.push({
    id: "out1",
    type: "output_preview",
    data: { title: "Final ad" },
    position: { x: x.out, y: Y0 + LANE_Y },
  });

  const videoSourceId = mode === "optical_flow" ? "iv1" : "vkp1";
  edges.push({
    id: mode === "optical_flow" ? "e_iv_kf" : "e_vkp_kf",
    source: videoSourceId,
    target: "mp_kf",
    sourceHandle: "video",
    targetHandle: "video_url",
  });
  edges.push({
    id: mode === "optical_flow" ? "e_iv_audio" : "e_vkp_audio",
    source: videoSourceId,
    target: "mp_audio",
    sourceHandle: "video",
    targetHandle: "video_url",
  });

  for (let i = 0; i < K; i++) {
    const y = Y0 + i * LANE_Y;
    const pickId = `pick_${i}`;
    const visionId = `vision_${i}`;
    const gateId = `gate_${i}`;
    const nanoId = `nano_${i}`;
    const slideId = `slide_${i}`;

    nodes.push({
      id: pickId,
      type: "media_process",
      data: { operation: "pick_image", params: { index: i } },
      position: { x: x.pick, y },
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
        openapiInputKeys: ["image_urls", "prompt", "model"],
        primaryImageInputKey: "image_urls",
      },
      position: { x: x.vision, y },
    });
    nodes.push({
      id: gateId,
      type: "review_gate",
      data: { text: "" },
      position: { x: x.gate, y },
    });
    nodes.push({
      id: nanoId,
      type: "fal_model",
      data: {
        falModelId: NANO_T2I,
        falInput: {
          aspect_ratio: "9:16",
        },
        openapiInputKeys: ["prompt", "aspect_ratio"],
      },
      position: { x: x.nano, y },
    });
    nodes.push({
      id: slideId,
      type: "media_process",
      data: {
        operation: "images_to_video",
        params: { secondsPerFrame: 2.5, maxFrames: 1, maxWidth: 1080 },
      },
      position: { x: x.slide, y },
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
      targetHandle: "image_urls",
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
      id: `e_nano_slide_${i}`,
      source: nanoId,
      target: slideId,
      sourceHandle: "out",
      targetHandle: "image_urls",
    });
    edges.push({
      id: `e_slide_concat_${i}`,
      source: slideId,
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
    throw new Error("buildMarketingRemixLanesGraphImpl: invalid graph");
  }
  assertAcyclic(parsed.data);
  return parsed.data;
}

/**
 * Default marketing remix: 6 parallel lanes (up to 6 optical-flow keyframes). Video URL injected at `iv1`.
 */
export function buildReplicateWorkflowFromVideoUrl(
  videoUrl: string,
  analysis?: MarketingVideoAnalysis,
  mergeOpts?: MergeAnalysisOptions,
): WorkflowGraph {
  const trimmed = videoUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Video URL must start with http:// or https://");
  }
  const g = buildMarketingRemixLanesGraph(6);
  const iv = g.nodes.find((n) => n.id === "iv1" && n.type === "input_video");
  if (!iv || iv.type !== "input_video") {
    throw new Error("Template missing input_video iv1");
  }
  iv.data.videoUrl = trimmed;
  if (analysis) {
    mergeAnalysisIntoGraph(g, analysis, mergeOpts);
  }
  assertAcyclic(g);
  const parsed = safeParseWorkflowGraph(JSON.stringify(g));
  if (!parsed.success) {
    throw new Error("Generated graph invalid");
  }
  return parsed.data;
}

/**
 * Same as {@link buildReplicateWorkflowFromVideoUrl} but uses `video_keyframe_picker` (`vkp1`) and
 * `extract_keyframes_manual`. Default `frameTimesSec` on the picker has six stamps; edit in the studio timeline as needed.
 */
export function buildReplicateManualKeyframeWorkflowFromVideoUrl(
  videoUrl: string,
  analysis?: MarketingVideoAnalysis,
  mergeOpts?: MergeAnalysisOptions,
): WorkflowGraph {
  const trimmed = videoUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Video URL must start with http:// or https://");
  }
  const g = buildMarketingRemixManualKeyframesGraph(6);
  const vkp = g.nodes.find((n) => n.id === "vkp1" && n.type === "video_keyframe_picker");
  if (!vkp || vkp.type !== "video_keyframe_picker") {
    throw new Error("Template missing video_keyframe_picker vkp1");
  }
  vkp.data.videoUrl = trimmed;
  if (analysis) {
    mergeAnalysisIntoGraph(g, analysis, mergeOpts);
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
  return p.data.nodes.some(
    (n) => n.type === "input_video" || n.type === "video_keyframe_picker",
  );
}
