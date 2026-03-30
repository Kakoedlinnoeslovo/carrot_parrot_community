import { describe, expect, it } from "vitest";
import {
  buildPublishedFeedMetaJsonFromGraphJson,
  communityFeedCardFromWorkflowRow,
  parsePublishedFeedMeta,
} from "@/lib/published-feed-meta";

const minimalGraph = JSON.stringify({
  nodes: [
    {
      id: "a",
      type: "fal_model",
      position: { x: 0, y: 0 },
      data: { falModelId: "fal-ai/flux/schnell", falInput: {} },
    },
  ],
  edges: [],
});

describe("parsePublishedFeedMeta", () => {
  it("returns null for invalid json", () => {
    expect(parsePublishedFeedMeta(null)).toBeNull();
    expect(parsePublishedFeedMeta("")).toBeNull();
    expect(parsePublishedFeedMeta("not-json")).toBeNull();
  });

  it("parses v1 meta", () => {
    const raw = JSON.stringify({
      v: 1,
      falModels: [{ id: "fal-ai/x", count: 1 }],
      graphPreview: { url: "https://example.com/a.png", kind: "image" as const },
    });
    const m = parsePublishedFeedMeta(raw);
    expect(m?.v).toBe(1);
    expect(m?.falModels).toEqual([{ id: "fal-ai/x", count: 1 }]);
    expect(m?.graphPreview).toEqual({ url: "https://example.com/a.png", kind: "image" });
  });
});

describe("communityFeedCardFromWorkflowRow", () => {
  it("uses cover and meta models without parsing graph when meta has falModels", () => {
    const meta = buildPublishedFeedMetaJsonFromGraphJson(minimalGraph);
    expect(meta).toBeTruthy();
    const { preview, modelsUsed } = communityFeedCardFromWorkflowRow({
      coverImageUrl: "https://cdn.example.com/cover.jpg",
      coverPreviewKind: "image",
      graphJson: "{}",
      publishedFeedMetaJson: meta!,
    });
    expect(preview).toEqual({
      type: "media",
      url: "https://cdn.example.com/cover.jpg",
      kind: "image",
    });
    expect(modelsUsed.length).toBeGreaterThan(0);
  });

  it("parses graph when meta missing", () => {
    const { modelsUsed } = communityFeedCardFromWorkflowRow({
      coverImageUrl: null,
      coverPreviewKind: null,
      graphJson: minimalGraph,
      publishedFeedMetaJson: null,
    });
    expect(modelsUsed.some((m) => m.id.includes("flux"))).toBe(true);
  });
});
