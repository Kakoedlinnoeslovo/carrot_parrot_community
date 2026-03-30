import { describe, expect, it } from "vitest";
import {
  computePrimaryImageInputKey,
  inferPrimaryImageInputKeyFromKeyList,
  isOutputPrimarilyTextual,
} from "@/lib/fal-openapi-wiring";

describe("computePrimaryImageInputKey", () => {
  it("prefers image_url when audio_url is present (avatar / lip-sync)", () => {
    const schema = {
      type: "object",
      properties: {
        prompt: { type: "string" },
        image_url: { type: "string" },
        audio_url: { type: "string" },
        start_image_url: { type: "string" },
      },
      required: ["image_url", "audio_url"],
    };
    expect(computePrimaryImageInputKey(schema)).toBe("image_url");
  });

  it("prefers start_image_url for image-to-video without audio input", () => {
    const schema = {
      type: "object",
      properties: {
        prompt: { type: "string" },
        start_image_url: { type: "string" },
        duration: { type: "string" },
      },
      required: ["prompt", "start_image_url"],
    };
    expect(computePrimaryImageInputKey(schema)).toBe("start_image_url");
  });
});

describe("inferPrimaryImageInputKeyFromKeyList", () => {
  it("defaults to image_url when no schema snapshot exists", () => {
    expect(inferPrimaryImageInputKeyFromKeyList(undefined)).toBe("image_url");
  });
});

describe("isOutputPrimarilyTextual", () => {
  it("detects caption-style output", () => {
    expect(isOutputPrimarilyTextual(["output", "usage"])).toBe(true);
  });

  it("rejects image galleries", () => {
    expect(isOutputPrimarilyTextual(["images", "seed"])).toBe(false);
  });
});
