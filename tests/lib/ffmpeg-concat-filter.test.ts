import { describe, expect, it } from "vitest";
import {
  buildConcatFilterGraph,
  CONCAT_NORMALIZE_FPS,
  CONCAT_NORMALIZE_MAX_WIDTH,
  CONCAT_NORMALIZE_VF,
} from "@/lib/media/ffmpeg";

describe("concat_videos normalization helpers", () => {
  it("exports consistent scale + sar + fps vf string", () => {
    expect(CONCAT_NORMALIZE_VF).toBe(
      `scale=w=min(${CONCAT_NORMALIZE_MAX_WIDTH}\\,iw):h=-2,setsar=1,fps=${CONCAT_NORMALIZE_FPS}`,
    );
  });

  it("builds filter_complex for two inputs", () => {
    expect(buildConcatFilterGraph(2)).toBe(
      "[0:v]scale=w=min(1280\\,iw):h=-2,setsar=1,fps=24[v0];[1:v]scale=w=min(1280\\,iw):h=-2,setsar=1,fps=24[v1];[v0][v1]concat=n=2:v=1:a=0[outv]",
    );
  });

  it("builds filter_complex for eight inputs", () => {
    const g = buildConcatFilterGraph(8);
    expect(g).toContain("concat=n=8:v=1:a=0[outv]");
    for (let i = 0; i < 8; i++) {
      expect(g).toContain(`[${i}:v]`);
    }
    expect(g).toContain(
      "[v0][v1][v2][v3][v4][v5][v6][v7]concat=n=8:v=1:a=0[outv]",
    );
  });

  it("rejects inputCount < 2", () => {
    expect(() => buildConcatFilterGraph(1)).toThrow(/>= 2/);
  });
});
