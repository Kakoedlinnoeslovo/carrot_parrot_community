import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { FalClient } from "@/lib/fal-client";

const falMockCtx = vi.hoisted(() => {
  const submit = vi.fn();
  const subscribeToStatus = vi.fn();
  const result = vi.fn();
  const mockFal = {
    queue: { submit, subscribeToStatus, result },
  };
  return { submit, subscribeToStatus, result, mockFal };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    run: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    runStep: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/fal-client", () => ({
  fal: falMockCtx.mockFal,
  createFalClientFromApiKey: () => falMockCtx.mockFal,
  formatFalClientError: (e: unknown) => String(e),
}));

vi.mock("@/lib/fal-hosted-workflow", () => ({
  isFalHostedWorkflowEndpoint: () => false,
  runFalHostedWorkflowStream: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { DEFAULT_WORKFLOW_GRAPH } from "@/lib/default-graph";
import { mergeFalInput, sanitizeFalInput, type MergeArtifact } from "@/lib/fal-merge-input";
import { parseWorkflowGraph } from "@/lib/workflow-graph";
import { loadReuseReferenceStepsByNodeId, scheduleReadyFalSteps } from "@/lib/orchestrator";

describe("loadReuseReferenceStepsByNodeId", () => {
  it("returns null when skipStepReuse is true", async () => {
    vi.mocked(prisma.run.findUnique).mockResolvedValue({
      id: "r1",
      skipStepReuse: true,
      reuseReferenceRunId: null,
      workflowId: "w1",
      userId: "u1",
    } as Awaited<ReturnType<typeof prisma.run.findUnique>>);

    const m = await loadReuseReferenceStepsByNodeId("r1");
    expect(m).toBeNull();
  });

  it("loads steps from latest succeeded run when no explicit reference", async () => {
    vi.mocked(prisma.run.findUnique).mockResolvedValue({
      id: "r-new",
      skipStepReuse: false,
      reuseReferenceRunId: null,
      workflowId: "w1",
      userId: "u1",
    } as Awaited<ReturnType<typeof prisma.run.findUnique>>);

    vi.mocked(prisma.run.findFirst).mockResolvedValue({
      id: "r-prev",
    } as Awaited<ReturnType<typeof prisma.run.findFirst>>);

    const prevStep = {
      nodeId: "g1",
      status: "succeeded",
      inputsJson: "{}",
      outputsJson: "{}",
    };
    vi.mocked(prisma.runStep.findMany).mockResolvedValue([prevStep] as Awaited<
      ReturnType<typeof prisma.runStep.findMany>
    >);

    const m = await loadReuseReferenceStepsByNodeId("r-new");
    expect(m).toEqual({ g1: prevStep });
    expect(prisma.run.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workflowId: "w1",
          status: "succeeded",
          id: { not: "r-new" },
        }),
      }),
    );
  });
});

