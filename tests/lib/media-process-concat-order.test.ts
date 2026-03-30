import { describe, expect, it } from "vitest";
import { collectOrderedConcatVideoUrls } from "@/lib/media-process-runner";
import type { MergeArtifact } from "@/lib/fal-merge-input";
import type { WorkflowGraph } from "@/lib/workflow-graph";

function artVideo(url: string): MergeArtifact {
  return { images: [], media: [{ url, kind: "video" }] };
}

describe("collectOrderedConcatVideoUrls", () => {
  it("orders by video_0, video_1 target handles", () => {
    const graph = {
      nodes: [
        {
          id: "c",
          type: "media_process" as const,
          data: { operation: "concat_videos" as const },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "e1", source: "b", target: "c", targetHandle: "video_1" },
        { id: "e0", source: "a", target: "c", targetHandle: "video_0" },
      ],
    } satisfies WorkflowGraph;
    const artifacts: Record<string, MergeArtifact | undefined> = {
      a: artVideo("https://a.mp4"),
      b: artVideo("https://b.mp4"),
    };
    expect(collectOrderedConcatVideoUrls(graph, "c", artifacts)).toEqual([
      "https://a.mp4",
      "https://b.mp4",
    ]);
  });

  it("falls back to edge id sort when handles are unnumbered", () => {
    const graph = {
      nodes: [
        {
          id: "c",
          type: "media_process" as const,
          data: { operation: "concat_videos" as const },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "zebra", source: "z", target: "c" },
        { id: "alpha", source: "y", target: "c" },
      ],
    } satisfies WorkflowGraph;
    const artifacts: Record<string, MergeArtifact | undefined> = {
      y: artVideo("https://y.mp4"),
      z: artVideo("https://z.mp4"),
    };
    expect(collectOrderedConcatVideoUrls(graph, "c", artifacts)).toEqual([
      "https://y.mp4",
      "https://z.mp4",
    ]);
  });
});
