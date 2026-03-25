import type { WorkflowGraph } from "@/lib/workflow-graph";

export const DEFAULT_WORKFLOW_GRAPH: WorkflowGraph = {
  nodes: [
    {
      id: "in1",
      type: "input_prompt",
      data: { prompt: "Product photo, soft light" },
      position: { x: 0, y: 80 },
    },
    {
      id: "g1",
      type: "fal_model",
      data: {
        falModelId: "fal-ai/flux/schnell",
        prompt: "A vibrant carrot character mascot, studio photo",
      },
      position: { x: 320, y: 80 },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "in1",
      target: "g1",
    },
  ],
};
