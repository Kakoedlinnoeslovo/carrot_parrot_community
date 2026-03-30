import type { Artifact, MediaItem } from "@/lib/artifact-json";
import type { MergeArtifact } from "@/lib/fal-merge-input";
import type { FalClient } from "@/lib/fal-client";
import {
  assertFfmpegAvailable,
  concatVideosFromList,
  downloadImageToTempFile,
  downloadVideoToTempFile,
  extractAudioMp3,
  extractFramePngAtSecond,
  extractFramesPng,
  ffprobeDurationSeconds,
  imagesSequenceToMp4,
  muxVideoAndAudio,
  normalizeImagesToPngSequence,
  readFileBuffer,
  writeConcatListFile,
} from "@/lib/media/ffmpeg";
import { segmentScenesWithOpticalFlow } from "@/lib/media/segment-video";
import type { WorkflowGraph, WorkflowNode } from "@/lib/workflow-graph";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

function urlsFromArtifact(art: MergeArtifact | undefined): { videos: string[]; audios: string[]; images: string[] } {
  const videos: string[] = [];
  const audios: string[] = [];
  const images: string[] = [];
  if (!art) return { videos, audios, images };
  for (const m of art.media ?? []) {
    if (m.kind === "video") videos.push(m.url);
    else if (m.kind === "audio") audios.push(m.url);
    else if (m.kind === "image" || m.kind === "unknown") images.push(m.url);
  }
  for (const u of art.images) {
    if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) {
      if (!videos.includes(u)) videos.push(u);
    } else if (!images.includes(u)) {
      images.push(u);
    }
  }
  return { videos, audios, images };
}

function firstVideoUrl(art: MergeArtifact | undefined): string | undefined {
  const { videos, images } = urlsFromArtifact(art);
  if (videos[0]) return videos[0];
  return images.find((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u));
}

function firstAudioUrl(art: MergeArtifact | undefined): string | undefined {
  return urlsFromArtifact(art).audios[0];
}

/**
 * Resolve incoming edges into this `media_process` node (uses targetHandle: video_url, audio_url, …).
 */
export function collectMediaProcessInputs(
  graph: WorkflowGraph,
  nodeId: string,
  artifacts: Record<string, MergeArtifact | undefined>,
): { videoUrl?: string; audioUrl?: string; videoUrls: string[]; imageUrls: string[] } {
  let videoUrl: string | undefined;
  let audioUrl: string | undefined;
  const videoUrls: string[] = [];
  const imageUrls: string[] = [];

  for (const e of graph.edges) {
    if (e.target !== nodeId) continue;
    const art = artifacts[e.source];
    const th = (e.targetHandle ?? "").trim().toLowerCase();
    const { videos, audios, images } = urlsFromArtifact(art);

    if (th === "audio_url" || th === "audio") {
      const a = audios[0] ?? art?.text?.match(/https?:\/\/[^\s]+\.(mp3|wav|m4a)/i)?.[0];
      if (a) audioUrl = a;
      continue;
    }
    if (th === "video_url" || th === "video") {
      const v = videos[0] ?? firstVideoUrl(art);
      if (v) {
        videoUrl = v;
        if (!videoUrls.includes(v)) videoUrls.push(v);
      }
      continue;
    }
    if (th === "image_urls" || th === "images") {
      const ims = images.length ? images : art?.images ?? [];
      for (const im of ims) {
        if (!imageUrls.includes(im)) imageUrls.push(im);
      }
      continue;
    }
    const v = firstVideoUrl(art) ?? videos[0];
    const a = audios[0];
    const ims = images.length ? images : art?.images ?? [];
    if (v && (th === "" || th === "in")) {
      if (!videoUrl) videoUrl = v;
      if (!videoUrls.includes(v)) videoUrls.push(v);
    }
    if (a && (th === "" || th === "in")) {
      if (!audioUrl) audioUrl = a;
    }
    for (const im of ims) {
      if (!imageUrls.includes(im)) imageUrls.push(im);
    }
  }

  return { videoUrl, audioUrl, videoUrls, imageUrls };
}

/**
 * Video URLs for `concat_videos` in deterministic order: `targetHandle` `video_0`, `video_1`, …
 * if present; otherwise lexical order of edge `id`.
 */
