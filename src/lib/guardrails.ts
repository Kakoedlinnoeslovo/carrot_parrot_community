import { prisma } from "@/lib/db";
import { getAllowedEmails, getEnvInt } from "@/lib/env";
import type { WorkflowGraph } from "@/lib/workflow-graph";

const maxNodes = () => getEnvInt("MAX_NODES_PER_GRAPH", 64);
const maxRunsDay = () => getEnvInt("MAX_RUNS_PER_USER_PER_DAY", 50);
const maxConcurrent = () => getEnvInt("MAX_CONCURRENT_RUNS_PER_USER", 3);

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function assertCanRunWorkflow(userId: string, email: string, graph: WorkflowGraph) {
  const allowed = getAllowedEmails();
  if (allowed && !allowed.has(email.toLowerCase())) {
    throw new Error("This beta is invite-only for runs.");
  }

  const nodeLimit = maxNodes();
  if (graph.nodes.length > nodeLimit) {
    throw new Error(`Graph exceeds max nodes (${nodeLimit}).`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found.");

  const day = todayUtc();
  let daily = user.dailyRunCount;
  if (user.lastRunDay !== day) {
    daily = 0;
  }

  const runsPerDay = maxRunsDay();
  if (daily >= runsPerDay) {
    throw new Error(`Daily run limit reached (${runsPerDay}). Try tomorrow.`);
  }

  const concurrent = await prisma.run.count({
    where: {
      userId,
      status: { in: ["pending", "running"] },
    },
  });

  const maxConcurrentRuns = maxConcurrent();
  if (concurrent >= maxConcurrentRuns) {
    throw new Error(`Too many concurrent runs (max ${maxConcurrentRuns}).`);
  }
}

export async function bumpDailyRunCount(userId: string) {
  const day = todayUtc();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const base = user.lastRunDay === day ? user.dailyRunCount : 0;
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastRunDay: day,
      dailyRunCount: base + 1,
    },
  });
}
