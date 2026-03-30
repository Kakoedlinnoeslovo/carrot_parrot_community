/**
 * Environment helpers — read `process.env` (Node’s dict of OS/environment variables).
 *
 * Python analogy: like `os.environ.get("FOO")`, but values are always **strings** (or
 * missing). There is no automatic `.env` loading in plain Node; Next.js loads `.env*` for you
 * at build/dev time and exposes `NEXT_PUBLIC_*` to the browser bundle.
 *
 * TypeScript types here are **compile-time only**; at runtime `process.env[name]` is still
 * `string | undefined`, like untyped `os.environ` values in Python.
 */

/**
 * Parse an integer from `process.env[name]`, or return `fallback` if unset/empty/invalid.
 * Same idea as `int(os.environ.get(name, fallback))` with extra guards for NaN.
 */
export function getEnvInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Public base URL for links and redirects (e.g. OAuth callbacks). Prefer explicit
 * `NEXT_PUBLIC_APP_URL`; on Vercel, `VERCEL_URL` is injected without `https://`.
 */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (url?.startsWith("http")) return url.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/**
 * Optional allowlist of emails (comma-separated) for operator-style guardrails.
 * Returns `null` when unset (meaning “no extra email restriction” from this helper).
 */
export function getAllowedEmails(): Set<string> | null {
  const raw = process.env.ALLOWED_RUN_EMAILS?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}
