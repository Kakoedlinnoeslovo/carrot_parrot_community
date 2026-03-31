import { describe, expect, it } from "vitest";
import type { MarketingVideoAnalysis } from "@/lib/marketing-video-analyzer";
import {
  buildMarketingRemixLanesGraph,
  buildMarketingRemixManualKeyframesGraph,
  buildReplicateManualKeyframeWorkflowFromVideoUrl,
  buildReplicateWorkflowFromVideoUrl,
  getReplicateMarketingAdTemplate,
  validateReplicateMarketingGraph,
} from "@/lib/replicate-marketing-template";

describe("replicate-marketing-template", () => {
  it("injects video URL into iv1 and parses", () => {
    const url = "https://example.com/ad.mp4";
    const g = buildReplicateWorkflowFromVideoUrl(url);
    const iv = g.nodes.find((n) => n.id === "iv1");
    expect(iv?.type).toBe("input_video");
    if (iv?.type === "input_video") {
      expect(iv.data.videoUrl).toBe(url);
    }
    const kf = g.nodes.find((n) => n.id === "mp_kf" && n.type === "media_process");
    expect(kf?.type).toBe("media_process");
    if (kf?.type === "media_process") {
      expect(kf.data.params?.keyframeMaxSegments).toBe(6);
    }
    expect(g.nodes.filter((n) => n.id.startsWith("vision_")).length).toBe(6);
    expect(validateReplicateMarketingGraph(JSON.stringify(g))).toBe(true);
  });

  it("manual keyframe path: frame picker + extract_keyframes_manual + one pick_image lane per timestamp", () => {
    const lanes = 4;
    const g = buildMarketingRemixManualKeyframesGraph(lanes);
    expect(g.nodes.some((n) => n.id === "iv1")).toBe(false);
    const vkp = g.nodes.find((n) => n.id === "vkp1");
    expect(vkp?.type).toBe("video_keyframe_picker");
    if (vkp?.type === "video_keyframe_picker") {
      expect(vkp.data.frameTimesSec.length).toBe(lanes);
      expect(vkp.data.videoUrl).toBe("");
    }
    const kf = g.nodes.find((n) => n.id === "mp_kf" && n.type === "media_process");
    expect(kf?.type).toBe("media_process");
    if (kf?.type === "media_process") {
      expect(kf.data.operation).toBe("extract_keyframes_manual");
      expect(kf.data.params).toEqual({});
    }
    expect(g.nodes.filter((n) => n.id.startsWith("pick_")).length).toBe(lanes);
    expect(g.nodes.filter((n) => n.id.startsWith("vision_")).length).toBe(lanes);
    expect(g.edges.some((e) => e.source === "vkp1" && e.target === "mp_kf")).toBe(true);
    expect(g.edges.some((e) => e.source === "vkp1" && e.target === "mp_audio")).toBe(true);
    expect(validateReplicateMarketingGraph(JSON.stringify(g))).toBe(true);
  });

  it("buildReplicateManualKeyframeWorkflowFromVideoUrl sets vkp1 URL", () => {
    const url = "https://example.com/manual.mp4";
    const g = buildReplicateManualKeyframeWorkflowFromVideoUrl(url);
    const vkp = g.nodes.find((n) => n.id === "vkp1");
    expect(vkp?.type).toBe("video_keyframe_picker");
    if (vkp?.type === "video_keyframe_picker") {
      expect(vkp.data.videoUrl).toBe(url);
    }
  });

  it("rejects non-http URLs", () => {
    expect(() => buildReplicateWorkflowFromVideoUrl("not-a-url")).toThrow();
  });

  it("remix graph uses openrouter image_urls, nano t2i, and slide images_to_video (no default kling)", () => {
    const g = buildMarketingRemixLanesGraph(2);
    const vis = g.nodes.find((n) => n.id === "vision_0");
    expect(vis?.type).toBe("fal_model");
    if (vis?.type === "fal_model") {
      expect(vis.data.primaryImageInputKey).toBe("image_urls");
      expect(vis.data.openapiInputKeys).toContain("image_urls");
    }
    const pickToVis = g.edges.find((e) => e.source === "pick_0" && e.target === "vision_0");
    expect(pickToVis?.targetHandle).toBe("image_urls");
    const nano = g.nodes.find((n) => n.id === "nano_0");
    expect(nano?.type).toBe("fal_model");
    if (nano?.type === "fal_model") {
      expect(nano.data.falModelId).toBe("fal-ai/nano-banana-2");
      expect(nano.data.falInput.prompt).toBeUndefined();
    }
    expect(g.nodes.some((n) => n.id === "slide_0")).toBe(true);
    expect(g.nodes.some((n) => n.id.startsWith("kling_"))).toBe(false);
    expect(g.edges.some((e) => e.source === "pick_0" && e.target === "nano_0")).toBe(false);
    expect(g.nodes.some((n) => n.id === "in_prompt")).toBe(false);
    expect(g.edges.some((e) => e.target === "nano_0" && e.targetHandle === "prompt")).toBe(true);
  });

  it("remix: analysis merge does not set nano static prompt (vision wire only)", () => {
    const analysis: MarketingVideoAnalysis = {
      durationSec: 10,
      segments: [
        { start: 0, end: 5 },
        { start: 5, end: 10 },
      ],
      segmentationMethod: "optical_flow",
      speechText: "Buy now",
      ocrText: "SALE",
      speechFromLocalAsr: true,
      textFromLocalOcr: true,
    };
    const g = buildReplicateWorkflowFromVideoUrl("https://example.com/ad.mp4", analysis, {
      includeSpeech: false,
      includeOcr: false,
    });
    const nano = g.nodes.find((n) => n.id === "nano_0");
    expect(nano?.type).toBe("fal_model");
    if (nano?.type === "fal_model") {
      expect(nano.data.falInput.prompt).toBeUndefined();
    }
  });

  it("remix: full analysis still does not bake timeline into nano falInput", () => {
    const analysis: MarketingVideoAnalysis = {
      durationSec: 10,
      segments: [
        { start: 0, end: 5 },
        { start: 5, end: 10 },
      ],
      segmentationMethod: "optical_flow",
      speechText: "Buy now",
      ocrText: "SALE",
      speechFromLocalAsr: true,
      textFromLocalOcr: true,
    };
    const g = buildReplicateWorkflowFromVideoUrl("https://example.com/ad.mp4", analysis);
    expect(g.nodes.some((n) => n.id === "in_prompt")).toBe(false);
    const nano = g.nodes.find((n) => n.id === "nano_0");
    expect(nano?.type).toBe("fal_model");
    if (nano?.type === "fal_model") {
      expect(nano.data.falInput.prompt).toBeUndefined();
    }
  });

  it("template clone is independent", () => {
    const a = getReplicateMarketingAdTemplate();
    const b = getReplicateMarketingAdTemplate();
    if (a.nodes[0]?.type === "input_video" && b.nodes[0]?.type === "input_video") {
      a.nodes[0].data.videoUrl = "https://a.test/x.mp4";
      expect(b.nodes[0].data.videoUrl).toBe("");
    }
  });
});
