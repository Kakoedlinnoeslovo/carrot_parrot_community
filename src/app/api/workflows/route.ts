import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_WORKFLOW_GRAPH } from "@/lib/default-graph";
import { assertAcyclic, workflowGraphSchema } from "@/lib/workflow-graph";

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

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const graphJson = JSON.stringify(DEFAULT_WORKFLOW_GRAPH);
  const parsed = workflowGraphSchema.safeParse(JSON.parse(graphJson));
  if (!parsed.success) {
    return NextResponse.json({ error: "Default graph invalid" }, { status: 500 });
  }
  assertAcyclic(parsed.data);

  const wf = await prisma.workflow.create({
    data: {
      userId: session.user.id,
      title: "Untitled workflow",
      graphJson,
      visibility: "private",
    },
  });

  return NextResponse.json({ workflow: wf });
}
