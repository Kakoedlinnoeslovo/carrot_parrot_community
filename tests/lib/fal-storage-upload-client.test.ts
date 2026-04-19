import { describe, expect, it } from "vitest";
import { parseUploadResponse } from "@/lib/fal-storage-upload-client";

function makeResponse(body: string, init: { status: number; statusText?: string }): Response {
  return new Response(body, {
    status: init.status,
    statusText: init.statusText ?? "",
    headers: { "content-type": "text/plain" },
  });
}

describe("parseUploadResponse", () => {
  it("returns the URL on a successful JSON response", async () => {
    const res = makeResponse(JSON.stringify({ url: "https://example.com/x.png" }), { status: 200 });
    await expect(parseUploadResponse(res)).resolves.toBe("https://example.com/x.png");
  });

  it("throws when the JSON success body is missing the URL", async () => {
    const res = makeResponse(JSON.stringify({}), { status: 200 });
    await expect(parseUploadResponse(res)).rejects.toThrow(/did not return a URL/i);
  });

  it("uses the JSON error message when the body is structured JSON", async () => {
    const res = makeResponse(JSON.stringify({ error: "File too large (max 25MB)" }), { status: 400 });
    await expect(parseUploadResponse(res)).rejects.toThrow(/File too large \(max 25MB\)/);
  });

  it("does not throw a JSON parser error when the proxy returns plain-text 413", async () => {
    // This is the exact scenario behind "Unexpected token 'R', \"Request En\"... is not valid JSON".
    const res = makeResponse("Request Entity Too Large", {
      status: 413,
      statusText: "Payload Too Large",
    });
    await expect(parseUploadResponse(res)).rejects.toThrow(/HTTP 413/);
  });

  it("includes a body snippet when the proxy returns an HTML error page", async () => {
    const res = makeResponse("<html><body><h1>502 Bad Gateway</h1></body></html>", {
      status: 502,
      statusText: "Bad Gateway",
    });
    await expect(parseUploadResponse(res)).rejects.toThrow(/HTTP 502/);
  });

  it("falls back to status text when the body is empty", async () => {
    const res = makeResponse("", { status: 500, statusText: "Internal Server Error" });
    await expect(parseUploadResponse(res)).rejects.toThrow(/HTTP 500/);
  });
});
