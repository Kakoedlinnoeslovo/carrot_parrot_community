import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024;

let cachedFfmpegPath: string | undefined;
let cachedFfprobePath: string | undefined;

/**
 * Serverless bundles (Vercel, AWS Lambda) often deploy `ffmpeg-static` / `@ffprobe-installer` files without
 * the Unix execute bit, which makes `spawn` fail with `EACCES`. chmod +x fixes that.
 */
function tryChmodPlusX(filePath: string): void {
  if (process.platform === "win32") return;
  if (!filePath || filePath === "ffmpeg" || filePath === "ffprobe") return;
  try {
    if (existsSync(filePath)) chmodSync(filePath, 0o755);
  } catch {
    /* ignore: may be EPERM on system binaries; spawn will still work if already executable */
  }
}

/** Prefer FFMPEG_PATH, then npm `ffmpeg-static`, then PATH `ffmpeg`. */
export function getFfmpegPath(): string {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  const env = process.env.FFMPEG_PATH?.trim();
  if (env && existsSync(env)) {
    tryChmodPlusX(env);
    cachedFfmpegPath = env;
    return env;
  }
  if (ffmpegStatic != null && ffmpegStatic.length > 0 && existsSync(ffmpegStatic)) {
    tryChmodPlusX(ffmpegStatic);
    cachedFfmpegPath = ffmpegStatic;
    return ffmpegStatic;
  }
  cachedFfmpegPath = "ffmpeg";
  return cachedFfmpegPath;
}

/** Prefer FFPROBE_PATH, then npm `@ffprobe-installer/ffprobe`, then PATH `ffprobe`. */
export function getFfprobePath(): string {
  if (cachedFfprobePath) return cachedFfprobePath;
  const env = process.env.FFPROBE_PATH?.trim();
  if (env && existsSync(env)) {
    tryChmodPlusX(env);
    cachedFfprobePath = env;
    return env;
  }
  const p = ffprobeInstaller.path;
  if (p && existsSync(p)) {
    tryChmodPlusX(p);
    cachedFfprobePath = p;
    return p;
  }
  cachedFfprobePath = "ffprobe";
  return cachedFfprobePath;
}

function runCmd(
  cmd: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out`));
    }, options?.timeoutMs ?? 600_000);
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timeout);
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `${cmd} not found (${err.message}). Install ffmpeg/ffprobe on the server PATH (e.g. brew install ffmpeg on macOS), or use bundled binaries via npm (ffmpeg-static / @ffprobe-installer/ffprobe). Set FFMPEG_PATH / FFPROBE_PATH to override.`,
          ),
        );
        return;
      }
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, code });
    });
  });
}

export async function assertFfmpegAvailable(): Promise<void> {
  const r = await runCmd(getFfmpegPath(), ["-version"], { timeoutMs: 5000 });
  if (r.code !== 0) {
    throw new Error("ffmpeg not found or failed. Install ffmpeg and ensure it is on PATH.");
  }
}

export async function ffprobeDurationSeconds(videoUrlOrPath: string): Promise<number> {
  const r = await runCmd(
    getFfprobePath(),
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoUrlOrPath,
    ],
    { timeoutMs: 120_000 },
  );
  if (r.code !== 0) {
    throw new Error(`ffprobe failed: ${r.stderr.slice(0, 400)}`);
  }
  const n = parseFloat(r.stdout.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Could not read video duration");
  }
  return n;
}

/** Probe a local video file for its pixel dimensions. */
export async function ffprobeVideoSize(filePath: string): Promise<{ width: number; height: number }> {
  const r = await runCmd(
    getFfprobePath(),
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=s=x:p=0",
      filePath,
    ],
    { timeoutMs: 60_000 },
  );
  if (r.code !== 0) {
    throw new Error(`ffprobe size failed: ${r.stderr.slice(0, 400)}`);
  }
  const parts = r.stdout.trim().split("x");
  const width = parseInt(parts[0] ?? "", 10);
  const height = parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Could not read video dimensions from ffprobe output: "${r.stdout.trim()}"`);
  }
  return { width, height };
}

/**
 * Download remote URL to a temp file (size-capped).
 */
