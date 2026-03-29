import { spawn } from "node:child_process";
import path from "node:path";

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

/**
 * Local speech-to-text via OpenAI Whisper CLI if `whisper` is on PATH (pip install openai-whisper).
 * No cloud APIs; returns empty text if the binary is missing or run fails.
 */
export async function transcribeAudioWithWhisperCli(
  audioPath: string,
  outputDir: string,
): Promise<{ text: string; ok: boolean }> {
  try {
    const r = await runCmd(
      "whisper",
      [
        audioPath,
        "--model",
        "tiny",
        "--output_dir",
        outputDir,
        "--output_format",
        "txt",
        "--language",
        "en",
      ],
      { timeoutMs: 600_000 },
    );
    if (r.code !== 0) {
      return { text: "", ok: false };
    }
    const base = path.basename(audioPath, path.extname(audioPath));
    const fs = await import("node:fs/promises");
    const txtPath = path.join(outputDir, `${base}.txt`);
    const raw = await fs.readFile(txtPath, "utf8").catch(() => "");
    const text = raw.replace(/\s+/g, " ").trim();
    return { text, ok: text.length > 0 };
  } catch {
    return { text: "", ok: false };
  }
}

/**
 * OCR via Tesseract CLI if `tesseract` is on PATH. No cloud APIs.
 */
export async function ocrImageWithTesseract(pngPath: string): Promise<{ text: string; ok: boolean }> {
  try {
    const r = await runCmd("tesseract", [pngPath, "stdout", "-l", "eng"], { timeoutMs: 120_000 });
    if (r.code !== 0) {
      return { text: "", ok: false };
    }
    const text = r.stdout.replace(/\s+/g, " ").trim();
    return { text, ok: text.length > 0 };
  } catch {
    return { text: "", ok: false };
  }
}
