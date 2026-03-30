import { describe, expect, it } from "vitest";
import { safeParseWorkflowGraph } from "@/lib/workflow-graph";

describe("workflow graph video_keyframe_picker", () => {
  it("round-trips video_keyframe_picker node", () => {
    const j = JSON.stringify({
      nodes: [
        {
          id: "kf1",
          type: "video_keyframe_picker",
          position: { x: 10, y: 20 },
          data: { videoUrl: "https://example.com/a.mp4", frameTimesSec: [0, 1.5, 3] },
        },
      ],
      edges: [],
    });
    const p = safeParseWorkflowGraph(j);
    expect(p.success).toBe(true);
    if (!p.success) return;
    const n = p.data.nodes[0];
    expect(n?.type).toBe("video_keyframe_picker");
    if (n?.type === "video_keyframe_picker") {
      expect(n.data.videoUrl).toBe("https://example.com/a.mp4");
      expect(n.data.frameTimesSec).toEqual([0, 1.5, 3]);
    }
  });
});
