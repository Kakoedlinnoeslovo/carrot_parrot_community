import { describe, expect, it } from "vitest";
import {
  listMappableOutputKeysFromSchema,
  orderInputHandleKeys,
  orderOutputHandleKeys,
} from "./fal-schema-handles";

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
