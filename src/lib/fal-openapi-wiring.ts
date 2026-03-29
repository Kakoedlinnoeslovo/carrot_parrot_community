/**
 * Derive edge wiring defaults from fal queue input/output JSON Schemas (OpenAPI),
 * replacing endpoint-id substring heuristics.
 */

import { listMappableInputKeysFromSchema, listMappableOutputKeysFromSchema } from "@/lib/fal-schema-handles";

/** Top-level input keys that accept raster / frame images from an upstream image output. */
export function isRasterImageInputKey(key: string): boolean {
  const k = key.toLowerCase();
  if (k === "audio_url") return false;
  if (k === "video_url") return false;
  if (k === "image_url" || k === "image_urls" || k === "start_image_url") return true;
  if (k.endsWith("_image") || k.endsWith("_images")) return true;
  if (k.includes("mask_url") || k.includes("frame")) return true;
  if (k.includes("reference") && k.includes("image")) return true;
  return false;
}

function isTextLikeInputKey(key: string): boolean {
  const k = key.toLowerCase();
  return /prompt|text|caption|instruction|system|negative|weather|description|query|input$/.test(k);
}

/** True when OpenAPI output keys suggest text-only artifacts (e.g. caption / VLM), not gallery images. */
export function isOutputPrimarilyTextual(openapiOutputKeys: string[] | undefined): boolean {
  if (!openapiOutputKeys?.length) return false;
  const hasMedia = openapiOutputKeys.some((k) => {
    const lower = k.toLowerCase();
    if (/^(images|image|video|videos|media|audio)$/i.test(k)) return true;
    if (/_url$|_urls$/i.test(lower) || /^(url|urls)$/i.test(lower)) return true;
    return false;
  });
  if (hasMedia) return false;
  return openapiOutputKeys.some((k) => /^(text|output|caption|content)$/i.test(k));
}

/**
 * Single best image target for legacy edges (fal `out` → unnamed target).
 * Uses full input schema when available (required + properties); otherwise ordered key list.
 */
export function computePrimaryImageInputKey(inputSchema: Record<string, unknown> | null | undefined): string | undefined {
  if (!inputSchema || typeof inputSchema !== "object") return undefined;
  const keys = listMappableInputKeysFromSchema(inputSchema);
  const raster = keys.filter((k) => isRasterImageInputKey(k));
  if (raster.length === 0) return undefined;
  if (raster.length === 1) return raster[0];

  const required = Array.isArray(inputSchema.required) ? (inputSchema.required as string[]) : [];
  const reqRaster = raster.filter((k) => required.includes(k));
  if (reqRaster.length === 1) return reqRaster[0];

  const has = (k: string) => keys.includes(k);
  // Lip-sync / avatar: portrait image + audio — wire still image to `image_url`, not `start_image_url`.
  if (has("audio_url") && has("image_url")) return "image_url";
  // Typical image-to-video: first frame field, no audio input on the same schema.
  if (has("start_image_url") && !has("audio_url")) return "start_image_url";
  if (has("start_image_url") && has("image_url") && !has("audio_url")) return "start_image_url";

  return raster[0];
}

/** Fallback when only persisted key list is available (no full schema). */
export function inferPrimaryImageInputKeyFromKeyList(openapiInputKeys: string[] | undefined): string {
  const keys = openapiInputKeys?.length ? openapiInputKeys : [];
  const raster = keys.filter((k) => isRasterImageInputKey(k));
  if (raster.length === 0) return "image_url";
  if (raster.length === 1) return raster[0];
  if (keys.includes("audio_url") && keys.includes("image_url")) return "image_url";
  if (keys.includes("start_image_url") && !keys.includes("audio_url")) return "start_image_url";
  if (keys.includes("start_image_url") && keys.includes("image_url") && !keys.includes("audio_url")) {
    return "start_image_url";
  }
  return raster[0];
}

export function pickFirstTextInputKey(openapiInputKeys: string[] | undefined): string {
  const keys = openapiInputKeys?.length ? openapiInputKeys : [];
  const t = keys.find((k) => isTextLikeInputKey(k));
  return t ?? "prompt";
}