export async function downloadVideoToTempFile(url: string): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Only http(s) video URLs are allowed");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "cp-video-"));
  const filePath = path.join(dir, "input.bin");
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "CarrotParrotCommunity/1.0" },
  });
  if (!res.ok) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`Download failed: ${res.status}`);
  }
  const len = res.headers.get("content-length");
  if (len && Number(len) > MAX_DOWNLOAD_BYTES) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("Video file too large");
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_DOWNLOAD_BYTES) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("Video file too large");
  }
  await writeFile(filePath, Buffer.from(ab));
  return {
    filePath,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function extractAudioMp3(inputPath: string, outMp3: string): Promise<void> {
  const r = await runCmd(getFfmpegPath(), ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-q:a", "4", outMp3], {
    timeoutMs: 600_000,
  });
  if (r.code !== 0) {
    throw new Error(`extract_audio failed: ${r.stderr.slice(-800)}`);
  }
}

/** Single PNG frame at `tSec` seconds (used for local OCR on keyframes). */
export async function extractFramePngAtSecond(inputPath: string, outPng: string, tSec: number): Promise<void> {
  const r = await runCmd(
    getFfmpegPath(),
    ["-y", "-ss", String(Math.max(0, tSec)), "-i", inputPath, "-frames:v", "1", "-vf", "scale=720:-1", outPng],
    { timeoutMs: 120_000 },
  );
  if (r.code !== 0) {
    throw new Error(`extract_frame_at failed: ${r.stderr.slice(-800)}`);
  }
}

export async function extractFramesPng(
  inputPath: string,
  outDir: string,
  fps: number,
  maxFrames: number,
): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const pattern = path.join(outDir, "f-%04d.png");
  const vf = fps > 0 ? `fps=${fps}` : "fps=0.5";
  const r = await runCmd(
    getFfmpegPath(),
    ["-y", "-i", inputPath, "-vf", `${vf},scale=720:-1`, "-frames:v", String(maxFrames), pattern],
    { timeoutMs: 600_000 },
  );
  if (r.code !== 0) {
    throw new Error(`extract_frames failed: ${r.stderr.slice(-800)}`);
  }
  const files = (await readdir(outDir)).filter((f) => f.endsWith(".png")).sort();
  return files.map((f) => path.join(outDir, f));
}

export async function muxVideoAndAudio(videoPath: string, audioPath: string, outPath: string): Promise<void> {
  const r = await runCmd(
    getFfmpegPath(),
    [
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      outPath,
    ],
    { timeoutMs: 600_000 },
  );
  if (r.code !== 0) {
    throw new Error(`mux failed: ${r.stderr.slice(-800)}`);
  }
}

/** Max width for concat normalization; height preserves aspect (`-2`). */
export const CONCAT_NORMALIZE_MAX_WIDTH = 1280;
/** CFR applied to every segment before concat so mixed FPS / VFR clips concatenate reliably. */
export const CONCAT_NORMALIZE_FPS = 24;

/**
 * Video filter applied per segment before `concat` (scale cap + square pixels + CFR).
 * `setsar=1` avoids concat failing on invalid/missing SAR (e.g. `SAR 0:1` on portrait clips).
 * Comma in `min(W,iw)` must be escaped for FFmpeg filter syntax.
 */
export const CONCAT_NORMALIZE_VF = `scale=w=min(${CONCAT_NORMALIZE_MAX_WIDTH}\\,iw):h=-2,setsar=1,fps=${CONCAT_NORMALIZE_FPS}`;

/**
 * Build `-filter_complex` graph for N ≥ 2 inputs: normalize each video stream, then concat (video-only).
 *
 * When `targetW`/`targetH` are provided every input is scaled+padded to that exact
 * resolution so the concat filter never fails on mismatched dimensions.
 * Falls back to the legacy `CONCAT_NORMALIZE_VF` (width-cap only) when omitted.
 *
 * @internal Exported for tests.
 */
export function buildConcatFilterGraph(
  inputCount: number,
  targetW?: number,
  targetH?: number,
): string {
  if (inputCount < 2) {
    throw new Error("buildConcatFilterGraph: inputCount must be >= 2");
  }
  const vf =
    targetW && targetH
      ? `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${CONCAT_NORMALIZE_FPS}`
      : CONCAT_NORMALIZE_VF;
  const parts: string[] = [];
  for (let i = 0; i < inputCount; i++) {
    parts.push(`[${i}:v]${vf}[v${i}]`);
  }
  const concatInputs = Array.from({ length: inputCount }, (_, i) => `[v${i}]`).join("");
  return `${parts.join(";")};${concatInputs}concat=n=${inputCount}:v=1:a=0[outv]`;
}

/** Round up to the nearest even number (required for H.264 / yuv420p). */
function roundEven(v: number): number {
  return Math.ceil(v / 2) * 2;
}