export function collectOrderedConcatVideoUrls(
  graph: WorkflowGraph,
  nodeId: string,
  artifacts: Record<string, MergeArtifact | undefined>,
): string[] {
  type Row = { slot: number; edgeId: string; url: string };
  const rows: Row[] = [];
  for (const e of graph.edges) {
    if (e.target !== nodeId) continue;
    const art = artifacts[e.source];
    const { videos } = urlsFromArtifact(art);
    const v = firstVideoUrl(art) ?? videos[0];
    if (!v) continue;
    const th = (e.targetHandle ?? "").trim().toLowerCase();
    const m = /^video_(\d+)$/.exec(th);
    const slot = m ? parseInt(m[1]!, 10) : -1;
    rows.push({ slot, edgeId: e.id, url: v });
  }
  const hasSlots = rows.some((r) => r.slot >= 0);
  rows.sort((a, b) => {
    if (hasSlots) {
      const sa = a.slot >= 0 ? a.slot : 1_000_000;
      const sb = b.slot >= 0 ? b.slot : 1_000_000;
      if (sa !== sb) return sa - sb;
    }
    return a.edgeId.localeCompare(b.edgeId);
  });
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!seen.has(r.url)) {
      seen.add(r.url);
      out.push(r.url);
    }
  }
  return out;
}

async function uploadBlob(fal: FalClient, buf: Buffer, contentType: string): Promise<string> {
  const blob = new Blob([new Uint8Array(buf)], { type: contentType });
  return fal.storage.upload(blob);
}

const MANUAL_KEYFRAME_MAX = 24;

function normalizeManualFrameTimes(raw: number[], durationSec: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const t of raw) {
    if (typeof t !== "number" || !Number.isFinite(t)) continue;
    const clamped = Math.max(0, Math.min(durationSec, t));
    const rounded = Math.round(clamped * 1000) / 1000;
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    out.push(rounded);
    if (out.length >= MANUAL_KEYFRAME_MAX) break;
  }
  out.sort((a, b) => a - b);
  return out;
}

/** Seconds for `extract_keyframes_manual`: `params.frameTimesSec` or any upstream `video_keyframe_picker`. */
export function frameTimesForManualExtract(
  graph: WorkflowGraph,
  mediaNodeId: string,
  params: { frameTimesSec?: number[] },
): number[] {
  const fromParams = params.frameTimesSec;
  if (Array.isArray(fromParams) && fromParams.length > 0) {
    return fromParams.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  }
  for (const e of graph.edges) {
    if (e.target !== mediaNodeId) continue;
    const n = graph.nodes.find((x) => x.id === e.source);
    if (n?.type === "video_keyframe_picker") {
      const times = n.data.frameTimesSec;
      if (Array.isArray(times) && times.length > 0) {
        return times.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
      }
    }
  }
  return [];
}