describe("scheduleReadyFalSteps reuse", () => {
  const graph = parseWorkflowGraph(JSON.stringify(DEFAULT_WORKFLOW_GRAPH));
  const inNode = graph.nodes.find((n) => n.type === "input_prompt")!;
  const falNode = graph.nodes.find((n) => n.type === "fal_model")!;

  const merged = sanitizeFalInput(
    mergeFalInput(falNode, graph, {
      [inNode.id]: { text: inNode.data.prompt ?? "", images: [] } as MergeArtifact,
    }),
  );
  const matchingInputsJson = JSON.stringify({
    falModelId: falNode.data.falModelId,
    falInput: merged,
  });

  const prevG1Step = {
    id: "ps-g1",
    runId: "prev-run",
    nodeId: "g1",
    status: "succeeded",
    inputsJson: matchingInputsJson,
    outputsJson: JSON.stringify({
      text: undefined,
      images: ["https://cdn.example.com/out.png"],
      media: [{ url: "https://cdn.example.com/out.png", kind: "image" as const }],
    }),
    falRequestId: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /** Mutable run-new steps so reload after reuse sees succeeded g1 (avoids infinite reuse loop). */
  function buildInitialNewSteps() {
    return [
      {
        id: "s-in",
        runId: "run-new",
        nodeId: "in1",
        status: "succeeded",
        inputsJson: "{}",
        outputsJson: JSON.stringify({ text: inNode.data.prompt, images: [] }),
        falRequestId: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "s-g1",
        runId: "run-new",
        nodeId: "g1",
        status: "pending",
        inputsJson: null,
        outputsJson: null,
        falRequestId: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }

  beforeEach(() => {
    process.env.FAL_KEY = "test";
    vi.clearAllMocks();

    vi.mocked(prisma.run.findUnique).mockImplementation(
      (async (args: { where?: { id?: string } }) => {
        if (args.where?.id === "run-new") {
          return {
            id: "run-new",
            skipStepReuse: false,
            reuseReferenceRunId: null,
            workflowId: "w1",
            userId: "u1",
          };
        }
        return null;
        // Prisma client return type is a thenable; tests only need plain objects.
      }) as typeof prisma.run.findUnique,
    );

    vi.mocked(prisma.run.findFirst).mockResolvedValue({
      id: "prev-run",
    } as Awaited<ReturnType<typeof prisma.run.findFirst>>);

    vi.mocked(prisma.run.update).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.run.update>>);
    vi.mocked(prisma.runStep.findFirst).mockResolvedValue({
      status: "succeeded",
    } as Awaited<ReturnType<typeof prisma.runStep.findFirst>>);
  });

  afterEach(() => {
    delete process.env.FAL_KEY;
  });

  it("does not call fal.queue.submit when inputs match a previous succeeded step", async () => {
    const newSteps = buildInitialNewSteps();
    vi.mocked(prisma.runStep.findMany).mockImplementation(
      (async (args: { where?: { runId?: string } }) => {
        if (args.where?.runId === "prev-run") return [prevG1Step];
        if (args.where?.runId === "run-new") return newSteps;
        return [];
      }) as typeof prisma.runStep.findMany,
    );

    vi.mocked(prisma.runStep.update).mockImplementation(
      (async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = newSteps.find((s) => s.id === where.id);
        if (row && data && typeof data === "object") {
          Object.assign(row, data);
        }
        return row!;
      }) as typeof prisma.runStep.update,
    );

    await scheduleReadyFalSteps("run-new", graph, falMockCtx.mockFal as unknown as FalClient);

    expect(falMockCtx.submit).not.toHaveBeenCalled();
    expect(prisma.runStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s-g1" },
        data: expect.objectContaining({
          status: "succeeded",
          outputsJson: prevG1Step.outputsJson,
        }),
      }),
    );
  });

  it("calls fal.queue.submit when previous inputs differ", async () => {
    const prevMismatch = {
      ...prevG1Step,
      inputsJson: JSON.stringify({
        falModelId: falNode.data.falModelId,
        falInput: { ...merged, prompt: "different prompt" },
      }),
    };

    const newSteps = buildInitialNewSteps();
    vi.mocked(prisma.runStep.findMany).mockImplementation(
      (async (args: { where?: { runId?: string } }) => {
        if (args.where?.runId === "prev-run") return [prevMismatch];
        if (args.where?.runId === "run-new") return newSteps;
        return [];
      }) as typeof prisma.runStep.findMany,
    );

    vi.mocked(prisma.runStep.update).mockImplementation(
      (async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = newSteps.find((s) => s.id === where.id);
        if (row && data && typeof data === "object") {
          Object.assign(row, data);
        }
        return row!;
      }) as typeof prisma.runStep.update,
    );

    vi.mocked(falMockCtx.submit).mockResolvedValue({
      request_id: "req-1",
      status: "IN_QUEUE",
      queue_position: 0,
      response_url: "",
      status_url: "",
      cancel_url: "",
    });

    await scheduleReadyFalSteps("run-new", graph, falMockCtx.mockFal as unknown as FalClient);

    expect(falMockCtx.submit).toHaveBeenCalled();
  });
});
