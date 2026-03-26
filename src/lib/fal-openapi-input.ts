/**
 * Fal queue OpenAPI docs expose POST on `/{endpoint_path}` with
 * `requestBody.content.application/json.schema` pointing at `*Input` in components.schemas.
 */

export function resolveJsonPointer(root: Record<string, unknown>, pointer: string): unknown {
  if (!pointer.startsWith("#/")) {
    return undefined;
  }
  const parts = pointer.slice(2).split("/");
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function deepResolveRefs(schema: unknown, root: Record<string, unknown>): unknown {
  if (schema === null || typeof schema !== "object") {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map((item) => deepResolveRefs(item, root));
  }
  const s = schema as Record<string, unknown>;
  if (typeof s.$ref === "string") {
    const target = resolveJsonPointer(root, s.$ref);
    if (target === undefined) {
      return schema;
    }
    return deepResolveRefs(target, root);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = deepResolveRefs(v, root);
  }
  return out;
}

function postRequestBodyJsonSchema(pathItem: Record<string, unknown>): Record<string, unknown> | null {
  const post = pathItem.post as Record<string, unknown> | undefined;
  if (!post) return null;
  const rb = post.requestBody as
    | {
        content?: { "application/json"?: { schema?: unknown } };
      }
    | undefined;
  const schema = rb?.content?.["application/json"]?.schema;
  if (!schema || typeof schema !== "object") return null;
  return schema as Record<string, unknown>;
}

function schemaRefName(ref: string): string | null {
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) return null;
  return ref.slice(prefix.length) || null;
}

/**
 * Pick POST /... that submits queue input (schema $ref name contains "Input").
 */
export function extractQueueInputSchema(openapi: Record<string, unknown>): Record<string, unknown> | null {
  const paths = openapi.paths;
  if (!paths || typeof paths !== "object") return null;

  let best: { schema: Record<string, unknown>; score: number } | null = null;

  for (const pathItem of Object.values(paths as Record<string, Record<string, unknown>>)) {
    const schema = postRequestBodyJsonSchema(pathItem);
    if (!schema) continue;
    const ref = typeof schema.$ref === "string" ? schema.$ref : null;
    const name = ref ? schemaRefName(ref) : null;
    const score = name?.includes("Input") ? 2 : ref ? 1 : 0;
    if (!best || score > best.score) {
      best = { schema, score };
    }
  }

  if (!best) return null;

  const resolved = deepResolveRefs(best.schema, openapi);
  if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) {
    return resolved as Record<string, unknown>;
  }
  return null;
}

/** Same POST path item used for extractQueueInputSchema (first path with a scored POST body schema). */
export function findBestQueuePostPathItem(openapi: Record<string, unknown>): Record<string, unknown> | null {
  const paths = openapi.paths;
  if (!paths || typeof paths !== "object") return null;

  let best: { pathItem: Record<string, unknown>; score: number } | null = null;

  for (const pathItem of Object.values(paths as Record<string, Record<string, unknown>>)) {
    const post = pathItem.post as Record<string, unknown> | undefined;
    if (!post) continue;
    const rb = post.requestBody as
      | { content?: { "application/json"?: { schema?: unknown } } }
      | undefined;
    const schema = rb?.content?.["application/json"]?.schema;
    if (!schema || typeof schema !== "object") continue;
    const ref = typeof (schema as { $ref?: string }).$ref === "string" ? (schema as { $ref: string }).$ref : null;
    const name = ref ? schemaRefName(ref) : null;
    const score = name?.includes("Input") ? 2 : ref ? 1 : 0;
    if (!best || score > best.score) {
      best = { pathItem, score };
    }
  }

  return best?.pathItem ?? null;
}
