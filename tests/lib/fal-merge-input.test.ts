import { describe, expect, it } from "vitest";
import { mergeFalInput, sanitizeFalInput } from "@/lib/fal-merge-input";
import type { WorkflowGraph } from "@/lib/workflow-graph";

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

  it("drops empty string fields so optional defaults apply (e.g. Kling AI Avatar prompt)", () => {
    const out = sanitizeFalInput({
      image_url: "https://cdn.example.com/a.jpg",
      audio_url: "https://cdn.example.com/a.mp3",
      prompt: "",
    });
    expect(out.prompt).toBeUndefined();
    expect(out.image_url).toBe("https://cdn.example.com/a.jpg");
    expect(out.audio_url).toBe("https://cdn.example.com/a.mp3");
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

  it("input_video → video_url passes HTTPS video URL", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "v1",
          type: "input_video",
          data: { videoUrl: "https://cdn.example.com/ad.mp4" },
          position: { x: 0, y: 0 },
        },
        {
          id: "m1",
          type: "fal_model",
          data: { falModelId: "fal-ai/x", falInput: {} },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "v1",
          target: "m1",
          sourceHandle: "video",
          targetHandle: "video_url",
        },
      ],
    };
    const out = mergeFalInput(g.nodes[1] as Extract<(typeof g.nodes)[1], { type: "fal_model" }>, g, {
      v1: { images: [], media: [{ url: "https://cdn.example.com/ad.mp4", kind: "video" }] },
    });
    expect(out.video_url).toBe("https://cdn.example.com/ad.mp4");
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

  it("out → image_url for Kling AI Avatar", () => {
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
            falModelId: "fal-ai/kling-video/ai-avatar/v2/pro",
            falInput: {},
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "image_url" },
      ],
    };
    const out = mergeFalInput(g.nodes[1] as Extract<(typeof g.nodes)[1], { type: "fal_model" }>, g, {
      a: { images: ["https://cdn.example.com/portrait.png"], media: [] },
    });
    expect(out.image_url).toBe("https://cdn.example.com/portrait.png");
    expect(out.start_image_url).toBeUndefined();
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

  /**
   * ElevenLabs TTS (and similar) put audio in `media` with kind `audio`, not in `images`.
   * Kling AI Avatar requires `audio_url` + `image_url`; merge must still pick up the MP3 URL.
   */
  it("out → audio_url for Kling AI Avatar when upstream audio is only in media[] (TTS)", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "tts",
          type: "fal_model",
          data: { falModelId: "fal-ai/elevenlabs/tts/eleven-v3", falInput: {} },
          position: { x: 0, y: 0 },
        },
        {
          id: "kling",
          type: "fal_model",
          data: {
            falModelId: "fal-ai/kling-video/ai-avatar/v2/pro",
            falInput: {},
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "e1", source: "tts", target: "kling", sourceHandle: "out", targetHandle: "audio_url" },
      ],
    };
    const out = mergeFalInput(g.nodes[1] as Extract<(typeof g.nodes)[1], { type: "fal_model" }>, g, {
      tts: {
        images: [],
        media: [{ url: "https://v3.fal.media/files/rabbit/tts_output.mp3", kind: "audio" }],
      },
    });
    expect(out.audio_url).toBe("https://v3.fal.media/files/rabbit/tts_output.mp3");
  });

  it("pick_image artifact → openrouter/router/vision explicit image_urls is a one-element array", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "pick",
          type: "media_process",
          data: { operation: "pick_image", params: { index: 0 } },
          position: { x: 0, y: 0 },
        },
        {
          id: "vis",
          type: "fal_model",
          data: {
            falModelId: "openrouter/router/vision",
            falInput: { model: "google/gemini-2.0-flash-001", prompt: "Describe" },
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "pick",
          target: "vis",
          sourceHandle: "out",
          targetHandle: "image_urls",
        },
      ],
    };
    const out = mergeFalInput(g.nodes[1] as Extract<(typeof g.nodes)[1], { type: "fal_model" }>, g, {
      pick: {
        images: ["https://cdn.example.com/frame.png"],
        media: [{ url: "https://cdn.example.com/frame.png", kind: "image" }],
      },
    });
    expect(out.image_urls).toEqual(["https://cdn.example.com/frame.png"]);
  });

  it("two input_image edges → image_urls accumulates both URLs in edge order", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "imgA",
          type: "input_image",
          data: { imageUrl: "https://cdn.example.com/portrait.jpg" },
          position: { x: 0, y: 0 },
        },
        {
          id: "imgB",
          type: "input_image",
          data: { imageUrl: "https://cdn.example.com/prop.jpg" },
          position: { x: 0, y: 0 },
        },
        {
          id: "nano",
          type: "fal_model",
          data: {
            falModelId: "fal-ai/nano-banana-2/edit",
            falInput: { prompt: "combine" },
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "imgA",
          target: "nano",
          sourceHandle: "image",
          targetHandle: "image_urls",
        },
        {
          id: "e2",
          source: "imgB",
          target: "nano",
          sourceHandle: "image",
          targetHandle: "image_urls",
        },
      ],
    };
    const out = mergeFalInput(g.nodes[2] as Extract<(typeof g.nodes)[2], { type: "fal_model" }>, g, {});
    expect(out.image_urls).toEqual([
      "https://cdn.example.com/portrait.jpg",
      "https://cdn.example.com/prop.jpg",
    ]);
  });

  it("first wire to image_urls replaces static falInput preset; second wire appends", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "imgA",
          type: "input_image",
          data: { imageUrl: "https://cdn.example.com/a.jpg" },
          position: { x: 0, y: 0 },
        },
        {
          id: "imgB",
          type: "input_image",
          data: { imageUrl: "https://cdn.example.com/b.jpg" },
          position: { x: 0, y: 0 },
        },
        {
          id: "m",
          type: "fal_model",
          data: {
            falModelId: "fal-ai/nano-banana-2/edit",
            falInput: { image_urls: ["https://cdn.example.com/static-only.jpg"] },
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "imgA",
          target: "m",
          sourceHandle: "image",
          targetHandle: "image_urls",
        },
        {
          id: "e2",
          source: "imgB",
          target: "m",
          sourceHandle: "image",
          targetHandle: "image_urls",
        },
      ],
    };
    const out = mergeFalInput(g.nodes[2] as Extract<(typeof g.nodes)[2], { type: "fal_model" }>, g, {});
    expect(out.image_urls).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
  });

  it("merges image + audio wires for Kling AI Avatar (typical lip-sync graph)", () => {
    const g: WorkflowGraph = {
      nodes: [
        {
          id: "portrait",
          type: "input_image",
          data: { imageUrl: "https://cdn.example.com/face.jpg" },
          position: { x: 0, y: 0 },
        },
        {
          id: "tts",
          type: "fal_model",
          data: { falModelId: "fal-ai/elevenlabs/tts/eleven-v3", falInput: {} },
          position: { x: 0, y: 0 },
        },
        {
          id: "kling",
          type: "fal_model",
          data: {
            falModelId: "fal-ai/kling-video/ai-avatar/v2/pro",
            falInput: { prompt: "" },
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "e1", source: "portrait", target: "kling", sourceHandle: "image", targetHandle: "image_url" },
        { id: "e2", source: "tts", target: "kling", sourceHandle: "out", targetHandle: "audio_url" },
      ],
    };
    const merged = mergeFalInput(g.nodes[2] as Extract<(typeof g.nodes)[2], { type: "fal_model" }>, g, {
      portrait: {
        images: ["https://cdn.example.com/face.jpg"],
        media: [{ url: "https://cdn.example.com/face.jpg", kind: "image" }],
      },
      tts: {
        images: [],
        media: [{ url: "https://v3.fal.media/files/rabbit/speech.mp3", kind: "audio" }],
      },
    });
    const sanitized = sanitizeFalInput(merged);
    expect(sanitized.image_url).toBe("https://cdn.example.com/face.jpg");
    expect(sanitized.audio_url).toBe("https://v3.fal.media/files/rabbit/speech.mp3");
    expect(sanitized.prompt).toBeUndefined();
  });
});
