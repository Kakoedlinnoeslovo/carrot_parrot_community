"use client";

import { createWorkflowAction } from "@/app/studio/actions";
import { AnalyticsEvent, track } from "@/lib/analytics";

export function NewWorkflowForm() {
  return (
    <form action={createWorkflowAction}>
      <button
        type="submit"
        onClick={() => track(AnalyticsEvent.workflowNewIntent)}
        className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-300 ease-out hover:bg-orange-500"
      >
        New workflow
      </button>
    </form>
  );
}
