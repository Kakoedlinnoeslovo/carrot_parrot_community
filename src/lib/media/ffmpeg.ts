import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024;

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
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, code });
    });
  });
}

export async function assertFfmpegAvailable(): Promise<void> {
  const r = await runCmd("ffmpeg", ["-version"], { timeoutMs: 5000 });
  if (r.code !== 0) {
    throw new Error("ffmpeg not found or failed. Install ffmpeg and ensure it is on PATH.");
  }
}

export async function ffprobeDurationSeconds(videoUrlOrPath: string): Promise<number> {
  const r = await runCmd(
    "ffprobe",
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
  const r = await runCmd("ffmpeg", ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-q:a", "4", outMp3], {
    timeoutMs: 600_000,
  });
  if (r.code !== 0) {
    throw new Error(`extract_audio failed: ${r.stderr.slice(-800)}`);
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
    "ffmpeg",
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
    "ffmpeg",
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

export async function concatVideosFromList(listFile: string, outPath: string): Promise<void> {
  const r = await runCmd(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outPath],
    { timeoutMs: 600_000 },
  );
  if (r.code !== 0) {
    throw new Error(`concat failed: ${r.stderr.slice(-800)}`);
  }
}

export async function readFileBuffer(p: string): Promise<Buffer> {
  return readFile(p);
}

export async function writeConcatListFile(filePaths: string[], outList: string): Promise<void> {
  const lines = filePaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`);
  await writeFile(outList, lines.join("\n"), "utf8");
}
