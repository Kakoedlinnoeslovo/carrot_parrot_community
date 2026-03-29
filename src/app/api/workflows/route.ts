import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_WORKFLOW_GRAPH } from "@/lib/default-graph";
import { assertAcyclic, workflowGraphSchema } from "@/lib/workflow-graph";
import { buildReplicateWorkflowFromVideoUrl } from "@/lib/replicate-marketing-template";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflows = await prisma.workflow.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      visibility: true,
      slug: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ workflows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let graphJson: string;
  let title = "Untitled workflow";

  const rawBody = await req.json().catch(() => null);
  if (
    rawBody &&
    typeof rawBody === "object" &&
    !Array.isArray(rawBody) &&
    (rawBody as { template?: string }).template === "replicate-marketing-ad"
  ) {
    const videoUrl = String((rawBody as { videoUrl?: string }).videoUrl ?? "").trim();
    if (!/^https?:\/\//i.test(videoUrl)) {
      return NextResponse.json({ error: "videoUrl must be a valid http(s) URL" }, { status: 400 });
    }
    try {
      const graph = buildReplicateWorkflowFromVideoUrl(videoUrl);
      graphJson = JSON.stringify(graph);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const t = (rawBody as { title?: string }).title;
    if (typeof t === "string" && t.trim()) {
      title = t.trim().slice(0, 200);
    } else {
      title = "Marketing ad replica";
    }
  } else {
    graphJson = JSON.stringify(DEFAULT_WORKFLOW_GRAPH);
  }

  const parsed = workflowGraphSchema.safeParse(JSON.parse(graphJson));
  if (!parsed.success) {
    return NextResponse.json({ error: "Graph invalid" }, { status: 500 });
  }
  assertAcyclic(parsed.data);

  const wf = await prisma.workflow.create({
    data: {
      userId: session.user.id,
      title,
      graphJson,
      visibility: "private",
    },
  });

  return NextResponse.json({ workflow: wf });
}
