import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveEffectiveFalApiKey } from "@/lib/fal-effective-key";
import { listFalModels } from "@/lib/fal-platform";
import { isFalEndpointIdAllowed } from "@/lib/fal-model-policy";

type CacheEntry = { at: number; data: Awaited<ReturnType<typeof listFalModels>> };
const memoryCache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function cacheKey(userId: string, params: URLSearchParams): string {
  return [
    userId,
    params.get("q") ?? "",
    params.get("cursor") ?? "",
    params.get("category") ?? "",
    params.get("status") ?? "",
    params.get("limit") ?? "",
  ].join("|");
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = await resolveEffectiveFalApiKey(session.user.id);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No fal.ai API key configured. Add yours in onboarding or Settings." },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 24));
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const status = url.searchParams.get("status") as "active" | "deprecated" | undefined;

  const ck = cacheKey(session.user.id, url.searchParams);
  const now = Date.now();
  const hit = memoryCache.get(ck);
  if (hit && now - hit.at < TTL_MS) {
    return NextResponse.json(hit.data);
  }

  try {
    const data = await listFalModels(
      {
        limit,
        cursor,
        q,
        category,
        status: status === "deprecated" ? "deprecated" : status === "active" ? "active" : undefined,
      },
      apiKey,
    );
    const filtered = {
      ...data,
      models: data.models.filter((m) => isFalEndpointIdAllowed(m.endpoint_id)),
    };
    memoryCache.set(ck, { at: now, data: filtered });
    return NextResponse.json(filtered);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
