import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError } from "@fal-ai/client";
import type { FalClient } from "@fal-ai/client";
import { pollFalUntilComplete } from "@/lib/orchestrator";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    runStep: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    run: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    workflow: { update: vi.fn() },
  },
}));

vi.mock("@/lib/fal-effective-key", () => ({
  resolveEffectiveFalApiKey: vi.fn().mockResolvedValue(null),
}));

describe("pollFalUntilComplete", () => {
  const queueResult = vi.fn();
  const mockFal = {
    queue: {
      result: queueResult,
    },
  } as unknown as FalClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queueResult.mockReset();

    vi.mocked(prisma.runStep.findFirst).mockResolvedValue({
      id: "step-1",
      runId: "run-1",
      status: "running",
      nodeId: "n1",
    } as Awaited<ReturnType<typeof prisma.runStep.findFirst>>);

    vi.mocked(prisma.runStep.update).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.runStep.update>>);

    vi.mocked(prisma.run.findUnique).mockResolvedValue({
      id: "run-1",
      status: "running",
      skipStepReuse: true,
      reuseReferenceRunId: null,
      userId: "u1",
      workflowId: "w1",
      workflow: {
        id: "w1",
        graphJson: JSON.stringify({ nodes: [], edges: [] }),
      },
    } as Awaited<ReturnType<typeof prisma.run.findUnique>>);

    vi.mocked(prisma.run.findFirst).mockResolvedValue({
      status: "running",
    } as Awaited<ReturnType<typeof prisma.run.findFirst>>);

    vi.mocked(prisma.runStep.findMany).mockResolvedValue([]);
  });

  it("retries queue.result on 404 then stores openrouter/router/vision style output", async () => {
    queueResult
      .mockRejectedValueOnce(new ApiError({ message: "Not ready", status: 404, body: {} }))
      .mockRejectedValueOnce(new ApiError({ message: "Not ready", status: 404, body: {} }))
      .mockResolvedValueOnce({
        data: {
          output: "### Subjects\nA woman.",
          usage: { total_tokens: 10 },
        },
        requestId: "req-1",
      });

    await pollFalUntilComplete(mockFal, "run-1", "step-1", "openrouter/router/vision", "req-1");

    expect(queueResult).toHaveBeenCalledTimes(3);

    const succeeded = vi.mocked(prisma.runStep.update).mock.calls.find((c) => {
      const d = c[0]?.data as { status?: string } | undefined;
      return d?.status === "succeeded";
    });
    expect(succeeded).toBeDefined();
    const outputsJson = (succeeded![0].data as { outputsJson: string }).outputsJson;
    expect(outputsJson).toContain("### Subjects");
    expect(outputsJson).toContain("A woman");
  });

  it("completes on first result when data is ready", async () => {
    queueResult.mockResolvedValue({
      data: { output: "done", usage: {} },
      requestId: "r",
    });

    await pollFalUntilComplete(mockFal, "run-1", "step-1", "x/y", "r");

    expect(queueResult).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.runStep.update).mock.calls.some((c) => (c[0]?.data as { status?: string })?.status === "succeeded")).toBe(true);
  });

  it("fails the step on non-retryable ApiError without hanging", async () => {
    queueResult.mockRejectedValue(new ApiError({ message: "Forbidden", status: 403, body: {} }));

    await pollFalUntilComplete(mockFal, "run-1", "step-1", "x/y", "r");

    expect(queueResult).toHaveBeenCalledTimes(1);
    const failed = vi.mocked(prisma.runStep.update).mock.calls.find((c) => {
      const d = c[0]?.data as { status?: string } | undefined;
      return d?.status === "failed";
    });
    expect(failed).toBeDefined();
  });
});
