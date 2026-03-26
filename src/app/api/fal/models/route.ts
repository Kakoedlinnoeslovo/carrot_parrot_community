import { NextResponse } from "next/server";
import { listFalModels } from "@/lib/fal-platform";
import { isFalEndpointIdAllowed } from "@/lib/fal-model-policy";

type CacheEntry = { at: number; data: Awaited<ReturnType<typeof listFalModels>> };
const memoryCache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function cacheKey(params: URLSearchParams): string {
  return [
    params.get("q") ?? "",
    params.get("cursor") ?? "",
    params.get("category") ?? "",
    params.get("status") ?? "",
    params.get("limit") ?? "",
  ].join("|");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 24));
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const status = url.searchParams.get("status") as "active" | "deprecated" | undefined;

  const key = cacheKey(url.searchParams);
  const now = Date.now();
  const hit = memoryCache.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return NextResponse.json(hit.data);
  }

  try {
    const data = await listFalModels({
      limit,
      cursor,
      q,
      category,
      status: status === "deprecated" ? "deprecated" : status === "active" ? "active" : undefined,
    });
    const filtered = {
      ...data,
      models: data.models.filter((m) => isFalEndpointIdAllowed(m.endpoint_id)),
    };
    memoryCache.set(key, { at: now, data: filtered });
    return NextResponse.json(filtered);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
