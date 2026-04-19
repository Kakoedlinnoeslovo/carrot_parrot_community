/**
 * Browser-side helper for uploading a file to fal.ai storage via our proxy
 * route at `/api/fal/storage/upload`.
 *
 * The route normally answers with JSON `{ url } | { error }`, but a request
 * may be intercepted by the host platform / reverse proxy before it reaches
 * the route — most commonly with a plain-text 413 "Request Entity Too Large"
 * when the upload exceeds the platform's body size limit. Calling
 * `await res.json()` on such responses raises `Unexpected token 'R',
 * "Request En"... is not valid JSON`, which is what users see.
 *
 * This helper reads the response as text first, attempts to parse it as
 * JSON, and otherwise surfaces the raw status + body so the UI shows a
 * meaningful message instead of a JSON parser error.
 */
export async function parseUploadResponse(res: Response): Promise<string> {
  const raw = await res.text();
  let parsed: { url?: unknown; error?: unknown } | null = null;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw) as { url?: unknown; error?: unknown };
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    if (parsed && typeof parsed.error === "string" && parsed.error.length > 0) {
      throw new Error(parsed.error);
    }
    if (res.status === 413) {
      throw new Error(
        "File is too large for the upload endpoint (HTTP 413). Try a smaller file or a hosted URL.",
      );
    }
    const snippet = raw.trim().slice(0, 200);
    throw new Error(
      snippet.length > 0
        ? `Upload failed (HTTP ${res.status}): ${snippet}`
        : `Upload failed (HTTP ${res.status} ${res.statusText || "error"}).`,
    );
  }

  if (!parsed || typeof parsed.url !== "string" || parsed.url.length === 0) {
    throw new Error("Upload did not return a URL.");
  }
  return parsed.url;
}

/** Upload a single file to fal.ai storage and return its public URL. */
export async function uploadFileToFalStorage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/fal/storage/upload", {
    method: "POST",
    body: fd,
  });
  return parseUploadResponse(res);
}
