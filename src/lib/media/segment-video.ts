import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export type VideoSegment = { start: number; end: number };

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
): Promise<VideoSegment[]> {
  const r = await runCmd("ffmpeg", [
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
    return Array.from({ length: n }, (_, i) => ({
      start: i * segLen,
      end: Math.min(durationSec, (i + 1) * segLen),
    }));
  }
  const cuts = [0, ...ptsTimes.filter((t) => t > 0 && t < durationSec), durationSec];
  const unique = [...new Set(cuts)].sort((a, b) => a - b);
  const out: VideoSegment[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const start = unique[i]!;
    const end = unique[i + 1]!;
    if (end - start > 0.05) out.push({ start, end });
  }
  return out.length ? out : [{ start: 0, end: durationSec }];
}

/**
 * Optional OpenCV Farneback segmentation via `scripts/segment_optical_flow.py`.
 * Falls back to {@link segmentScenesWithFfmpeg} if Python/OpenCV is unavailable.
 */
export async function segmentScenesWithOpticalFlow(
  videoPath: string,
  durationSec: number,
  sceneThreshold: number,
): Promise<VideoSegment[]> {
  const scriptPath = path.join(process.cwd(), "scripts", "segment_optical_flow.py");
  if (!existsSync(scriptPath)) {
    return segmentScenesWithFfmpeg(videoPath, sceneThreshold, durationSec);
  }
  const r = await runCmd("python3", [scriptPath, videoPath], 600_000);
  if (r.code !== 0) {
    return segmentScenesWithFfmpeg(videoPath, sceneThreshold, durationSec);
  }
  try {
    const raw = JSON.parse(r.stdout.trim()) as { segments?: VideoSegment[] };
    if (Array.isArray(raw.segments) && raw.segments.length > 0) {
      return raw.segments;
    }
  } catch {
    /* fall through */
  }
  return segmentScenesWithFfmpeg(videoPath, sceneThreshold, durationSec);
}
