import { describe, expect, it } from "vitest";
import {
  classifyEdgeCompatibility,
  classifyWorkflowGraphEdges,
  graphHasBlockingEdgeIssues,
  inferFalModelSourceKind,
} from "@/lib/fal-edge-compatibility";
import type { WorkflowGraph } from "@/lib/workflow-graph";

describe("inferFalModelSourceKind", () => {
  it("treats caption-style outputs as text", () => {
    expect(inferFalModelSourceKind(["text", "output"], "out")).toBe("text");
  });

  it("treats image outputs as image when no text keys", () => {
    expect(inferFalModelSourceKind(["images", "seed"], "out")).toBe("image");
  });

  it("returns mixed when both media and text output keys exist", () => {
    expect(inferFalModelSourceKind(["images", "caption"], "out")).toBe("mixed");
  });

  it("returns any when OpenAPI keys are missing", () => {
    expect(inferFalModelSourceKind(undefined, "out")).toBe("any");
  });
});

describe("classifyEdgeCompatibility", () => {
  const textInput = {
    id: "p1",
    type: "input_prompt" as const,
    data: { prompt: "hi" },
    position: { x: 0, y: 0 },
  };

  const imageInput = {
    id: "i1",
    type: "input_image" as const,
    data: { imageUrl: "https://x.com/a.png" },
    position: { x: 0, y: 0 },
  };

  it("errors when wiring text-only source to image_url", () => {
    const r = classifyEdgeCompatibility({
      source: textInput,
      targetHandle: "image_url",
      sourceHandle: "prompt",
    });
    expect(r.level).toBe("error");
  });

  it("errors when wiring image-only source to prompt", () => {
    const r = classifyEdgeCompatibility({
      source: imageInput,
      targetHandle: "prompt",
      sourceHandle: "image",
    });
    expect(r.level).toBe("error");
  });

  it("ok for prompt to prompt", () => {
    const r = classifyEdgeCompatibility({
      source: textInput,
      targetHandle: "prompt",
      sourceHandle: "prompt",
    });
    expect(r.level).toBe("ok");
  });

  it("warns when fal upstream kind is unknown", () => {
    const fal = {
      id: "f1",
      type: "fal_model" as const,
      data: { falModelId: "fal-ai/x", falInput: {} },
      position: { x: 0, y: 0 },
    };
    const r = classifyEdgeCompatibility({
      source: fal,
      targetHandle: "prompt",
      sourceHandle: "out",
    });
    expect(r.level).toBe("warn");
  });

  it("ok for textual fal output to prompt", () => {
    const fal = {
      id: "f1",
      type: "fal_model" as const,
      data: {
        falModelId: "fal-ai/x",
        falInput: {},
        openapiOutputKeys: ["text"],
      },
      position: { x: 0, y: 0 },
    };
    const r = classifyEdgeCompatibility({
      source: fal,
      targetHandle: "prompt",
      sourceHandle: "out",
    });
    expect(r.level).toBe("ok");
  });

  it("does not error when TTS (audio output) wires to audio_url on Kling AI Avatar", () => {
    const tts = {
      id: "tts",
      type: "fal_model" as const,
      data: {
        falModelId: "fal-ai/elevenlabs/tts/eleven-v3",
        falInput: {},
        openapiOutputKeys: ["audio", "duration"],
      },
      position: { x: 0, y: 0 },
    };
    const r = classifyEdgeCompatibility({
      source: tts,
      targetHandle: "audio_url",
      sourceHandle: "out",
    });
    expect(r.level).toBe("ok");
  });
});

describe("classifyWorkflowGraphEdges", () => {
  it("flags incompatible edge in a small graph", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "p1",
          type: "input_prompt",
          data: { prompt: "hi" },
          position: { x: 0, y: 0 },
        },
        {
          id: "m1",
          type: "fal_model",
          data: { falModelId: "fal-ai/flux/schnell", falInput: {} },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: "e-bad",
          source: "p1",
          target: "m1",
          sourceHandle: "prompt",
          targetHandle: "image_url",
        },
      ],
    };
    const m = classifyWorkflowGraphEdges(g);
    expect(m.get("e-bad")?.level).toBe("error");
    expect(graphHasBlockingEdgeIssues(m)).toBe(true);
  });
});
