import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getFfmpegPath } from "@/lib/media/ffmpeg";

export type VideoSegment = { start: number; end: number };

/** How scene boundaries were derived (optical flow script vs FFmpeg heuristics). */
export type SceneSegmentationMethod = "optical_flow" | "ffmpeg_scene" | "equal";

function runCmd(cmd: string, args: string[], timeoutMs = 600_000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out`));
    }, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(t);
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `${cmd} not found (${err.message}). Install ffmpeg on PATH (e.g. brew install ffmpeg) or use bundled ffmpeg-static from npm.`,
          ),
        );
        return;
      }
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * FFmpeg scene-change detection: parse `showinfo` output for frame timestamps.
 * Fallback: equal segments if parsing fails.
 */
export async function segmentScenesWithFfmpeg(
  videoPath: string,
  sceneThreshold: number,
  durationSec: number,
): Promise<{ segments: VideoSegment[]; method: "ffmpeg_scene" | "equal" }> {
  const r = await runCmd(getFfmpegPath(), [
    "-i",
    videoPath,
    "-vf",
    `select='gt(scene,${sceneThreshold})',showinfo`,
    "-f",
    "null",
    "-",
  ]);
  const stderr = r.stderr;
  const ptsTimes: number[] = [];
  const re = /pts_time:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const t = parseFloat(m[1]!);
    if (Number.isFinite(t)) ptsTimes.push(t);
  }
  if (ptsTimes.length === 0) {
    const n = Math.min(4, Math.max(1, Math.ceil(durationSec / 6)));
    const segLen = durationSec / n;
    const segments = Array.from({ length: n }, (_, i) => ({
      start: i * segLen,
      end: Math.min(durationSec, (i + 1) * segLen),
    }));
    return { segments, method: "equal" };
  }
  const cuts = [0, ...ptsTimes.filter((t) => t > 0 && t < durationSec), durationSec];
  const unique = [...new Set(cuts)].sort((a, b) => a - b);
  const out: VideoSegment[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const start = unique[i]!;
    const end = unique[i + 1]!;
    if (end - start > 0.05) out.push({ start, end });
  }
  const segments = out.length ? out : [{ start: 0, end: durationSec }];
  return { segments, method: "ffmpeg_scene" };
}

/**
 * Optional OpenCV Farneback segmentation via `scripts/segment_optical_flow.py`.
 * Falls back to {@link segmentScenesWithFfmpeg} if Python/OpenCV is unavailable.
 */
export async function segmentScenesWithOpticalFlow(
  videoPath: string,
  durationSec: number,
  sceneThreshold: number,
): Promise<{ segments: VideoSegment[]; method: SceneSegmentationMethod }> {
  const scriptPath = path.join(process.cwd(), "scripts", "segment_optical_flow.py");
  if (!existsSync(scriptPath)) {
    const fb = await segmentScenesWithFfmpeg(videoPath, sceneThreshold, durationSec);
    return { segments: fb.segments, method: fb.method };
  }
  let r: { stdout: string; stderr: string; code: number | null };
  try {
    r = await runCmd("python3", [scriptPath, videoPath], 600_000);
  } catch {
    // Missing python3, timeout, or other spawn failure — FFmpeg scene detection still works.
    const fb = await segmentScenesWithFfmpeg(videoPath, sceneThreshold, durationSec);
    return { segments: fb.segments, method: fb.method };
  }
  if (r.code !== 0) {
    const fb = await segmentScenesWithFfmpeg(videoPath, sceneThreshold, durationSec);
    return { segments: fb.segments, method: fb.method };
  }
  try {
    const raw = JSON.parse(r.stdout.trim()) as { segments?: VideoSegment[] };
    if (Array.isArray(raw.segments) && raw.segments.length > 0) {
      return { segments: raw.segments, method: "optical_flow" };
    }
  } catch {
    /* fall through */
  }
  const fb = await segmentScenesWithFfmpeg(videoPath, sceneThreshold, durationSec);
  return { segments: fb.segments, method: fb.method };
}
