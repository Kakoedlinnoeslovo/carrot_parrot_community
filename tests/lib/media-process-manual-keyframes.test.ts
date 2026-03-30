import { describe, expect, it } from "vitest";
import { frameTimesForManualExtract } from "@/lib/media-process-runner";
import type { WorkflowGraph } from "@/lib/workflow-graph";

describe("frameTimesForManualExtract", () => {
  it("prefers params.frameTimesSec when non-empty", () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "mp",
          type: "media_process",
          position: { x: 0, y: 0 },
          data: { operation: "extract_keyframes_manual", params: { frameTimesSec: [0.5, 1.5] } },
        },
        {
          id: "pk",
          type: "video_keyframe_picker",
          position: { x: 0, y: 0 },
          data: { videoUrl: "https://example.com/v.mp4", frameTimesSec: [9, 10] },
        },
      ],
      edges: [
        {
          id: "e",
          source: "pk",
          target: "mp",
          sourceHandle: "video",
          targetHandle: "video_url",
        },
      ],
    };
    expect(frameTimesForManualExtract(graph, "mp", { frameTimesSec: [0.5, 1.5] })).toEqual([0.5, 1.5]);
  });

  it("reads video_keyframe_picker upstream when params empty", () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "mp",
          type: "media_process",
          position: { x: 0, y: 0 },
          data: { operation: "extract_keyframes_manual", params: {} },
        },
        {
          id: "pk",
          type: "video_keyframe_picker",
          position: { x: 0, y: 0 },
          data: { videoUrl: "https://example.com/v.mp4", frameTimesSec: [0.1, 2.3] },
        },
      ],
      edges: [
        {
          id: "e",
          source: "pk",
          target: "mp",
          sourceHandle: "video",
          targetHandle: "video_url",
        },
      ],
    };
    expect(frameTimesForManualExtract(graph, "mp", {})).toEqual([0.1, 2.3]);
  });
});
