import { NextResponse } from "next/server";
import { listFalModels } from "@/lib/fal-platform";
import { isFalEndpointIdAllowed } from "@/lib/fal-model-policy";

/** Back-compat: thin proxy to fal Platform API (prefer GET /api/fal/models). */
export async function GET() {
  try {
    const data = await listFalModels({ limit: 50, status: "active" }, process.env.FAL_KEY);
    const allowed = data.models.filter((m) => isFalEndpointIdAllowed(m.endpoint_id));
    return NextResponse.json({
      models: allowed.map((m) => ({
        id: m.endpoint_id,
        label: m.metadata?.display_name ?? m.endpoint_id.replace(/^fal-ai\//, ""),
        kind: m.metadata?.category ?? "unknown",
      })),
      next_cursor: data.next_cursor ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, models: [] }, { status: 502 });
  }
}