export async function runMediaProcessNode(
  node: Extract<WorkflowNode, { type: "media_process" }>,
  graph: WorkflowGraph,
  artifacts: Record<string, MergeArtifact | undefined>,
  fal: FalClient,
): Promise<Artifact> {
  await assertFfmpegAvailable();
  const op = node.data.operation;
  const params = node.data.params ?? {};
  const inputs = collectMediaProcessInputs(graph, node.id, artifacts);
  const workDir = await mkdtemp(path.join(tmpdir(), "cp-media-"));

  try {
    if (op === "extract_audio") {
      const url = inputs.videoUrl ?? inputs.videoUrls[0];
      if (!url) throw new Error("extract_audio: missing video URL from upstream");
      const dl = await downloadVideoToTempFile(url);
      try {
        const outMp3 = path.join(workDir, "out.mp3");
        await extractAudioMp3(dl.filePath, outMp3);
        const buf = await readFileBuffer(outMp3);
        const uploaded = await uploadBlob(fal, buf, "audio/mpeg");
        const media: MediaItem[] = [{ url: uploaded, kind: "audio" }];
        return { images: [], media, text: undefined };
      } finally {
        await dl.cleanup();
      }
    }

    if (op === "extract_frames") {
      const url = inputs.videoUrl ?? inputs.videoUrls[0];
      if (!url) throw new Error("extract_frames: missing video URL from upstream");
      const fps = params?.fps ?? 0.5;
      const maxFrames = Math.min(48, Math.max(1, params?.maxFrames ?? 8));
      const dl = await downloadVideoToTempFile(url);
      try {
        const frameDir = path.join(workDir, "frames");
        const paths = await extractFramesPng(dl.filePath, frameDir, fps, maxFrames);
        const media: MediaItem[] = [];
        const images: string[] = [];
        for (const p of paths) {
          const buf = await readFileBuffer(p);
          const u = await uploadBlob(fal, buf, "image/png");
          images.push(u);
          media.push({ url: u, kind: "image" });
        }
        return { images, media, text: undefined };
      } finally {
        await dl.cleanup();
      }
    }

    if (op === "segment_scenes") {
      const url = inputs.videoUrl ?? inputs.videoUrls[0];
      if (!url) throw new Error("segment_scenes: missing video URL from upstream");
      const dl = await downloadVideoToTempFile(url);
      try {
        const dur = await ffprobeDurationSeconds(dl.filePath);
        const th = params?.sceneThreshold ?? 0.35;
        const { segments, method } = await segmentScenesWithOpticalFlow(dl.filePath, dur, th);
        const text = JSON.stringify({ segments, durationSec: dur, segmentationMethod: method });
        return { images: [], media: [], text };
      } finally {
        await dl.cleanup();
      }
    }

    if (op === "extract_keyframes") {
      const url = inputs.videoUrl ?? inputs.videoUrls[0];
      if (!url) throw new Error("extract_keyframes: missing video URL from upstream");
      const maxSeg = Math.min(24, Math.max(1, params?.keyframeMaxSegments ?? 8));
      const sceneTh = params?.sceneThreshold ?? 0.35;
      const dl = await downloadVideoToTempFile(url);
      try {
        const dur = await ffprobeDurationSeconds(dl.filePath);
        const { segments, method } = await segmentScenesWithOpticalFlow(dl.filePath, dur, sceneTh);
        const use = segments.slice(0, maxSeg);
        const media: MediaItem[] = [];
        const images: string[] = [];
        const frameDir = path.join(workDir, "kf");
        await mkdir(frameDir, { recursive: true });
        for (let i = 0; i < use.length; i++) {
          const s = use[i]!;
          const t = Math.max(0, (s.start + s.end) / 2);
          const png = path.join(frameDir, `kf-${i}.png`);
          await extractFramePngAtSecond(dl.filePath, png, t);
          const buf = await readFileBuffer(png);
          const u = await uploadBlob(fal, buf, "image/png");
          images.push(u);
          media.push({ url: u, kind: "image" });
        }
        const meta = JSON.stringify({
          segments: use,
          durationSec: dur,
          segmentationMethod: method,
          keyframeCount: images.length,
        });
        return { images, media, text: meta };
      } finally {
        await dl.cleanup();
      }
    }

    if (op === "extract_keyframes_manual") {
      const url = inputs.videoUrl ?? inputs.videoUrls[0];
      if (!url) throw new Error("extract_keyframes_manual: missing video URL from upstream");
      let times = frameTimesForManualExtract(graph, node.id, params as { frameTimesSec?: number[] });
      if (times.length < 1) {
        throw new Error(
          "extract_keyframes_manual: set frame times on the Video keyframe picker node or params.frameTimesSec",
        );
      }
      const dl = await downloadVideoToTempFile(url);
      try {
        const dur = await ffprobeDurationSeconds(dl.filePath);
        times = normalizeManualFrameTimes(times, dur);
        if (times.length < 1) throw new Error("extract_keyframes_manual: no valid times after clamping to video duration");
        const media: MediaItem[] = [];
        const images: string[] = [];
        const frameDir = path.join(workDir, "kf-manual");
        await mkdir(frameDir, { recursive: true });
        for (let i = 0; i < times.length; i++) {
          const t = times[i]!;
          const png = path.join(frameDir, `kf-${i}.png`);
          await extractFramePngAtSecond(dl.filePath, png, t);
          const buf = await readFileBuffer(png);
          const u = await uploadBlob(fal, buf, "image/png");
          images.push(u);
          media.push({ url: u, kind: "image" });
        }
        const meta = JSON.stringify({
          frameTimesSec: times,
          durationSec: dur,
          keyframeCount: images.length,
          method: "manual",
        });
        return { images, media, text: meta };
      } finally {
        await dl.cleanup();
      }
    }

    if (op === "pick_image") {
      const urls = inputs.imageUrls;
      const idx = Math.max(0, Math.floor(params?.index ?? 0));
      if (urls.length < 1) throw new Error("pick_image: need at least one upstream image URL");
      if (idx >= urls.length) {
        throw new Error(`pick_image: index ${idx} out of range (${urls.length} images)`);
      }
      const u = urls[idx]!;
      return { images: [u], media: [{ url: u, kind: "image" }], text: undefined };
    }

    if (op === "sync_barrier") {
      return { images: [], media: [], text: undefined };
    }

    if (op === "concat_videos") {
      const urls = collectOrderedConcatVideoUrls(graph, node.id, artifacts);
      if (urls.length < 1) throw new Error("concat_videos: need at least one video URL");
      const localPaths: string[] = [];
      const cleanups: Array<() => Promise<void>> = [];
      try {
        for (const u of urls) {
          const dl = await downloadVideoToTempFile(u);
          localPaths.push(dl.filePath);
          cleanups.push(dl.cleanup);
        }
        const listFile = path.join(workDir, "list.txt");
        await writeConcatListFile(localPaths, listFile);
        const out = path.join(workDir, "concat-out.mp4");
        await concatVideosFromList(listFile, out);
        const buf = await readFileBuffer(out);
        const uploaded = await uploadBlob(fal, buf, "video/mp4");
        return { images: [], media: [{ url: uploaded, kind: "video" }], text: undefined };
      } finally {
        for (const c of cleanups) {
          await c();
        }
      }
    }

    if (op === "images_to_video") {
      const urls = inputs.imageUrls;
      const maxFrames = Math.min(48, Math.max(1, params?.maxFrames ?? 48));
      const slice = urls.slice(0, maxFrames);
      if (slice.length < 1) throw new Error("images_to_video: need at least one image URL from upstream");
      const secondsPerFrame = Math.min(60, Math.max(0.05, params?.secondsPerFrame ?? 0.5));
      const maxWidth = params?.maxWidth;
      const seqDir = path.join(workDir, "seq");
      const localPaths: string[] = [];
      const cleanups: Array<() => Promise<void>> = [];
      try {
        for (const u of slice) {
          const dl = await downloadImageToTempFile(u);
          localPaths.push(dl.filePath);
          cleanups.push(dl.cleanup);
        }
        await normalizeImagesToPngSequence(localPaths, seqDir);
        const out = path.join(workDir, `slideshow-${randomUUID()}.mp4`);
        await imagesSequenceToMp4(seqDir, secondsPerFrame, out, {
          maxWidth: maxWidth != null && maxWidth > 0 ? maxWidth : undefined,
        });
        const buf = await readFileBuffer(out);
        const uploaded = await uploadBlob(fal, buf, "video/mp4");
        return { images: [], media: [{ url: uploaded, kind: "video" }], text: undefined };
      } finally {
        for (const c of cleanups) {
          await c();
        }
      }
    }

    if (op === "mux_audio_video") {
      let videoU = inputs.videoUrl ?? inputs.videoUrls[0];
      let audioU = inputs.audioUrl;
      if (!videoU || !audioU) {
        for (const e of graph.edges) {
          if (e.target !== node.id) continue;
          const th = (e.targetHandle ?? "").toLowerCase();
          if (!videoU && th.includes("video")) {
            const v = firstVideoUrl(artifacts[e.source]);
            if (v) videoU = v;
          }
          if (!audioU && th.includes("audio")) {
            const a = firstAudioUrl(artifacts[e.source]);
            if (a) audioU = a;
          }
        }
      }
      if (!videoU) throw new Error("mux: missing video URL");
      if (!audioU) throw new Error("mux: missing audio URL");
      const vdl = await downloadVideoToTempFile(videoU);
      const adl = await downloadVideoToTempFile(audioU);
      try {
        const out = path.join(workDir, `mux-${randomUUID()}.mp4`);
        await muxVideoAndAudio(vdl.filePath, adl.filePath, out);
        const buf = await readFileBuffer(out);
        const uploaded = await uploadBlob(fal, buf, "video/mp4");
        return { images: [], media: [{ url: uploaded, kind: "video" }], text: undefined };
      } finally {
        await vdl.cleanup();
        await adl.cleanup();
      }
    }

    throw new Error(`Unknown media_process operation: ${String(op)}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
