import { describe, expect, it } from "vitest";
import {
  parseWorkflowClipboard,
  remapSingleNodePaste,
  serializeWorkflowClipboard,
  WORKFLOW_CLIPBOARD_PREFIX,
} from "@/lib/workflow-clipboard";

describe("workflow-clipboard", () => {
  it("serialize/parse roundtrip for input_prompt", () => {
    const graph = {
      nodes: [
        {
          id: "node-a",
          type: "input_prompt" as const,
          position: { x: 10, y: 20 },
          data: { prompt: "hello" },
        },
      ],
      edges: [],
    };
    const s = serializeWorkflowClipboard(graph);
    expect(s.startsWith(WORKFLOW_CLIPBOARD_PREFIX)).toBe(true);
    const parsed = parseWorkflowClipboard(s);
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes).toHaveLength(1);
    expect(parsed!.nodes[0].type).toBe("input_prompt");
    if (parsed!.nodes[0].type === "input_prompt") {
      expect(parsed!.nodes[0].data.prompt).toBe("hello");
    }
  });

  it("rejects non-prefixed text", () => {
    expect(parseWorkflowClipboard("hello")).toBeNull();
    expect(parseWorkflowClipboard("{}")).toBeNull();
  });

  it("rejects graph with multiple nodes", () => {
    const bad =
      WORKFLOW_CLIPBOARD_PREFIX +
      JSON.stringify({
        graph: {
          nodes: [
            {
              id: "a",
              type: "input_prompt",
              position: { x: 0, y: 0 },
              data: { prompt: "" },
            },
            {
              id: "b",
              type: "input_prompt",
              position: { x: 1, y: 1 },
              data: { prompt: "" },
            },
          ],
          edges: [],
        },
      });
    expect(parseWorkflowClipboard(bad)).toBeNull();
  });

  it("remapSingleNodePaste assigns new node id and input_group slot ids", () => {
    const graph = {
      nodes: [
        {
          id: "old-node",
          type: "input_group" as const,
          position: { x: 5, y: 6 },
          data: {
            slots: [
              { id: "slot-old-1", kind: "text" as const, label: "p", value: "v" },
              { id: "slot-old-2", kind: "image" as const, label: "i", value: "" },
            ],
          },
        },
      ],
      edges: [],
    };
    const next = remapSingleNodePaste(graph);
    expect(next.nodes[0].id).not.toBe("old-node");
    expect(next.nodes[0].type).toBe("input_group");
    if (next.nodes[0].type === "input_group") {
      const ids = next.nodes[0].data.slots.map((s) => s.id);
      expect(ids).not.toContain("slot-old-1");
      expect(ids).not.toContain("slot-old-2");
      expect(ids[0]).toMatch(/^slot-/);
      expect(ids[1]).toMatch(/^slot-/);
    }
  });

  it("remapSingleNodePaste preserves fal_model data shape", () => {
    const graph = {
      nodes: [
        {
          id: "f1",
          type: "fal_model" as const,
          position: { x: 0, y: 0 },
          data: {
            falModelId: "fal-ai/flux/schnell",
            falInput: { prompt: "x", num_images: 1 },
            openapiInputKeys: ["prompt"],
          },
        },
      ],
      edges: [],
    };
    const next = remapSingleNodePaste(graph);
    expect(next.nodes[0].id).not.toBe("f1");
    expect(next.nodes[0].type).toBe("fal_model");
    if (next.nodes[0].type === "fal_model") {
      expect(next.nodes[0].data.falModelId).toBe("fal-ai/flux/schnell");
      expect(next.nodes[0].data.falInput).toMatchObject({ prompt: "x", num_images: 1 });
    }
  });
});
