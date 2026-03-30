import { describe, expect, it } from "vitest";
import { extractTextFromFalData } from "@/lib/orchestrator";

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

  it("reads choices message.content as array of text parts", () => {
    expect(
      extractTextFromFalData({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "Caption line one." },
                { type: "text", text: "Line two." },
              ],
            },
          },
        ],
      }),
    ).toBe("Caption line one.\nLine two.");
  });

  it("unwraps nested output object", () => {
    expect(
      extractTextFromFalData({
        output: { text: "nested in output object" },
      }),
    ).toBe("nested in output object");
  });

  it("unwraps result.data style nesting", () => {
    expect(
      extractTextFromFalData({
        result: { data: { output: "deep caption" } },
      }),
    ).toBe("deep caption");
  });

  it("ignores bare https strings as caption", () => {
    expect(extractTextFromFalData({ output: "https://cdn.example.com/x.png" })).toBeUndefined();
  });

  it("returns undefined for empty output", () => {
    expect(extractTextFromFalData({ output: "   " })).toBeUndefined();
    expect(extractTextFromFalData(null)).toBeUndefined();
    expect(extractTextFromFalData({})).toBeUndefined();
  });
});
