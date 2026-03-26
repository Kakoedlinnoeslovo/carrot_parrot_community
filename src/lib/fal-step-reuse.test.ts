import { describe, expect, it } from "vitest";
import {
  canReuseFalStepFromPrevious,
  deepEqual,
  falInputsJsonMatchesPrevious,
} from "./fal-step-reuse";

describe("deepEqual", () => {
  it("compares primitives and null", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("compares objects with different key order", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("compares nested structures", () => {
    expect(
      deepEqual({ falModelId: "fal-ai/x", falInput: { prompt: "hi", n: [1, 2] } }, {
        falModelId: "fal-ai/x",
        falInput: { n: [1, 2], prompt: "hi" },
      }),
    ).toBe(true);
  });
});

describe("falInputsJsonMatchesPrevious", () => {
  const payload = { falModelId: "fal-ai/flux/schnell", falInput: { prompt: "cat" } };

  it("matches equivalent JSON string", () => {
    const prev = JSON.stringify({ falInput: { prompt: "cat" }, falModelId: "fal-ai/flux/schnell" });
    expect(falInputsJsonMatchesPrevious(prev, payload)).toBe(true);
  });

  it("rejects when falInput differs", () => {
    const prev = JSON.stringify({
      falModelId: "fal-ai/flux/schnell",
      falInput: { prompt: "dog" },
    });
    expect(falInputsJsonMatchesPrevious(prev, payload)).toBe(false);
  });

  it("rejects invalid json", () => {
    expect(falInputsJsonMatchesPrevious("{", payload)).toBe(false);
  });
});

describe("canReuseFalStepFromPrevious", () => {
  const payload = { falModelId: "m", falInput: {} };

  it("allows reuse when succeeded and inputs match", () => {
    expect(
      canReuseFalStepFromPrevious(
        {
          status: "succeeded",
          inputsJson: JSON.stringify(payload),
          outputsJson: '{"images":[]}',
        },
        payload,
      ),
    ).toBe(true);
  });

  it("denies when status is not succeeded", () => {
    expect(
      canReuseFalStepFromPrevious(
        {
          status: "pending",
          inputsJson: JSON.stringify(payload),
          outputsJson: "{}",
        },
        payload,
      ),
    ).toBe(false);
  });

  it("denies when outputsJson empty", () => {
    expect(
      canReuseFalStepFromPrevious(
        {
          status: "succeeded",
          inputsJson: JSON.stringify(payload),
          outputsJson: "",
        },
        payload,
      ),
    ).toBe(false);
  });
});
