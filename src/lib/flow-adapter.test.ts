import { describe, expect, it } from "vitest";
import { graphToFlow } from "@/lib/flow-adapter";

describe("graphToFlow", () => {
  it("remaps fal_model queue infra sourceHandle to out for React Flow", () => {
    const { edges } = graphToFlow({
      nodes: [
        {
          id: "a",
          type: "fal_model",
          position: { x: 0, y: 0 },
          data: { falModelId: "fal-ai/x", falInput: {} },
        },
        { id: "b", type: "output_preview", position: { x: 1, y: 0 }, data: { title: "R" } },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          sourceHandle: "response_url",
          targetHandle: null,
        },
      ],
    });
    expect(edges[0]?.sourceHandle).toBe("out");
  });

  it("leaves non-queue fal sourceHandle unchanged", () => {
    const { edges } = graphToFlow({
      nodes: [
        {
          id: "a",
          type: "fal_model",
          position: { x: 0, y: 0 },
          data: { falModelId: "fal-ai/x", falInput: {} },
        },
        { id: "b", type: "fal_model", position: { x: 1, y: 0 }, data: { falModelId: "fal-ai/y", falInput: {} } },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          sourceHandle: "images",
          targetHandle: "start_image_url",
        },
      ],
    });
    expect(edges[0]?.sourceHandle).toBe("images");
  });
});
