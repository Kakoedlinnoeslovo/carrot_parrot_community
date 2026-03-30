import { describe, expect, it } from "vitest";
import { pickWorkflowCoverFromRunSteps } from "@/lib/workflow-cover-from-run";

describe("pickWorkflowCoverFromRunSteps", () => {
  const t0 = new Date("2025-01-01T00:00:00Z");

  it("returns null when no https media", () => {
    expect(
      pickWorkflowCoverFromRunSteps([
        {
          createdAt: t0,
          outputsJson: JSON.stringify({ images: [], media: [] }),
        },
      ]),
    ).toBeNull();
  });

  it("prefers last video over later images", () => {
    const out = pickWorkflowCoverFromRunSteps([
      {
        createdAt: t0,
        outputsJson: JSON.stringify({
          images: ["https://cdn.example/a.png"],
          media: [{ url: "https://cdn.example/a.png", kind: "image" }],
        }),
      },
      {
        createdAt: new Date(t0.getTime() + 1000),
        outputsJson: JSON.stringify({
          images: [],
          media: [{ url: "https://cdn.example/out.mp4", kind: "video" }],
        }),
      },
      {
        createdAt: new Date(t0.getTime() + 2000),
        outputsJson: JSON.stringify({
          images: ["https://cdn.example/z.png"],
          media: [{ url: "https://cdn.example/z.png", kind: "image" }],
        }),
      },
    ]);
    expect(out).toEqual({ url: "https://cdn.example/out.mp4", kind: "video" });
  });

  it("uses last image when no video", () => {
    const out = pickWorkflowCoverFromRunSteps([
      {
        createdAt: t0,
        outputsJson: JSON.stringify({
          images: ["https://cdn.example/first.jpg"],
          media: [],
        }),
      },
      {
        createdAt: new Date(t0.getTime() + 1000),
        outputsJson: JSON.stringify({
          images: ["https://cdn.example/last.webp"],
          media: [],
        }),
      },
    ]);
    expect(out).toEqual({ url: "https://cdn.example/last.webp", kind: "image" });
  });

  it("skips data: URLs", () => {
    const out = pickWorkflowCoverFromRunSteps([
      {
        createdAt: t0,
        outputsJson: JSON.stringify({
          images: ["data:image/png;base64,abc"],
          media: [],
        }),
      },
    ]);
    expect(out).toBeNull();
  });
});
