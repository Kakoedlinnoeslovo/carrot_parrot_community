import { describe, expect, it } from "vitest";
import {
  listMappableOutputKeysFromSchema,
  listRequiredInputKeys,
  listOptionalInputKeys,
  orderInputHandleKeys,
  orderOutputHandleKeys,
} from "@/lib/fal-schema-handles";

describe("orderInputHandleKeys", () => {
  it("places prompt before acceleration (alphabet would not)", () => {
    expect(orderInputHandleKeys(["acceleration", "prompt", "num_images"])).toEqual([
      "prompt",
      "num_images",
      "acceleration",
    ]);
  });
});

describe("orderOutputHandleKeys", () => {
  it("places images before other keys when both present", () => {
    expect(orderOutputHandleKeys(["seed", "images", "foo"])).toEqual(["images", "seed", "foo"]);
  });
});

describe("listMappableOutputKeysFromSchema", () => {
  it("drops queue submit fields so wires target real media, not response_url", () => {
    const schema = {
      type: "object",
      properties: {
        status: { type: "string" },
        request_id: { type: "string" },
        response_url: { type: "string" },
        images: { type: "array", items: { type: "object" } },
      },
    };
    expect(listMappableOutputKeysFromSchema(schema)).toEqual(["images"]);
  });
});

describe("listRequiredInputKeys", () => {
  it("returns only keys in the required array that are mappable", () => {
    const schema = {
      type: "object",
      required: ["prompt", "image_url"],
      properties: {
        prompt: { type: "string" },
        image_url: { type: "string" },
        guidance_scale: { type: "number" },
        seed: { type: "integer" },
      },
    };
    expect(listRequiredInputKeys(schema)).toEqual(["prompt", "image_url"]);
  });

  it("returns empty when no required array", () => {
    const schema = {
      type: "object",
      properties: {
        prompt: { type: "string" },
        seed: { type: "integer" },
      },
    };
    expect(listRequiredInputKeys(schema)).toEqual([]);
  });

  it("returns empty for null schema", () => {
    expect(listRequiredInputKeys(null)).toEqual([]);
  });

  it("orders keys using priority list", () => {
    const schema = {
      type: "object",
      required: ["seed", "prompt", "image_url"],
      properties: {
        seed: { type: "integer" },
        prompt: { type: "string" },
        image_url: { type: "string" },
      },
    };
    expect(listRequiredInputKeys(schema)).toEqual(["prompt", "image_url", "seed"]);
  });
});

describe("listOptionalInputKeys", () => {
  it("returns mappable keys NOT in the required array", () => {
    const schema = {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        guidance_scale: { type: "number" },
        seed: { type: "integer" },
        num_images: { type: "integer" },
      },
    };
    const optional = listOptionalInputKeys(schema);
    expect(optional).toContain("guidance_scale");
    expect(optional).toContain("seed");
    expect(optional).toContain("num_images");
    expect(optional).not.toContain("prompt");
  });

  it("returns all mappable keys when required array is empty", () => {
    const schema = {
      type: "object",
      properties: {
        prompt: { type: "string" },
        seed: { type: "integer" },
      },
    };
    expect(listOptionalInputKeys(schema)).toEqual(["prompt", "seed"]);
  });

  it("returns empty for null schema", () => {
    expect(listOptionalInputKeys(null)).toEqual([]);
  });
});
