import { ApiError, createFalClient, fal, ValidationError, type FalClient } from "@fal-ai/client";

/** Doc index and links: `src/lib/fal-docs-reference.ts` */

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

/** Isolated client for a specific API key (BYOK). Prefer this over the global `fal` in request/code paths. */
export function createFalClientFromApiKey(apiKey: string): FalClient {
  return createFalClient({ credentials: apiKey.trim() });
}

/**
 * fal `queue.submit` / `queue.result` throw `ValidationError` on 422 with a Pydantic-style `body.detail`,
 * but `error.message` is often just "Unprocessable Entity". Surface field errors for the UI / DB.
 */
export function formatFalClientError(e: unknown): string {
  if (e instanceof ValidationError) {
    const parts = e.fieldErrors.map((err) => {
      const path = err.loc?.length ? err.loc.join(".") : "body";
      return `${path}: ${err.msg}`;
    });
    if (parts.length) return parts.join("; ");
    const d = e.body?.detail;
    if (typeof d === "string") return d;
    if (d != null) return JSON.stringify(d);
  }
  if (e instanceof ApiError) {
    const bits: string[] = [e.message];
    if (e.requestId) bits.push(`requestId=${e.requestId}`);
    if (e.body && typeof e.body === "object") {
      try {
        const s = JSON.stringify(e.body);
        if (s !== "{}") bits.push(s);
      } catch {
        /* ignore */
      }
    }
    return bits.join(" ");
  }
  return e instanceof Error ? e.message : String(e);
}

export { fal };
export type { FalClient };
