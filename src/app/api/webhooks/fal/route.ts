import { NextResponse } from "next/server";
import { handleFalWebhook } from "@/lib/orchestrator";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const stepId = url.searchParams.get("stepId");
  if (!runId || !stepId) {
    return NextResponse.json({ error: "Missing runId or stepId" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await handleFalWebhook(runId, stepId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
