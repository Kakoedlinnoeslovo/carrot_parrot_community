import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseWorkflowGraph } from "@/lib/workflow-graph";
import { WorkflowEditor } from "@/components/workflow-editor";

type PageProps = { params: Promise<{ workflowId: string }> };

export default async function StudioWorkflowPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { workflowId } = await params;
  const wf = await prisma.workflow.findFirst({
    where: { id: workflowId, userId: session.user.id },
  });
  if (!wf) notFound();

  let graph;
  try {
    graph = parseWorkflowGraph(wf.graphJson);
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col">
      <WorkflowEditor
        workflowId={wf.id}
        initialGraph={graph}
        title={wf.title ?? "Untitled workflow"}
        visibility={wf.visibility}
        slug={wf.slug}
      />
    </div>
  );
}
