"use client";

import { MARKETING_DEMO_EXAMPLES, toAbsoluteMarketingDemoUrl } from "@/lib/marketing-demo-videos";

type Props = {
  videoUrl: string;
  onPickUrl: (absoluteUrl: string) => void;
};

/**
 * Horizontal Meta-ad-style strip: 9:16 cards, peek scroll, optional muted loop preview.
 */
export function MarketingExamplesCarousel({ videoUrl, onPickUrl }: Props) {
  return (
    <div className="relative -mx-1">
      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-3 pt-1 [scrollbar-width:thin] sm:px-10"
        style={{ scrollPaddingInline: "1.5rem" }}
      >
        {MARKETING_DEMO_EXAMPLES.map((ex) => {
          const selected = videoUrl.includes(ex.src) || videoUrl.endsWith(`${ex.id}.mp4`);
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  onPickUrl(toAbsoluteMarketingDemoUrl(ex.src, window.location.origin));
                }
              }}
              className={`group relative w-[132px] shrink-0 snap-center overflow-hidden rounded-2xl border text-left ring-1 transition-colors ${
                selected
                  ? "border-orange-500/70 ring-orange-500/35"
                  : "border-white/10 ring-white/5 hover:border-white/25"
              } `}
              style={{ aspectRatio: "9 / 16" }}
            >
              <video
                className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100 motion-reduce:hidden"
                src={ex.src}
                muted
                playsInline
                loop
                preload="metadata"
                aria-hidden
              />
              <div className="absolute inset-0 hidden bg-gradient-to-br from-zinc-700 to-zinc-900 motion-reduce:block" aria-hidden />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-2.5">
                <span className="text-[11px] font-medium leading-snug text-white/95">{ex.title}</span>
                <span className="mt-0.5 text-[9px] text-white/55">Tap to use</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
