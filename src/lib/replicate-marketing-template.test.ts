import { describe, expect, it } from "vitest";
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

  it("template clone is independent", () => {
    const a = getReplicateMarketingAdTemplate();
    const b = getReplicateMarketingAdTemplate();
    if (a.nodes[0]?.type === "input_video" && b.nodes[0]?.type === "input_video") {
      a.nodes[0].data.videoUrl = "https://a.test/x.mp4";
      expect(b.nodes[0].data.videoUrl).toBe("");
    }
  });
});
