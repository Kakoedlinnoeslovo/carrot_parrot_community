/**
 * Spike: compare fal.queue.submit vs fal.stream for a hosted workflow id.
 * Run: npx tsx --env-file=.env scripts/fal-workflow-spike.ts
 * Requires FAL_KEY and network.
 */
import { fal } from "@fal-ai/client";

const endpoint = "workflows/template/weather";
const input = {
  weather: "light rain",
  image_urls: [] as string[],
};

async function main() {
  if (!process.env.FAL_KEY) {
    console.error("Set FAL_KEY in .env");
    process.exit(1);
  }
  fal.config({ credentials: process.env.FAL_KEY });

  console.log("--- fal.stream (expected for workflows) ---");
  const stream = await fal.stream(endpoint, { input });
  let n = 0;
  for await (const ev of stream) {
    n += 1;
    if (n <= 5) console.log("event", JSON.stringify(ev).slice(0, 400));
  }
  const final = await stream.done();
  console.log("done()", JSON.stringify(final).slice(0, 500));

  console.log("\n--- fal.queue.submit (may fail or differ for workflows) ---");
  try {
    const q = await fal.queue.submit(endpoint, { input: input as Record<string, unknown> });
    console.log("queued request_id", q.request_id);
  } catch (e) {
    console.log("queue.submit error (expected for some workflow endpoints):", e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
