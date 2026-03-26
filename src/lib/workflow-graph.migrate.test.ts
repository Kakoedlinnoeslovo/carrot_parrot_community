import { describe, expect, it } from "vitest";
import { migrateWorkflowGraphEdges, workflowGraphSchema } from "./workflow-graph";

describe("migrateWorkflowGraphEdges", () => {
  it("maps legacy fal target in to explicit prompt for text input", () => {
    const raw = workflowGraphSchema.parse({
      nodes: [
        { id: "p", type: "input_prompt", data: { prompt: "hi" }, position: { x: 0, y: 0 } },
        {
          id: "m",
          type: "fal_model",
          data: { falModelId: "fal-ai/flux/schnell", falInput: {} },
          position: { x: 1, y: 0 },
        },
      ],
      edges: [{ id: "e1", source: "p", target: "m", targetHandle: "in" }],
    });
    const g = migrateWorkflowGraphEdges(raw);
    expect(g.edges[0]?.targetHandle).toBe("prompt");
  });

  it("maps fal out → legacy target to image_url for flux downstream", () => {
    const raw = workflowGraphSchema.parse({
      nodes: [
        {
          id: "a",
          type: "fal_model",
          data: { falModelId: "fal-ai/a", falInput: {} },
          position: { x: 0, y: 0 },
        },
        {
          id: "b",
          type: "fal_model",
          data: { falModelId: "fal-ai/flux/schnell", falInput: {} },
          position: { x: 1, y: 0 },
        },
      ],
      edges: [{ id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: null }],
    });
    const g = migrateWorkflowGraphEdges(raw);
    expect(g.edges[0]?.targetHandle).toBe("image_url");
  });

  it("remaps text/images/media fal sources to out", () => {
    const raw = workflowGraphSchema.parse({
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
          data: { falModelId: "fal-ai/y", falInput: {} },
          position: { x: 1, y: 0 },
        },
      ],
      edges: [{ id: "e1", source: "a", target: "b", sourceHandle: "text", targetHandle: "prompt" }],
    });
    const g = migrateWorkflowGraphEdges(raw);
    expect(g.edges[0]?.sourceHandle).toBe("out");
  });
});
