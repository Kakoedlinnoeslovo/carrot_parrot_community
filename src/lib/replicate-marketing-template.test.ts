import { describe, expect, it } from "vitest";
import type { MarketingVideoAnalysis } from "@/lib/marketing-video-analyzer";
import {
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
    expect(validateReplicateMarketingGraph(JSON.stringify(g))).toBe(true);
  });

  it("rejects non-http URLs", () => {
    expect(() => buildReplicateWorkflowFromVideoUrl("not-a-url")).toThrow();
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
    const nano = g.nodes.find((n) => n.id === "nano1");
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
