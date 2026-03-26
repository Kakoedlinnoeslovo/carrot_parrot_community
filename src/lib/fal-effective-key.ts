import { prisma } from "@/lib/db";
import { decryptFalKey } from "@/lib/fal-key-crypto";
import type { WorkflowGraph } from "@/lib/workflow-graph";

export function graphNeedsFalKey(graph: WorkflowGraph): boolean {
  return graph.nodes.some((n) => n.type === "fal_model");
}

/**
 * User's stored key, else server `FAL_KEY`. Returns null if neither is available.
 */
export async function resolveEffectiveFalApiKey(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { falKeyEnc: true },
  });
  if (user?.falKeyEnc) {
    try {
      return decryptFalKey(user.falKeyEnc).trim() || null;
    } catch {
      return null;
    }
  }
  const env = process.env.FAL_KEY?.trim();
  return env || null;
}

export async function userHasStoredFalKey(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { falKeyEnc: true },
  });
  return Boolean(user?.falKeyEnc);
}

/**
 * Effective key exists: user key or operator `FAL_KEY`.
 */
export async function hasEffectiveFalApiKey(userId: string): Promise<boolean> {
  const k = await resolveEffectiveFalApiKey(userId);
  return k != null && k.length > 0;
}
