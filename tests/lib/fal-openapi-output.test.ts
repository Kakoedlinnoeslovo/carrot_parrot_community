import { describe, expect, it } from "vitest";
import { extractQueueOutputSchema } from "@/lib/fal-openapi-output";

const fixtureWithOutput = {
  openapi: "3.0.4",
  paths: {
    "/fal-ai/flux/schnell": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FluxSchnellInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FluxSchnellOutput" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      FluxSchnellInput: {
        type: "object",
        properties: { prompt: { type: "string" } },
      },
      FluxSchnellOutput: {
        type: "object",
        properties: {
          images: { type: "array", items: { type: "object" } },
          seed: { type: "integer" },
        },
      },
    },
  },
} as Record<string, unknown>;

describe("extractQueueOutputSchema", () => {
  it("resolves output schema from same POST path 200 response", () => {
    const schema = extractQueueOutputSchema(fixtureWithOutput);
    expect(schema).not.toBeNull();
    expect((schema?.properties as Record<string, unknown>)?.images).toBeDefined();
    expect((schema?.properties as Record<string, unknown>)?.seed).toBeDefined();
  });
});
