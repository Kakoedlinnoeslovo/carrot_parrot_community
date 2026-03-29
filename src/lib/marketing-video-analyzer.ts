import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { z } from "zod";

import {
  assertFfmpegAvailable,
  downloadVideoToTempFile,
  extractAudioMp3,
  extractFramePngAtSecond,
  ffprobeDurationSeconds,
} from "@/lib/media/ffmpeg";
import { ocrImageWithTesseract, transcribeAudioWithWhisperCli } from "@/lib/media/local-text-extract";
import { segmentScenesWithOpticalFlow } from "@/lib/media/segment-video";

export const marketingVideoAnalysisSchema = z.object({
  durationSec: z.number(),
  segments: z.array(z.object({ start: z.number(), end: z.number() })),
  segmentationMethod: z.enum(["optical_flow", "ffmpeg_scene", "equal"]),
  speechText: z.string(),
  ocrText: z.string(),
  speechFromLocalAsr: z.boolean(),
  textFromLocalOcr: z.boolean(),
});

export type MarketingVideoAnalysis = z.infer<typeof marketingVideoAnalysisSchema>;

export function parseMarketingVideoAnalysis(raw: unknown): { ok: true; data: MarketingVideoAnalysis } | { ok: false; error: z.ZodError } {
  const r = marketingVideoAnalysisSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error };
}

const MAX_OCR_FRAMES = 3;

/**
 * Download video, segment with optical flow (Farneback) when Python/OpenCV is available,
 * optional local ASR (Whisper CLI) and OCR (Tesseract) — no paid cloud APIs.
 */
export async function analyzeMarketingVideoFromUrl(videoUrl: string): Promise<MarketingVideoAnalysis> {
  const trimmed = videoUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Video URL must start with http:// or https://");
  }

  await assertFfmpegAvailable();

  const dl = await downloadVideoToTempFile(trimmed);
  const workDir = await mkdtemp(path.join(tmpdir(), "cp-analyze-"));
  try {
    const durationSec = await ffprobeDurationSeconds(dl.filePath);
    const { segments, method } = await segmentScenesWithOpticalFlow(dl.filePath, durationSec, 0.35);

    await mkdir(workDir, { recursive: true });
    const mp3Path = path.join(workDir, "audio.mp3");
    await extractAudioMp3(dl.filePath, mp3Path);
    const asr = await transcribeAudioWithWhisperCli(mp3Path, workDir);

    const ocrParts: string[] = [];
    const sampleTimes: number[] = [];
    if (segments.length > 0) {
      for (let i = 0; i < Math.min(segments.length, MAX_OCR_FRAMES); i++) {
        const s = segments[i]!;
        sampleTimes.push((s.start + s.end) / 2);
      }
    } else {
      sampleTimes.push(Math.min(1, durationSec / 2));
    }
    for (const t of sampleTimes.slice(0, MAX_OCR_FRAMES)) {
      const png = path.join(workDir, `ocr-${t.toFixed(2)}.png`);
      try {
        await extractFramePngAtSecond(dl.filePath, png, t);
        const o = await ocrImageWithTesseract(png);
        if (o.text) ocrParts.push(o.text);
      } catch {
        /* skip frame */
      }
    }
    const ocrText = [...new Set(ocrParts)].join(" | ").slice(0, 4000);

    return {
      durationSec,
      segments,
      segmentationMethod: method,
      speechText: asr.text.slice(0, 8000),
      ocrText,
      speechFromLocalAsr: asr.ok,
      textFromLocalOcr: ocrText.length > 0,
    };
  } finally {
    await dl.cleanup();
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
