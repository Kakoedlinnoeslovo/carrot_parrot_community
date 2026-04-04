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

  it("uses scale+pad when target resolution is provided", () => {
    const g = buildConcatFilterGraph(2, 1080, 1920);
    expect(g).toBe(
      "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v0];" +
        "[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v1];" +
        "[v0][v1]concat=n=2:v=1:a=0[outv]",
    );
  });

  it("falls back to legacy VF when target resolution is omitted", () => {
    const withTarget = buildConcatFilterGraph(2, 1280, 720);
    const withoutTarget = buildConcatFilterGraph(2);
    expect(withTarget).not.toBe(withoutTarget);
    expect(withoutTarget).toContain("min(1280");
    expect(withTarget).toContain("force_original_aspect_ratio=decrease");
  });
});
