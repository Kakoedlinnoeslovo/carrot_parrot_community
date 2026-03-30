import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resumePausedRun } from "@/lib/orchestrator";
import { z } from "zod";

type RouteCtx = { params: Promise<{ runId: string }> };

const bodySchema = z.object({
  gateTexts: z.record(z.string(), z.string()).optional(),
  graphJson: z.string().min(2).optional(),
});

/**
 * POST `/api/runs/[runId]/resume` — unblock `review_gate` steps after a paused run; optional workflow graph update.
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runId } = await ctx.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    json = {};
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    await resumePausedRun(runId, session.user.id, {
      gateTexts: parsed.data.gateTexts,
      graphJson: parsed.data.graphJson,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
