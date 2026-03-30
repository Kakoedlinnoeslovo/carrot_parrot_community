import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/fal-key-crypto", () => ({
  decryptFalKey: vi.fn(() => "decrypted-user-key"),
}));

import { prisma } from "@/lib/db";
import { decryptFalKey } from "@/lib/fal-key-crypto";
import { graphNeedsFalKey, resolveEffectiveFalApiKey } from "@/lib/fal-effective-key";
import { parseWorkflowGraph } from "@/lib/workflow-graph";

describe("fal-effective-key", () => {
  const prevFal = process.env.FAL_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FAL_KEY;
  });

  afterEach(() => {
    process.env.FAL_KEY = prevFal;
  });

  it("returns decrypted user key when falKeyEnc is set", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      falKeyEnc: "blob",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    await expect(resolveEffectiveFalApiKey("u1")).resolves.toBe("decrypted-user-key");
    expect(decryptFalKey).toHaveBeenCalledWith("blob");
  });

  it("falls back to FAL_KEY when user has no stored key", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      falKeyEnc: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    process.env.FAL_KEY = "  env-fal  ";
    await expect(resolveEffectiveFalApiKey("u1")).resolves.toBe("env-fal");
  });

  it("returns null when neither user nor env key exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      falKeyEnc: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    await expect(resolveEffectiveFalApiKey("u1")).resolves.toBeNull();
  });
});

describe("graphNeedsFalKey", () => {
  it("is true when a fal_model node exists", () => {
    const g = parseWorkflowGraph(
      JSON.stringify({
        nodes: [
          { id: "a", type: "input_prompt", position: { x: 0, y: 0 }, data: { prompt: "x" } },
          {
            id: "b",
            type: "fal_model",
            position: { x: 0, y: 0 },
            data: { falModelId: "fal-ai/x", falInput: {} },
          },
        ],
        edges: [],
      }),
    );
    expect(graphNeedsFalKey(g)).toBe(true);
  });

  it("is false when no fal_model", () => {
    const g = parseWorkflowGraph(
      JSON.stringify({
        nodes: [{ id: "a", type: "input_prompt", position: { x: 0, y: 0 }, data: { prompt: "x" } }],
        edges: [],
      }),
    );
    expect(graphNeedsFalKey(g)).toBe(false);
  });
});
