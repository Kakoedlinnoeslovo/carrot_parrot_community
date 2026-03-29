import { describe, expect, it } from "vitest";
import { ValidationError } from "@fal-ai/client";
import { formatFalClientError, isTransientFalNetworkError } from "./fal-client";

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

  it("includes undici/network cause and hint when message is fetch failed", () => {
    const inner = new Error("getaddrinfo ENOTFOUND queue.fal.run");
    const e = new TypeError("fetch failed", { cause: inner });
    const s = formatFalClientError(e);
    expect(s).toContain("fetch failed");
    expect(s).toContain("cause:");
    expect(s).toContain("ENOTFOUND");
    expect(s).toContain("queue.fal.run");
    expect(s).toContain("Server could not reach fal.ai");
  });

  it("formats AggregateError cause", () => {
    const e = new TypeError("fetch failed", {
      cause: new AggregateError([new Error("first"), new Error("second")]),
    });
    const s = formatFalClientError(e);
    expect(s).toContain("first");
    expect(s).toContain("second");
  });
});

describe("isTransientFalNetworkError", () => {
  it("returns true for fetch failed", () => {
    expect(isTransientFalNetworkError(new TypeError("fetch failed"))).toBe(true);
  });

  it("returns true when cause has transient code", () => {
    const err = new Error("upstream");
    Object.assign(err, { code: "ECONNRESET" });
    expect(isTransientFalNetworkError(err)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isTransientFalNetworkError(new Error("validation"))).toBe(false);
  });
});
