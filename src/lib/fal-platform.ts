const FAL_PLATFORM_BASE = "https://api.fal.ai/v1";

export type FalModelMetadata = {
  display_name?: string;
  category?: string;
  description?: string;
  status?: string;
  thumbnail_url?: string;
  model_url?: string;
  [key: string]: unknown;
};

export type FalModelListItem = {
  endpoint_id: string;
  metadata?: FalModelMetadata;
  openapi?: Record<string, unknown>;
};

export type FalModelsListResponse = {
  models: FalModelListItem[];
  next_cursor?: string | null;
};

/**
 * @param falApiKey When set (non-empty), used for Authorization; otherwise `process.env.FAL_KEY`.
 */
export async function falPlatformFetch(path: string, init?: RequestInit, falApiKey?: string): Promise<Response> {
  const url = path.startsWith("http") ? path : `${FAL_PLATFORM_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const key =
    falApiKey != null && falApiKey.trim() !== "" ? falApiKey.trim() : process.env.FAL_KEY?.trim();
  if (key) headers.set("Authorization", `Key ${key}`);
  return fetch(url, { ...init, headers });
}

async function safeJson<T>(res: Response, label: string): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const body = await res.text();
    const hint = body.trimStart().startsWith("<!")
      ? "upstream returned an HTML page (possible CDN challenge or gateway error)"
      : body.slice(0, 120);
    throw new Error(`${label}: expected JSON but received ${ct || "unknown content-type"} — ${hint}`);
  }
  return res.json() as Promise<T>;
}

export async function listFalModels(
  params: {
    limit?: number;
    cursor?: string;
    q?: string;
    category?: string;
    status?: "active" | "deprecated";
  },
  falApiKey?: string,
): Promise<FalModelsListResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.status) search.set("status", params.status);

  const res = await falPlatformFetch(`/models?${search.toString()}`, undefined, falApiKey);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`fal platform list models failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return safeJson<FalModelsListResponse>(res, "fal platform list models");
}

/** Single model with OpenAPI (expand=openapi-3.0). */
export async function getFalModelWithOpenApi(
  endpointId: string,
  falApiKey?: string,
): Promise<FalModelListItem | null> {
  const search = new URLSearchParams();
  search.append("endpoint_id", endpointId);
  search.append("expand", "openapi-3.0");

  const res = await falPlatformFetch(`/models?${search.toString()}`, undefined, falApiKey);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`fal platform model detail failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await safeJson<FalModelsListResponse>(res, "fal platform model detail");
  return data.models?.[0] ?? null;
}

/** Cheap check that a key works against the Platform API. */
export async function validateFalApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { ok: false, status: 400, detail: "Key is empty" };
  const res = await falPlatformFetch("/models?limit=1", undefined, trimmed);
  if (res.ok) return { ok: true };
  const t = await res.text();
  return { ok: false, status: res.status, detail: t.slice(0, 300) };
}
