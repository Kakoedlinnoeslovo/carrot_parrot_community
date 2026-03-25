"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemixButton({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remix() {
    setPending(true);
    const res = await fetch(`/api/workflows/${workflowId}/remix`, { method: "POST" });
    setPending(false);
    if (!res.ok) return;
    const j = (await res.json()) as { workflow?: { id: string } };
    if (j.workflow?.id) router.push(`/studio/${j.workflow.id}`);
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void remix()}
      className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
    >
      {pending ? "…" : "Remix"}
    </button>
  );
}
