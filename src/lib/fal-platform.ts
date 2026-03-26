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

function platformHeaders(): HeadersInit {
  const headers = new Headers({ Accept: "application/json" });
  const key = process.env.FAL_KEY;
  if (key) {
    headers.set("Authorization", `Key ${key}`);
  }
  return headers;
}

export async function falPlatformFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `${FAL_PLATFORM_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  const base = platformHeaders() as Headers;
  base.forEach((v, k) => headers.set(k, v));
  return fetch(url, { ...init, headers });
}

export async function listFalModels(params: {
  limit?: number;
  cursor?: string;
  q?: string;
  category?: string;
  status?: "active" | "deprecated";
}): Promise<FalModelsListResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.status) search.set("status", params.status);

  const res = await falPlatformFetch(`/models?${search.toString()}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`fal platform list models failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json() as Promise<FalModelsListResponse>;
}

/** Single model with OpenAPI (expand=openapi-3.0). */
export async function getFalModelWithOpenApi(endpointId: string): Promise<FalModelListItem | null> {
  const search = new URLSearchParams();
  search.append("endpoint_id", endpointId);
  search.append("expand", "openapi-3.0");

  const res = await falPlatformFetch(`/models?${search.toString()}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`fal platform model detail failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as FalModelsListResponse;
  return data.models?.[0] ?? null;
}
