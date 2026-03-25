"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_WORKFLOW_GRAPH } from "@/lib/default-graph";
import { assertAcyclic, workflowGraphSchema } from "@/lib/workflow-graph";

export async function createWorkflowAction() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const graphJson = JSON.stringify(DEFAULT_WORKFLOW_GRAPH);
  const parsed = workflowGraphSchema.parse(JSON.parse(graphJson));
  assertAcyclic(parsed);

  const wf = await prisma.workflow.create({
    data: {
      userId: session.user.id,
      title: "Untitled workflow",
      graphJson,
      visibility: "private",
    },
  });

  redirect(`/studio/${wf.id}`);
}
