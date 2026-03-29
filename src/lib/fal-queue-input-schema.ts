import { getFalModelWithOpenApi } from "@/lib/fal-platform";
import { extractQueueInputSchema } from "@/lib/fal-openapi-input";
import { isFalEndpointIdAllowed } from "@/lib/fal-model-policy";

const cache = new Map<string, Record<string, unknown> | null>();

/** For tests only — avoid cross-test pollution. */
export function clearQueueInputSchemaCache(): void {
  cache.clear();
}

/**
 * Resolved queue body JSON Schema for an endpoint (cached in memory per process).
 */
export async function getQueueInputSchemaForEndpoint(
  endpointId: string,
  falApiKey: string,
): Promise<Record<string, unknown> | null> {
  const id = endpointId.trim();
  if (!id || !isFalEndpointIdAllowed(id)) return null;
  if (cache.has(id)) return cache.get(id)!;

  try {
    const row = await getFalModelWithOpenApi(id, falApiKey);
    const openapi = row?.openapi as Record<string, unknown> | undefined;
    const input = openapi ? extractQueueInputSchema(openapi) : null;
    cache.set(id, input);
    return input;
  } catch {
    cache.set(id, null);
    return null;
  }
}
