/**
 * Derive React Flow handle ids from fal queue JSON Schemas (OpenAPI-resolved input/output).
 */

import type { RJSFSchema } from "@rjsf/utils";

/** Types that get a dedicated input port on fal_model nodes. */
function propertyIsMappableForInputHandle(prop: unknown): boolean {
  if (prop == null || typeof prop !== "object" || Array.isArray(prop)) return false;
  const p = prop as Record<string, unknown>;
  const t = p.type;
  if (t === "string" || t === "number" || t === "integer" || t === "boolean") return true;
  if (Array.isArray(t) && t.some((x) => ["string", "number", "integer", "boolean"].includes(String(x)))) {
    return true;
  }
  if (t === "array") return true;
  if (t === "object" && p.properties && typeof p.properties === "object") {
    return true;
  }
  const branches = [...(Array.isArray(p.anyOf) ? p.anyOf : []), ...(Array.isArray(p.oneOf) ? p.oneOf : [])];
  for (const b of branches) {
    if (propertyIsMappableForInputHandle(b)) return true;
  }
  return false;
}

/**
 * Order ports so wires match how models are documented: prompt / images first, not A–Z
 * (e.g. `acceleration` must not appear before `prompt` on Flux Schnell).
 */
const INPUT_KEY_PRIORITY = [
  "prompt",
  "negative_prompt",
  "system_prompt",
  "text",
  "input",
  "image_url",
  "image_urls",
  "model_image",
  "garment_image",
  "mask_url",
  "video_url",
  "audio_url",
  "seed",
  "category",
  "mode",
  "guidance_scale",
  "num_images",
  "num_inference_steps",
] as const;

/** Preserve schema key order for keys not in {@link INPUT_KEY_PRIORITY}. */
export function orderInputHandleKeys(keys: string[]): string[] {
  const prioritized: string[] = [];
  const set = new Set(keys);
  for (const p of INPUT_KEY_PRIORITY) {
    if (set.has(p)) prioritized.push(p);
  }
  const rest = keys.filter((k) => !prioritized.includes(k));
  return [...prioritized, ...rest];
}

/**
 * Top-level JSON Schema property keys that become target handles on fal_model nodes.
 * Skips nested-only refs without simple mapping.
 * Order: documentation-friendly (prompt/image fields first), then remaining keys in schema declaration order.
 */
export function listMappableInputKeysFromSchema(schema: RJSFSchema | Record<string, unknown> | null | undefined): string[] {
  if (!schema || typeof schema !== "object") return [];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== "object") return [];
  const keys = Object.keys(props).filter((k) => propertyIsMappableForInputHandle(props[k]));
  return orderInputHandleKeys(keys);
}

function outputPropIsMappable(prop: unknown): boolean {
  return propertyIsMappableForInputHandle(prop);
}

const OUTPUT_KEY_PRIORITY = ["images", "image", "video", "videos", "audio", "data", "output", "text", "seed"] as const;

export function orderOutputHandleKeys(keys: string[]): string[] {
  const prioritized: string[] = [];
  const set = new Set(keys);
  for (const p of OUTPUT_KEY_PRIORITY) {
    if (set.has(p)) prioritized.push(p);
  }
  const rest = keys.filter((k) => !prioritized.includes(k));
  return [...prioritized, ...rest];
}

/**
 * OpenAPI often describes the *queue submit* JSON (status, request_id, response_url), not the
 * completed result we store in run artifacts. Those keys must not be source handles — wiring them
 * would pass API/queue URLs into image_url and cause 422 from fal.
 */
export function isQueueInfraOutputKey(key: string): boolean {
  return /^(status|request_id|response_url|status_url|cancel_url|queue_position|logs|logs_url|metrics)$/.test(
    key,
  );
}

/**
 * Top-level output schema keys for source handles (when OpenAPI exposes a queue result schema).
 * Drops queue/infra fields; if nothing remains, the editor falls back to semantic handles (out, images, …).
 */
export function listMappableOutputKeysFromSchema(
  schema: RJSFSchema | Record<string, unknown> | null | undefined,
): string[] {
  if (!schema || typeof schema !== "object") return [];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== "object") return [];
  const keys = Object.keys(props)
    .filter((k) => outputPropIsMappable(props[k]))
    .filter((k) => !isQueueInfraOutputKey(k));
  return orderOutputHandleKeys(keys);
}
