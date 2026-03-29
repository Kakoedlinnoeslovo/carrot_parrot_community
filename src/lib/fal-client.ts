import { ApiError, createFalClient, fal, ValidationError, type FalClient } from "@fal-ai/client";

/** Doc index and links: `src/lib/fal-docs-reference.ts` */

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

/** Isolated client for a specific API key (BYOK). Prefer this over the global `fal` in request/code paths. */
export function createFalClientFromApiKey(apiKey: string): FalClient {
  return createFalClient({ credentials: apiKey.trim() });
}

const FETCH_FAILED_HINT =
  "Server could not reach fal.ai (check network, VPN, firewall).";

function formatCauseOnce(cause: unknown): string {
  if (cause == null) return "";
  if (cause instanceof AggregateError) {
    return cause.errors
      .map((err) => (err instanceof Error ? err.message : String(err)))
      .filter(Boolean)
      .join("; ");
  }
  if (cause instanceof Error) return cause.message;
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof (cause as { message: unknown }).message === "string"
  ) {
    return (cause as { message: string }).message;
  }
  try {
    return String(cause);
  } catch {
    return "";
  }
}

function appendCauseAndFetchHint(baseMessage: string, err: Error): string {
  let out = baseMessage;
  if ("cause" in err && err.cause !== undefined) {
    const c = formatCauseOnce(err.cause);
    if (c) out = `${out} (cause: ${c})`;
  }
  if (err.message === "fetch failed") {
    out = `${out}. ${FETCH_FAILED_HINT}`;
  }
  return out;
}

/**
 * True when the failure is likely transient (retry polling result/subscribe).
 */
export function isTransientFalNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  if (msg.includes("fetch failed")) return true;
  const transientCodes = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
    "ECONNREFUSED",
    "ENETUNREACH",
    "ENOTFOUND",
    "EAI_AGAIN",
  ]);
  const codeFrom = (x: unknown): string | undefined => {
    if (x && typeof x === "object" && "code" in x && typeof (x as { code: unknown }).code === "string") {
      return (x as { code: string }).code;
    }
    return undefined;
  };
  const c = codeFrom(e) ?? (e.cause ? codeFrom(e.cause) : undefined);
  if (c && transientCodes.has(c)) return true;
  return false;
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
    if (typeof d === "string") return appendCauseAndFetchHint(d, e);
    if (d != null) return JSON.stringify(d);
  }
  if (e instanceof ApiError) {
    const bits: string[] = [appendCauseAndFetchHint(e.message, e)];
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
  if (e instanceof Error) {
    return appendCauseAndFetchHint(e.message, e);
  }
  return String(e);
}

export { fal };
export type { FalClient };
