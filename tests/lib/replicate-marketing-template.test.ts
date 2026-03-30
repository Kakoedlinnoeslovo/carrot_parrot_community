import { describe, expect, it } from "vitest";
import type { MarketingVideoAnalysis } from "@/lib/marketing-video-analyzer";
import {
  buildMarketingRemixLanesGraph,
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
    }
    expect(g.nodes.some((n) => n.id === "slide_0")).toBe(true);
    expect(g.nodes.some((n) => n.id.startsWith("kling_"))).toBe(false);
    expect(g.edges.some((e) => e.source === "pick_0" && e.target === "nano_0")).toBe(false);
  });

  it("omits speech and OCR from merged prompts when merge options disable them", () => {
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
    const prompt = g.nodes.find((n) => n.id === "in_prompt");
    expect(prompt?.type).toBe("input_prompt");
    if (prompt?.type === "input_prompt") {
      expect(prompt.data.prompt).toContain("optical_flow");
      expect(prompt.data.prompt).not.toContain("Buy now");
      expect(prompt.data.prompt).not.toContain("SALE");
    }
  });

  it("merges optional analysis into prompt and fal nodes", () => {
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
    const prompt = g.nodes.find((n) => n.id === "in_prompt");
    expect(prompt?.type).toBe("input_prompt");
    if (prompt?.type === "input_prompt") {
      expect(prompt.data.prompt).toContain("optical_flow");
      expect(prompt.data.prompt).toContain("Buy now");
      expect(prompt.data.prompt).toContain("SALE");
    }
    const nano = g.nodes.find((n) => n.id === "nano_0");
    expect(nano?.type).toBe("fal_model");
    if (nano?.type === "fal_model") {
      expect(String(nano.data.falInput.prompt)).toContain("0.0–5.0s");
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
