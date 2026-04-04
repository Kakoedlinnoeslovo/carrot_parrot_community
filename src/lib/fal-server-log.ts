/**
 * Structured JSON logs for fal.ai server calls — one object per line on stdout/stderr.
 * Visible in Vercel: Project → Observability → Runtime Logs.
 *
 * Do not log API keys, raw prompts, or full inputs; use inputKeys + inputByteLength only.
 */

export function isFalLogVerbose(): boolean {
  const v = process.env.FAL_LOG_VERBOSE ?? process.env.DEBUG_FAL;
  return v === "1" || v === "true";
}

export function falInputMeta(input: Record<string, unknown>): { inputKeys: string[]; inputByteLength: number } {
  let inputByteLength = 0;
  try {
    inputByteLength = Buffer.byteLength(JSON.stringify(input), "utf8");
  } catch {
    inputByteLength = 0;
  }
  return { inputKeys: Object.keys(input).sort(), inputByteLength };
}

type FalLogPrimitive = string | number | boolean | null;

export type FalLogFields = Record<string, FalLogPrimitive | undefined>;

function serialize(fields: FalLogFields & Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    source: "fal",
    ts: new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function falLogInfo(event: string, fields: FalLogFields & Record<string, unknown> = {}): void {
  console.info(JSON.stringify(serialize({ event, ...fields })));
}

export function falLogWarn(event: string, fields: FalLogFields & Record<string, unknown> = {}): void {
  console.warn(JSON.stringify(serialize({ event, ...fields })));
}

export function falLogError(event: string, fields: FalLogFields & Record<string, unknown> = {}): void {
  console.error(JSON.stringify(serialize({ event, ...fields })));
}
