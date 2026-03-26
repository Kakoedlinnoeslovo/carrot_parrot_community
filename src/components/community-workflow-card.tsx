"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { LikeButton } from "@/components/like-button";
import { RemixButton } from "@/components/remix-button";
import { TrackedLink } from "@/components/tracked-link";
import type { CommunityPreview } from "@/lib/community-preview";

function displayName(name: string | null | undefined, email: string | null | undefined): string {
  return name?.trim() || email?.split("@")[0]?.trim() || "Creator";
}

function initials(from: string): string {
  const parts = from.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

type Props = {
  workflowId: string;
  slug: string;
  title: string | null;
  preview: CommunityPreview;
  authorName: string | null;
  authorEmail: string | null;
  authorImage: string | null;
  likeCount: number;
  initialLiked: boolean;
  isLoggedIn: boolean;
  index: number;
};

export function CommunityWorkflowCard({
  workflowId,
  slug,
  title,
  preview,
  authorName,
  authorEmail,
  authorImage,
  likeCount,
  initialLiked,
  isLoggedIn,
  index,
}: Props) {
  const author = displayName(authorName, authorEmail);
  const videoRef = useRef<HTMLVideoElement>(null);

  const motionOk =
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const playPreview = useCallback(() => {
    if (!motionOk || preview.type !== "media" || preview.kind !== "video") return;
    void videoRef.current?.play()?.catch(() => {});
  }, [preview, motionOk]);

  const pausePreview = useCallback(() => {
    if (preview.type !== "media" || preview.kind !== "video") return;
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [preview]);

  const delayMs = Math.min(index, 24) * 50;

  const denseBtn =
    "border-white/20 bg-black/45 px-2 py-1 text-xs backdrop-blur-md hover:border-white/35 hover:bg-black/55";

  return (
    <article
      className="community-card-enter break-inside-avoid mb-4"
      style={{ animationDelay: `${delayMs}ms` }}
      onMouseEnter={playPreview}
      onMouseLeave={pausePreview}
    >
      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40 shadow-[0_24px_64px_-28px_rgba(0,0,0,0.75)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-white/[0.14] hover:shadow-[0_28px_72px_-28px_rgba(0,0,0,0.82)]">
        <div className="relative z-0">
          {preview.type === "placeholder" && (
            <div
              className="min-h-[200px] w-full bg-gradient-to-br from-orange-500/25 via-zinc-800 to-zinc-950 motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out group-hover:scale-[1.02]"
              aria-hidden
            />
          )}
          {preview.type === "media" && preview.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary CDN URLs
            <img
              src={preview.url}
              alt=""
              loading="lazy"
              className="h-auto w-full max-h-[min(85vh,520px)] object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out group-hover:scale-[1.02]"
            />
          )}
          {preview.type === "media" && preview.kind === "video" && (
            <div className="relative">
              <video
                ref={videoRef}
                src={preview.url}
                muted
                loop
                playsInline
                preload="none"
                aria-hidden
                className="h-auto w-full max-h-[min(85vh,520px)] object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out group-hover:scale-[1.02]"
              />
              <div
                className="pointer-events-none absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md motion-safe:opacity-90 motion-safe:transition-opacity motion-safe:duration-300 group-hover:opacity-100"
                aria-hidden
              >
                <span className="ml-0.5 text-[10px]">▶</span>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
        </div>

        <TrackedLink
          href={`/w/${slug}`}
          eventLabel="community_open_workflow"
          className="absolute inset-0 z-10 rounded-2xl outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400/80"
          aria-label={`Open workflow: ${title ?? "Untitled"}`}
        />

        <div className="pointer-events-none absolute left-2 top-2 z-30 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-full border border-white/15 bg-black/35 py-1 pl-1 pr-3 backdrop-blur-xl">
          {authorImage && /^https?:\/\//i.test(authorImage) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={authorImage}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/25 text-[10px] font-semibold text-orange-200"
              aria-hidden
            >
              {initials(author)}
            </div>
          )}
          <span className="truncate text-xs font-medium text-zinc-100">{author}</span>
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 p-3 pt-10">
          <h2 className="line-clamp-2 text-base font-semibold leading-snug text-white drop-shadow-sm">
            {title?.trim() || "Untitled workflow"}
          </h2>
        </div>

        <div className="absolute bottom-2 right-2 z-30 flex flex-wrap items-center justify-end gap-1.5">
          {isLoggedIn ? (
            <>
              <LikeButton
                workflowId={workflowId}
                initialLiked={initialLiked}
                initialCount={likeCount}
                className={denseBtn}
              />
              <RemixButton workflowId={workflowId} className={denseBtn} />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-white/20 bg-black/45 px-2 py-1 text-xs font-medium text-zinc-100 backdrop-blur-md transition-[background-color,border-color] duration-300 ease-out hover:border-white/35 hover:bg-black/55"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
