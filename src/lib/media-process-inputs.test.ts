import { describe, expect, it } from "vitest";
import { collectMediaProcessInputs } from "@/lib/media-process-runner";
import type { MergeArtifact } from "@/lib/fal-merge-input";
import type { WorkflowGraph } from "@/lib/workflow-graph";

describe("collectMediaProcessInputs", () => {
  it("collects only images for targetHandle image_urls", () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "src", type: "fal_model", data: { falModelId: "fal-ai/x", falInput: {} }, position: { x: 0, y: 0 } },
        {
          id: "mp",
          type: "media_process",
          data: { operation: "images_to_video", params: {} },
          position: { x: 1, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "src",
          target: "mp",
          sourceHandle: "out",
          targetHandle: "image_urls",
        },
      ],
    };
    const art: MergeArtifact = {
      images: ["https://example.com/a.png", "https://example.com/b.png"],
      media: [
        { url: "https://example.com/a.png", kind: "image" },
        { url: "https://example.com/b.png", kind: "image" },
      ],
    };
    const artifacts: Record<string, MergeArtifact | undefined> = { src: art };
    const out = collectMediaProcessInputs(graph, "mp", artifacts);
    expect(out.imageUrls).toEqual(["https://example.com/a.png", "https://example.com/b.png"]);
    expect(out.videoUrl).toBeUndefined();
  });

  it("parses images_to_video in workflow graph schema", async () => {
    const { workflowGraphSchema } = await import("@/lib/workflow-graph");
    const g = workflowGraphSchema.parse({
      nodes: [
        {
          id: "m",
          type: "media_process",
          data: { operation: "images_to_video", params: { secondsPerFrame: 0.4, maxWidth: 1280 } },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    expect(g.nodes[0]?.type).toBe("media_process");
    if (g.nodes[0]?.type === "media_process") {
      expect(g.nodes[0].data.operation).toBe("images_to_video");
      expect(g.nodes[0].data.params?.secondsPerFrame).toBe(0.4);
      expect(g.nodes[0].data.params?.maxWidth).toBe(1280);
    }
  });
});
