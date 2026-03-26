/**
 * Deep equality for JSON-serializable values (objects, arrays, primitives, null).
 * Used to compare stored fal step inputs with a newly computed payload.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keysA = Object.keys(ao);
  const keysB = Object.keys(bo);
  if (keysA.length !== keysB.length) return false;
  const setB = new Set(keysB);
  for (const k of keysA) {
    if (!setB.has(k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

export type FalStepInputsPayload = {
  falModelId: string;
  falInput: Record<string, unknown>;
};

/**
 * True when the previous step's `inputsJson` matches the new payload (order-insensitive at object key level via deepEqual).
 */
export function falInputsJsonMatchesPrevious(
  prevInputsJson: string | null | undefined,
  nextPayload: FalStepInputsPayload,
): boolean {
  if (prevInputsJson == null || prevInputsJson === "") return false;
  let prev: unknown;
  try {
    prev = JSON.parse(prevInputsJson) as unknown;
  } catch {
    return false;
  }
  if (prev === null || typeof prev !== "object" || Array.isArray(prev)) return false;
  const o = prev as Record<string, unknown>;
  const next: Record<string, unknown> = {
    falModelId: nextPayload.falModelId,
    falInput: nextPayload.falInput,
  };
  return deepEqual(o, next);
}

export type PreviousFalStepLike = {
  status: string;
  inputsJson: string | null;
  outputsJson: string | null;
};

/**
 * Whether we can copy outputs from a previous run step instead of calling fal.
 */
export function canReuseFalStepFromPrevious(
  prev: PreviousFalStepLike | undefined,
  nextPayload: FalStepInputsPayload,
): boolean {
  if (!prev || prev.status !== "succeeded") return false;
  if (prev.outputsJson == null || prev.outputsJson === "") return false;
  return falInputsJsonMatchesPrevious(prev.inputsJson, nextPayload);
}
