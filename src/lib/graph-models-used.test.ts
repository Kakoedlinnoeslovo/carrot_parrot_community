import { describe, expect, it } from "vitest";
import { extractFalModelsUsed } from "@/lib/graph-models-used";
import type { WorkflowGraph } from "@/lib/workflow-graph";

describe("extractFalModelsUsed", () => {
  it("returns ordered unique ids with counts", () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "a",
          type: "input_prompt",
          data: { prompt: "" },
          position: { x: 0, y: 0 },
        },
        {
          id: "b",
          type: "fal_model",
          data: { falModelId: "fal-ai/foo", falInput: {} },
          position: { x: 0, y: 0 },
        },
        {
          id: "c",
          type: "fal_model",
          data: { falModelId: "fal-ai/foo", falInput: {} },
          position: { x: 0, y: 0 },
        },
        {
          id: "d",
          type: "fal_model",
          data: { falModelId: "fal-ai/bar", falInput: {} },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };
    expect(extractFalModelsUsed(graph)).toEqual([
      { id: "fal-ai/foo", count: 2 },
      { id: "fal-ai/bar", count: 1 },
    ]);
  });

  it("ignores empty falModelId", () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "b",
          type: "fal_model",
          data: { falModelId: "  ", falInput: {} },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };
    expect(extractFalModelsUsed(graph)).toEqual([]);
  });
});
