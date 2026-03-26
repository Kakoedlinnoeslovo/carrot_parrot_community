import { describe, expect, it } from "vitest";
import type { WorkflowGraph } from "@/lib/workflow-graph";
import { extractGraphMediaHints } from "@/lib/graph-media-hints";

function graphFixture(overrides: Partial<WorkflowGraph> = {}): WorkflowGraph {
  return {
    nodes: [],
    edges: [],
    ...overrides,
  };
}

describe("extractGraphMediaHints", () => {
  it("collects input_image https and dedupes", () => {
    const u = "https://example.com/a.png";
    const g = graphFixture({
      nodes: [
        {
          id: "n1",
          type: "input_image",
          position: { x: 0, y: 0 },
          data: { imageUrl: u },
        },
        {
          id: "n2",
          type: "input_image",
          position: { x: 1, y: 1 },
          data: { imageUrl: u },
        },
      ],
      edges: [],
    });
    const hints = extractGraphMediaHints(g);
    expect(hints).toHaveLength(1);
    expect(hints[0]?.url).toBe(u);
    expect(hints[0]?.kind).toBe("image");
  });

  it("collects falInput URL strings and nested arrays", () => {
    const g = graphFixture({
      nodes: [
        {
          id: "f1",
          type: "fal_model",
          position: { x: 0, y: 0 },
          data: {
            falModelId: "fal-ai/flux/schnell",
            falInput: {
              prompt: "hi",
              image_urls: ["https://cdn.test/1.webp", "https://cdn.test/1.webp"],
              start_image_url: "https://cdn.test/runway.mp4",
            },
          },
        },
      ],
    });
    const hints = extractGraphMediaHints(g);
    const urls = hints.map((h) => h.url).sort();
    expect(urls).toEqual(["https://cdn.test/1.webp", "https://cdn.test/runway.mp4"]);
  });

  it("collects input_group image slot values", () => {
    const g = graphFixture({
      nodes: [
        {
          id: "ig",
          type: "input_group",
          position: { x: 0, y: 0 },
          data: {
            slots: [
              {
                id: "s1",
                kind: "image",
                label: "ref",
                value: "https://x.com/z.jpg",
              },
            ],
          },
        },
      ],
    });
    const hints = extractGraphMediaHints(g);
    expect(hints.some((h) => h.url.endsWith("z.jpg"))).toBe(true);
  });
});
