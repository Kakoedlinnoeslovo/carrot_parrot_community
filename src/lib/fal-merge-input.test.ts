import { describe, expect, it } from "vitest";
import { mergeFalInput, sanitizeFalInput } from "./fal-merge-input";
import type { WorkflowGraph } from "./workflow-graph";

function graph(
  edges: WorkflowGraph["edges"],
  falInput: Record<string, unknown> = {},
  promptText = "hello",
): WorkflowGraph {
  return {
    nodes: [
      { id: "p1", type: "input_prompt", data: { prompt: promptText }, position: { x: 0, y: 0 } },
      {
        id: "m1",
        type: "fal_model",
        data: { falModelId: "fal-ai/flux/schnell", falInput },
        position: { x: 0, y: 0 },
      },
    ],
    edges,
  };
}

describe("sanitizeFalInput", () => {
  it("drops empty image_urls array so fal does not get []", () => {
    const out = sanitizeFalInput({ prompt: "x", image_urls: ["", "  "] });
    expect(out.image_urls).toBeUndefined();
  });

  it("removes null and undefined keys so APIs do not receive explicit null", () => {
    const out = sanitizeFalInput({
      prompt: "hi",
      reference_image_urls: null,
      image_url: undefined,
    } as Record<string, unknown>);
    expect(out.reference_image_urls).toBeUndefined();
    expect(out.image_url).toBeUndefined();
    expect(out.prompt).toBe("hi");
  });
});

describe("mergeFalInput", () => {
  it("explicit prompt handle merges text input", () => {
    const g = graph([
      { id: "e1", source: "p1", target: "m1", sourceHandle: "prompt", targetHandle: "prompt" },
    ]);
    const out = mergeFalInput(g.nodes[1] as Extract<(typeof g.nodes)[1], { type: "fal_model" }>, g, {
      p1: { text: "hello", images: [] },
    });
    expect(out.prompt).toContain("hello");
  });

  it("explicit targetHandle maps prompt field", () => {
    const g = graph(
      [{ id: "e1", source: "p1", target: "m1", sourceHandle: "prompt", targetHandle: "prompt" }],
      {},
      "direct",
    );
    const out = mergeFalInput(g.nodes[1] as Extract<(typeof g.nodes)[1], { type: "fal_model" }>, g, {
      p1: { text: "unused", images: [] },
    });
    expect(out.prompt).toBe("direct");
  });

  it("out → image_url passes prior step media into flux", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "a",
          type: "fal_model",
          data: { falModelId: "fal-ai/example", falInput: {} },
          position: { x: 0, y: 0 },
        },
        {
          id: "b",
          type: "fal_model",
          data: { falModelId: "fal-ai/flux/schnell", falInput: {} },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          sourceHandle: "out",
          targetHandle: "image_url",
        },
      ],
    };
    const out = mergeFalInput(g.nodes[1] as Extract<(typeof g.nodes)[1], { type: "fal_model" }>, g, {
      a: { images: ["https://cdn.example.com/out.png"], media: [] },
    });
    expect(out.image_url).toBe("https://cdn.example.com/out.png");
  });

  it("out → start_image_url for kling image-to-video", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "a",
          type: "fal_model",
          data: { falModelId: "fal-ai/x", falInput: {} },
          position: { x: 0, y: 0 },
        },
        {
          id: "b",
          type: "fal_model",
          data: {
            falModelId: "fal-ai/kling-video/v1/pro/image-to-video",
            falInput: { prompt: "move", duration: "5" },
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "start_image_url" },
      ],
    };
    const out = mergeFalInput(g.nodes[1] as Extract<(typeof g.nodes)[1], { type: "fal_model" }>, g, {
      a: { images: ["https://cdn.example.com/frame.png"], media: [] },
    });
    expect(out.start_image_url).toBe("https://cdn.example.com/frame.png");
    expect(out.image_url).toBeUndefined();
  });
});
