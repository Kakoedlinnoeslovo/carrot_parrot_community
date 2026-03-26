import { NextResponse } from "next/server";
import { getFalModelWithOpenApi } from "@/lib/fal-platform";
import { extractQueueInputSchema } from "@/lib/fal-openapi-input";
import { extractQueueOutputSchema } from "@/lib/fal-openapi-output";
import { isFalEndpointIdAllowed } from "@/lib/fal-model-policy";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const endpointId = url.searchParams.get("endpointId")?.trim();
  if (!endpointId) {
    return NextResponse.json({ error: "Missing endpointId" }, { status: 400 });
  }

  if (!isFalEndpointIdAllowed(endpointId)) {
    return NextResponse.json({ error: "Model is not allowed by server policy" }, { status: 403 });
  }

  try {
    const row = await getFalModelWithOpenApi(endpointId);
    if (!row) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const openapi = row.openapi as Record<string, unknown> | undefined;
    const inputSchema = openapi ? extractQueueInputSchema(openapi) : null;
    const outputSchema = openapi ? extractQueueOutputSchema(openapi) : null;

    return NextResponse.json({
      endpoint_id: row.endpoint_id,
      metadata: row.metadata ?? null,
      inputSchema,
      outputSchema,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
