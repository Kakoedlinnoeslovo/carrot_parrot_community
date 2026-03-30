"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";

import { MarketingExamplesCarousel } from "@/components/marketing-examples-carousel";
import type { MarketingVideoAnalysis } from "@/lib/marketing-video-analyzer";

type Phase = "idle" | "uploading" | "creating";

function CreateProgressBar({
  mode,
  percent,
}: {
  mode: "hidden" | "indeterminate" | "determinate";
  percent: number;
}) {
  if (mode === "hidden") return null;
  return (
    <div
      className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={mode === "determinate" ? Math.round(percent) : undefined}
      aria-busy
    >
      {mode === "indeterminate" ? (
        <div className="h-full rounded-full bg-orange-500 create-progress-indeterminate" />
      ) : (
        <div
          className="h-full rounded-full bg-orange-500 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

export default function CreateMarketingWorkflowPage() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [skipAnalysis, setSkipAnalysis] = useState(false);
  /** When analysis runs, include Whisper/OCR snippets in merged prompts (timeline/segments always merged). */
  const [includeSpeechOcrInPrompts, setIncludeSpeechOcrInPrompts] = useState(true);
  const [progressMode, setProgressMode] = useState<"hidden" | "indeterminate" | "determinate">("hidden");
  const [progressPercent, setProgressPercent] = useState(0);

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
    setProgressLabel("");
    setProgressPercent(0);

    try {
      if (skipAnalysis) {
        setProgressLabel("Creating workflow from template…");
        setProgressMode("indeterminate");
        const res = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "replicate-marketing-ad",
            videoUrl: trimmed,
            title: "Marketing ad replica",
            analyze: false,
          }),
        });
        const j = (await res.json()) as { workflow?: { id: string }; error?: string };
        if (!res.ok) throw new Error(j.error ?? "Create failed");
        const id = j.workflow?.id;
        if (!id) throw new Error("No workflow id");
        setProgressMode("determinate");
        setProgressPercent(100);
        setProgressLabel("Opening Studio…");
        router.push(`/studio/${id}`);
        return;
      }

      setProgressLabel("Analyzing video (segmentation, optional ASR/OCR)…");
      setProgressMode("indeterminate");
      setProgressPercent(0);
      const ar = await fetch("/api/marketing/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: trimmed }),
      });
      const aj = (await ar.json()) as { analysis?: MarketingVideoAnalysis; error?: string };
      if (!ar.ok) throw new Error(aj.error ?? "Analysis failed");
      if (!aj.analysis) throw new Error("No analysis returned");
      setProgressMode("determinate");
      setProgressPercent(50);

      setProgressLabel("Saving workflow…");
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "replicate-marketing-ad",
          videoUrl: trimmed,
          title: "Marketing ad replica",
          analyze: false,
          analysis: aj.analysis,
          includeSpeechOcrInPrompts,
        }),
      });
      const j = (await res.json()) as { workflow?: { id: string }; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Create failed");
      const id = j.workflow?.id;
      if (!id) throw new Error("No workflow id");
      setProgressPercent(100);
      setProgressLabel("Opening Studio…");
      router.push(`/studio/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
      setProgressLabel("");
      setProgressMode("hidden");
      setProgressPercent(0);
    }
  }

  const busy = phase === "uploading" || phase === "creating";

  const showProgress =
    phase === "uploading" || (phase === "creating" && (progressMode !== "hidden" || progressLabel));

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-sm font-medium text-orange-400">Marketing ad pipeline</p>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Create from video</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Paste a public video URL or upload a file (stored on fal).{" "}
        <span className="text-zinc-300">Video analysis and workflow generation are free</span>: we segment the ad with
        FFmpeg/OpenCV (optical flow when Python is available), optionally run local speech-to-text (Whisper CLI) and
        on-screen text OCR (Tesseract) if those tools are on the server.{" "}
        <span className="text-zinc-300">Generative fal steps</span> (Nano Banana, Kling, storage uploads) use your saved
        fal API key or credits as elsewhere in Studio. New workflows use the{" "}
        <span className="text-zinc-300">Video keyframes</span> picker and manual frame times by default (edit the
        timeline in Studio before running).
      </p>

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Inspiration</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Demo clips are served from{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-500">/marketing-ads/*</code> (see{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-500">public/marketing-ads</code>).
        </p>
        <div className="mt-4">
          <MarketingExamplesCarousel videoUrl={videoUrl} onPickUrl={pickExample} />
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
        {!skipAnalysis ? (
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={includeSpeechOcrInPrompts}
              disabled={busy}
              onChange={(e) => setIncludeSpeechOcrInPrompts(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Include speech and on-screen text (OCR) in prompts
          </label>
        ) : null}
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

      {showProgress ? (
        <>
          {progressLabel ? (
            <p className="mt-4 text-sm text-cyan-400" role="status">
              {progressLabel}
            </p>
          ) : null}
          {phase === "uploading" ? (
            <CreateProgressBar mode="indeterminate" percent={0} />
          ) : phase === "creating" ? (
            <CreateProgressBar mode={progressMode} percent={progressPercent} />
          ) : null}
        </>
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
          {phase === "creating" ? "Working…" : "Create workflow"}
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
