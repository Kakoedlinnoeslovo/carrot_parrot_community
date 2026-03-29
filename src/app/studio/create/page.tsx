"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";

/** Curated public sample videos (landscape demos; vertical 9:16 cards crop in UI). */
const EXAMPLE_VIDEOS = [
  {
    id: "bbb",
    title: "Big Buck Bunny",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    gradient: "from-amber-900/80 to-orange-950/90",
  },
  {
    id: "ed",
    title: "Elephants Dream",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    gradient: "from-violet-900/80 to-zinc-950/90",
  },
  {
    id: "sintel",
    title: "Sintel",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    gradient: "from-cyan-900/80 to-slate-950/90",
  },
] as const;

type Phase = "idle" | "uploading" | "creating";

export default function CreateMarketingWorkflowPage() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [skipAnalysis, setSkipAnalysis] = useState(false);

  const pickExample = useCallback((url: string) => {
    setVideoUrl(url);
    setError(null);
  }, []);

  async function onUploadFile(file: File) {
    setError(null);
    setPhase("uploading");
    setProgressLabel("Uploading to fal storage…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/fal/storage/upload", { method: "POST", body: fd });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      if (j.url) setVideoUrl(j.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
      setProgressLabel("");
    }
  }

  async function onCreate() {
    const trimmed = videoUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("Enter a valid https URL or upload a file.");
      return;
    }
    setError(null);
    setPhase("creating");
    setProgressLabel(
      skipAnalysis
        ? "Creating workflow from template…"
        : "Analyzing video (segmentation + optional local ASR/OCR), then building workflow…",
    );
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "replicate-marketing-ad",
          videoUrl: trimmed,
          title: "Marketing ad replica",
          analyze: !skipAnalysis,
        }),
      });
      const j = (await res.json()) as { workflow?: { id: string }; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Create failed");
      const id = j.workflow?.id;
      if (!id) throw new Error("No workflow id");
      setProgressLabel("Opening Studio…");
      router.push(`/studio/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
      setProgressLabel("");
    }
  }

  const busy = phase === "uploading" || phase === "creating";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-sm font-medium text-orange-400">Marketing ad pipeline</p>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Create from video</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Paste a public video URL or upload a file (stored on fal).{" "}
        <span className="text-zinc-300">
          Video analysis and workflow generation are free
        </span>
        : we segment the ad with FFmpeg/OpenCV (optical flow when Python is available), optionally run local
        speech-to-text (Whisper CLI) and on-screen text OCR (Tesseract) if those tools are on the server.{" "}
        <span className="text-zinc-300">Generative fal steps</span> (Nano Banana, Kling, storage uploads) use
        your saved fal API key or credits as elsewhere in Studio.
      </p>

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Inspiration</h2>
        <div className="mt-3 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {EXAMPLE_VIDEOS.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => pickExample(ex.url)}
              className={`group relative w-[140px] shrink-0 overflow-hidden rounded-xl border bg-zinc-900 text-left ring-1 transition-colors ${
                videoUrl === ex.url ? "border-orange-500/60 ring-orange-500/30" : "border-white/10 ring-white/5 hover:border-white/20"
              }`}
              style={{ aspectRatio: "9 / 16" }}
            >
              <div
                className={`flex h-full w-full flex-col justify-end bg-gradient-to-br p-3 text-left ${ex.gradient}`}
              >
                <span className="text-[11px] font-medium leading-snug text-white/95">{ex.title}</span>
                <span className="mt-1 text-[9px] text-white/60">Tap to use URL</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <label className="block text-xs font-medium text-zinc-500">Video URL</label>
        <input
          type="url"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
          placeholder="https://…"
          value={videoUrl}
          disabled={busy}
          onChange={(e) => setVideoUrl(e.target.value)}
        />
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={skipAnalysis}
            disabled={busy}
            onChange={(e) => setSkipAnalysis(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Skip analysis (faster; baseline template only, no segment/ASR/OCR hints in prompts)
        </label>
        <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
          {phase === "uploading" ? "Uploading…" : "Upload video"}
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onUploadFile(f);
            }}
          />
        </label>
      </div>

      {progressLabel ? (
        <p className="mt-4 text-sm text-cyan-400" role="status">
          {progressLabel}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCreate()}
          className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-50"
        >
          {phase === "creating" ? "Creating…" : "Create workflow"}
        </button>
        <Link
          href="/studio"
          className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
        >
          Back to workflows
        </Link>
      </div>
    </div>
  );
}
