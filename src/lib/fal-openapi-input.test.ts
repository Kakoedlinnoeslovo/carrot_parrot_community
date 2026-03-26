import { describe, expect, it } from "vitest";
import { extractQueueInputSchema, resolveJsonPointer } from "./fal-openapi-input";

const fluxSchnellFixture = {
  openapi: "3.0.4",
  paths: {
    "/fal-ai/flux/schnell": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FluxSchnellInput" },
            },
          },
        },
        responses: { "200": { description: "ok" } },
      },
    },
  },
  components: {
    schemas: {
      FluxSchnellInput: {
        type: "object",
        title: "SchnellTextToImageInput",
        properties: {
          prompt: { type: "string" },
          num_images: { type: "integer", default: 1 },
        },
        required: ["prompt"],
      },
    },
  },
} as Record<string, unknown>;

describe("extractQueueInputSchema", () => {
  it("resolves FluxSchnellInput from fixture", () => {
    const schema = extractQueueInputSchema(fluxSchnellFixture);
    expect(schema).not.toBeNull();
    expect(schema?.type).toBe("object");
    expect(schema?.properties).toBeDefined();
    expect((schema?.properties as Record<string, unknown>).prompt).toBeDefined();
  });

  it("resolveJsonPointer finds nested schema", () => {
    const x = resolveJsonPointer(fluxSchnellFixture, "#/components/schemas/FluxSchnellInput");
    expect(x && typeof x === "object" && (x as { type?: string }).type).toBe("object");
  });
});
