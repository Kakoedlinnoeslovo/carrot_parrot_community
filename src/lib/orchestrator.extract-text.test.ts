import { describe, expect, it } from "vitest";
import { extractTextFromFalData } from "./orchestrator";

describe("extractTextFromFalData", () => {
  it("reads openrouter/router/vision style { output, usage }", () => {
    const caption = "A tiger close-up with FLUX text.";
    expect(
      extractTextFromFalData({
        output: caption,
        usage: { total_tokens: 10 },
      }),
    ).toBe(caption);
  });

  it("reads top-level text", () => {
    expect(extractTextFromFalData({ text: "  hello  " })).toBe("hello");
  });

  it("unwraps nested data.output", () => {
    expect(
      extractTextFromFalData({
        data: { output: "nested caption" },
      }),
    ).toBe("nested caption");
  });

  it("reads OpenAI-style choices[0].message.content", () => {
    expect(
      extractTextFromFalData({
        choices: [{ message: { content: "from chat completion" } }],
      }),
    ).toBe("from chat completion");
  });

  it("returns undefined for empty output", () => {
    expect(extractTextFromFalData({ output: "   " })).toBeUndefined();
    expect(extractTextFromFalData(null)).toBeUndefined();
    expect(extractTextFromFalData({})).toBeUndefined();
  });
});
