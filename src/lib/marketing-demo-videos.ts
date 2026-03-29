/**
 * Static demos under `public/marketing-ads/` (copied from repo `marketing ads/`).
 * Use {@link toAbsoluteMarketingDemoUrl} on the client for API calls (analyze + workflows).
 */
export const MARKETING_DEMO_EXAMPLES = [
  { id: "demo-1", title: "Ad example 1", src: "/marketing-ads/demo-1.mp4" },
  { id: "demo-2", title: "Ad example 2", src: "/marketing-ads/demo-2.mp4" },
  { id: "demo-3", title: "Ad example 3", src: "/marketing-ads/demo-3.mp4" },
  { id: "demo-4", title: "Ad example 4", src: "/marketing-ads/demo-4.mp4" },
  { id: "demo-5", title: "Ad example 5", src: "/marketing-ads/demo-5.mp4" },
] as const;

/** Build https URL for same-origin demo files (required by analyze download + fal). */
export function toAbsoluteMarketingDemoUrl(src: string, origin: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  const base = origin.replace(/\/$/, "");
  const path = src.startsWith("/") ? src : `/${src}`;
  return `${base}${path}`;
}
