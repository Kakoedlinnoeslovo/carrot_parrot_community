import { describe, expect, it } from "vitest";
import { ValidationError } from "@fal-ai/client";
import { formatFalClientError } from "./fal-client";

describe("formatFalClientError", () => {
  it("expands ValidationError field errors instead of only HTTP status text", () => {
    const e = new ValidationError({
      message: "Unprocessable Entity",
      status: 422,
      body: {
        detail: [
          { loc: ["body", "prompt"], msg: "field required", type: "value_error.missing" },
        ],
      },
    });
    expect(formatFalClientError(e)).toContain("prompt");
    expect(formatFalClientError(e)).toContain("field required");
  });
});
