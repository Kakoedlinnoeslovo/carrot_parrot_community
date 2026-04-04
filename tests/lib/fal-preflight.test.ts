import { describe, expect, it } from "vitest";
import { missingWiredRasterInputsMessage } from "@/lib/fal-preflight";
import type { WorkflowGraph, WorkflowNode } from "@/lib/workflow-graph";

describe("missingWiredRasterInputsMessage", () => {
  it("returns a message when image_urls is wired but missing from sanitized input", () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "img",
          type: "input_image",
          data: { imageUrl: "" },
          position: { x: 0, y: 0 },
        },
        {
          id: "fal1",
          type: "fal_model",
          data: { falModelId: "openrouter/router/vision", falInput: { prompt: "x" } },
          position: { x: 100, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "img",
          target: "fal1",
          sourceHandle: "out",
          targetHandle: "image_urls",
        },
      ],
    };
    const node = graph.nodes.find((x): x is Extract<WorkflowNode, { type: "fal_model" }> => x.type === "fal_model");
    expect(node).toBeDefined();
    const msg = missingWiredRasterInputsMessage(graph, node!, { prompt: "x" });
    expect(msg).toBeTruthy();
    expect(msg).toContain("image_urls");
  });

  it("returns null when image_urls is present", () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "fal1",
          type: "fal_model",
          data: { falModelId: "x/y", falInput: {} },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };
    const node = graph.nodes[0];
    expect(node?.type).toBe("fal_model");
    expect(
      missingWiredRasterInputsMessage(graph, node as Extract<WorkflowNode, { type: "fal_model" }>, {
        image_urls: ["https://example.com/a.png"],
      }),
    ).toBeNull();
  });
});