/**
 * Concatenate multiple video files with **re-encode** (not stream copy). Decodes each segment,
 * normalizes resolution and frame rate, strips audio, then encodes H.264 + yuv420p.
 *
 * All inputs are probed with ffprobe and scaled+padded to a uniform canvas so the
 * concat filter never fails on mismatched dimensions (common with Kling / fal I2V outputs).
 */
export async function concatVideosNormalized(filePaths: string[], outPath: string): Promise<void> {
  const n = filePaths.length;
  if (n < 1) {
    throw new Error("concatVideosNormalized: need at least one file");
  }
  if (n === 1) {
    const r = await runCmd(
      getFfmpegPath(),
      [
        "-y",
        "-i",
        filePaths[0]!,
        "-vf",
        CONCAT_NORMALIZE_VF,
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outPath,
      ],
      { timeoutMs: 600_000 },
    );
    if (r.code !== 0) {
      throw new Error(`concat failed: ${r.stderr.slice(-800)}`);
    }
    return;
  }

  const sizes = await Promise.all(filePaths.map((p) => ffprobeVideoSize(p)));
  const maxW = Math.min(
    Math.max(...sizes.map((s) => s.width)),
    CONCAT_NORMALIZE_MAX_WIDTH,
  );
  const maxH = Math.max(...sizes.map((s) => s.height));
  const targetW = roundEven(maxW);
  const targetH = roundEven(maxH);

  const args: string[] = ["-y"];
  for (const p of filePaths) {
    args.push("-i", p);
  }
  args.push(
    "-filter_complex",
    buildConcatFilterGraph(n, targetW, targetH),
    "-map",
    "[outv]",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outPath,
  );
  const r = await runCmd(getFfmpegPath(), args, { timeoutMs: 600_000 });
  if (r.code !== 0) {
    throw new Error(`concat failed: ${r.stderr.slice(-800)}`);
  }
}

export async function readFileBuffer(p: string): Promise<Buffer> {
  return readFile(p);
}

/**
 * Download a remote image URL to a temp file (size-capped). Extension from URL or default `.bin`.
 */
export async function downloadImageToTempFile(url: string): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Only http(s) image URLs are allowed");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "cp-img-"));
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  const ext = /\.jpe?g(\?|$)/i.test(lower)
    ? ".jpg"
    : /\.png(\?|$)/i.test(lower)
      ? ".png"
      : /\.webp(\?|$)/i.test(lower)
        ? ".webp"
        : ".png";
  const filePath = path.join(dir, `input${ext}`);
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "CarrotParrotCommunity/1.0" },
  });
  if (!res.ok) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`Download failed: ${res.status}`);
  }
  const len = res.headers.get("content-length");
  if (len && Number(len) > MAX_DOWNLOAD_BYTES) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("Image file too large");
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_DOWNLOAD_BYTES) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("Image file too large");
  }
  await writeFile(filePath, Buffer.from(ab));
  return {
    filePath,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Convert each local image file to `frame-0001.png`, `frame-0002.png`, … in `outDir`.
 */
export async function normalizeImagesToPngSequence(localPaths: string[], outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (let i = 0; i < localPaths.length; i++) {
    const out = path.join(outDir, `frame-${String(i + 1).padStart(4, "0")}.png`);
    const r = await runCmd(getFfmpegPath(), ["-y", "-i", localPaths[i], out], { timeoutMs: 120_000 });
    if (r.code !== 0) {
      throw new Error(`normalize image failed: ${r.stderr.slice(-400)}`);
    }
  }
}

/**
 * Encode a numbered image sequence `frame-0001.png` … in `frameDir` to H.264 MP4.
 * Each frame is shown for `secondsPerFrame` seconds (`-framerate` = 1/secondsPerFrame before `-i`).
 */
export async function imagesSequenceToMp4(
  frameDir: string,
  secondsPerFrame: number,
  outPath: string,
  options?: { maxWidth?: number },
): Promise<void> {
  const spf = Math.min(60, Math.max(0.05, secondsPerFrame));
  const inRate = 1 / spf;
  const mw = options?.maxWidth;
  const pattern = path.join(frameDir, "frame-%04d.png");
  const args: string[] = [
    "-y",
    "-framerate",
    String(inRate),
    "-start_number",
    "1",
    "-i",
    pattern,
  ];
  const vf =
    mw != null && mw > 0
      ? `scale=w=min(${mw}\\,iw):h=-2,setsar=1`
      : "setsar=1";
  args.push("-vf", vf);
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath);
  const r = await runCmd(getFfmpegPath(), args, { timeoutMs: 600_000 });
  if (r.code !== 0) {
    throw new Error(`images_to_video failed: ${r.stderr.slice(-800)}`);
  }
}
