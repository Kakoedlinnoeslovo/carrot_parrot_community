import { describe, expect, it } from "vitest";
import {
  canReuseFalStepFromPrevious,
  canReuseStepFromPrevious,
  deepEqual,
  falInputsJsonMatchesPrevious,
} from "@/lib/fal-step-reuse";

describe("deepEqual", () => {
  it("compares primitives and null", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("compares objects with different key order", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("compares nested structures", () => {
    expect(
      deepEqual({ falModelId: "fal-ai/x", falInput: { prompt: "hi", n: [1, 2] } }, {
        falModelId: "fal-ai/x",
        falInput: { n: [1, 2], prompt: "hi" },
      }),
    ).toBe(true);
  });
});

describe("falInputsJsonMatchesPrevious", () => {
  const payload = { falModelId: "fal-ai/flux/schnell", falInput: { prompt: "cat" } };

  it("matches equivalent JSON string", () => {
    const prev = JSON.stringify({ falInput: { prompt: "cat" }, falModelId: "fal-ai/flux/schnell" });
    expect(falInputsJsonMatchesPrevious(prev, payload)).toBe(true);
  });

  it("rejects when falInput differs", () => {
    const prev = JSON.stringify({
      falModelId: "fal-ai/flux/schnell",
      falInput: { prompt: "dog" },
    });
    expect(falInputsJsonMatchesPrevious(prev, payload)).toBe(false);
  });

  it("rejects invalid json", () => {
    expect(falInputsJsonMatchesPrevious("{", payload)).toBe(false);
  });
});

describe("canReuseFalStepFromPrevious", () => {
  const payload = { falModelId: "m", falInput: {} };

  it("allows reuse when succeeded and inputs match", () => {
    expect(
      canReuseFalStepFromPrevious(
        {
          status: "succeeded",
          inputsJson: JSON.stringify(payload),
          outputsJson: '{"images":[]}',
        },
        payload,
      ),
    ).toBe(true);
  });

  it("denies when status is not succeeded", () => {
    expect(
      canReuseFalStepFromPrevious(
        {
          status: "pending",
          inputsJson: JSON.stringify(payload),
          outputsJson: "{}",
        },
        payload,
      ),
    ).toBe(false);
  });

  it("denies when outputsJson empty", () => {
    expect(
      canReuseFalStepFromPrevious(
        {
          status: "succeeded",
          inputsJson: JSON.stringify(payload),
          outputsJson: "",
        },
        payload,
      ),
    ).toBe(false);
  });
});

describe("canReuseStepFromPrevious (generic)", () => {
  const mediaPayload = {
    operation: "extract_frames",
    params: { fps: 1, maxFrames: 8 },
    videoUrl: "https://cdn.example.com/video.mp4",
    audioUrl: undefined,
    videoUrls: ["https://cdn.example.com/video.mp4"],
    imageUrls: [],
  };

  it("allows reuse when succeeded and inputs match", () => {
    const inputsJson = JSON.stringify(mediaPayload);
    expect(
      canReuseStepFromPrevious(
        {
          status: "succeeded",
          inputsJson,
          outputsJson: '{"images":["https://cdn.example.com/frame.png"]}',
        },
        inputsJson,
      ),
    ).toBe(true);
  });

  it("allows reuse with different key order in stored JSON", () => {
    const stored = JSON.stringify({
      params: { maxFrames: 8, fps: 1 },
      operation: "extract_frames",
      videoUrl: "https://cdn.example.com/video.mp4",
      audioUrl: undefined,
      videoUrls: ["https://cdn.example.com/video.mp4"],
      imageUrls: [],
    });
    const next = JSON.stringify(mediaPayload);
    expect(
      canReuseStepFromPrevious(
        { status: "succeeded", inputsJson: stored, outputsJson: '{"images":[]}' },
        next,
      ),
    ).toBe(true);
  });

  it("denies when operation differs", () => {
    const prev = JSON.stringify({ ...mediaPayload, operation: "extract_audio" });
    const next = JSON.stringify(mediaPayload);
    expect(
      canReuseStepFromPrevious(
        { status: "succeeded", inputsJson: prev, outputsJson: '{"images":[]}' },
        next,
      ),
    ).toBe(false);
  });

  it("denies when upstream video URL changes", () => {
    const prev = JSON.stringify({
      ...mediaPayload,
      videoUrl: "https://cdn.example.com/old.mp4",
      videoUrls: ["https://cdn.example.com/old.mp4"],
    });
    const next = JSON.stringify(mediaPayload);
    expect(
      canReuseStepFromPrevious(
        { status: "succeeded", inputsJson: prev, outputsJson: '{"images":[]}' },
        next,
      ),
    ).toBe(false);
  });

  it("denies when status is not succeeded", () => {
    const inputsJson = JSON.stringify(mediaPayload);
    expect(
      canReuseStepFromPrevious(
        { status: "failed", inputsJson, outputsJson: '{"images":[]}' },
        inputsJson,
      ),
    ).toBe(false);
  });

  it("denies when previous step has no inputsJson", () => {
    const next = JSON.stringify(mediaPayload);
    expect(
      canReuseStepFromPrevious(
        { status: "succeeded", inputsJson: null, outputsJson: '{"images":[]}' },
        next,
      ),
    ).toBe(false);
  });

  it("denies when previous step has no outputsJson", () => {
    const inputsJson = JSON.stringify(mediaPayload);
    expect(
      canReuseStepFromPrevious(
        { status: "succeeded", inputsJson, outputsJson: null },
        inputsJson,
      ),
    ).toBe(false);
  });

  it("denies when previous inputsJson is invalid JSON", () => {
    const next = JSON.stringify(mediaPayload);
    expect(
      canReuseStepFromPrevious(
        { status: "succeeded", inputsJson: "{bad", outputsJson: '{"images":[]}' },
        next,
      ),
    ).toBe(false);
  });
});
