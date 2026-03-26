/**
 * Extract queue result JSON Schema from fal OpenAPI (response 200 application/json), if present.
 * Uses the same POST path as {@link extractQueueInputSchema} when possible.
 */

import { deepResolveRefs, findBestQueuePostPathItem } from "./fal-openapi-input";

function postResponseJsonSchema(pathItem: Record<string, unknown>): Record<string, unknown> | null {
  const post = pathItem.post as Record<string, unknown> | undefined;
  if (!post) return null;
  const responses = post.responses as Record<string, unknown> | undefined;
  if (!responses || typeof responses !== "object") return null;
  const ok = (responses["200"] ?? responses["201"] ?? responses["202"]) as
    | {
        content?: { "application/json"?: { schema?: unknown } };
      }
    | undefined;
  const schema = ok?.content?.["application/json"]?.schema;
  if (!schema || typeof schema !== "object") return null;
  return schema as Record<string, unknown>;
}

/**
 * Best-effort: same POST path as queue submit, 200 JSON body schema, resolved.
 * Often missing or minimal in generated OpenAPI; callers should fall back to heuristic handles.
 */
export function extractQueueOutputSchema(openapi: Record<string, unknown>): Record<string, unknown> | null {
  const pathItem = findBestQueuePostPathItem(openapi);
  if (!pathItem) return null;
  const schema = postResponseJsonSchema(pathItem);
  if (!schema) return null;

  const resolved = deepResolveRefs(schema, openapi);
  if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) {
    return resolved as Record<string, unknown>;
  }
  return null;
}
