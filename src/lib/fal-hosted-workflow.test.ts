import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fal-client", () => ({
  fal: {
    stream: vi.fn(),
  },
}));

import { fal } from "@/lib/fal-client";
import { isFalHostedWorkflowEndpoint, runFalHostedWorkflowStream } from "./fal-hosted-workflow";

describe("isFalHostedWorkflowEndpoint", () => {
  it("is true for fal hosted workflow ids", () => {
    expect(isFalHostedWorkflowEndpoint("workflows/template/weather")).toBe(true);
    expect(isFalHostedWorkflowEndpoint("workflows/fal-ai/sdxl-sticker")).toBe(true);
  });
  it("is false for model endpoint ids", () => {
    expect(isFalHostedWorkflowEndpoint("fal-ai/flux/schnell")).toBe(false);
  });
});

describe("runFalHostedWorkflowStream", () => {
  it("returns media from output event payload", async () => {
    const events = [
      { type: "submit", node_id: "n1", app_id: "fal-ai/x" },
      {
        type: "output",
        output: { video: { url: "https://cdn.example.com/out.mp4", content_type: "video/mp4" } },
      },
    ];
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        for (const e of events) yield e;
      },
      done: () => Promise.resolve(events[events.length - 1]),
    };
    vi.mocked(fal.stream).mockResolvedValue(mockStream as Awaited<ReturnType<typeof fal.stream>>);

    const r = await runFalHostedWorkflowStream("workflows/template/weather", {
      weather: "rain",
      image_urls: ["https://example.com/in.jpg"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events.some((e) => e.type === "submit")).toBe(true);
    }
  });

  it("returns error when stream emits workflow error", async () => {
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield { type: "error", message: "step failed", node_id: "x" };
      },
      done: () => Promise.resolve({}),
    };
    vi.mocked(fal.stream).mockResolvedValue(mockStream as Awaited<ReturnType<typeof fal.stream>>);

    const r = await runFalHostedWorkflowStream("workflows/fal-ai/sdxl-sticker", { prompt: "hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("step failed");
    }
  });
});
