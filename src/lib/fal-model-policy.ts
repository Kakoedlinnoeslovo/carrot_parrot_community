/**
 * Server-side guardrails (optional). Exact endpoint_id match or prefix `group/` match.
 * To allow fal hosted workflows, include a prefix such as `workflows/` or `workflows/template`
 * in FAL_MODEL_ALLOWLIST when that env is set.
 */

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isFalEndpointIdAllowed(endpointId: string): boolean {
  const deny = parseList(process.env.FAL_MODEL_DENYLIST);
  for (const d of deny) {
    if (endpointId === d || endpointId.startsWith(`${d}/`)) {
      return false;
    }
  }

  const allow = parseList(process.env.FAL_MODEL_ALLOWLIST);
  if (allow.length === 0) {
    return true;
  }
  return allow.some((a) => endpointId === a || endpointId.startsWith(`${a}/`));
}
