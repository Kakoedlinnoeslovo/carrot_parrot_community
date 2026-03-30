import { describe, expect, it } from "vitest";

import { marketingVideoAnalysisSchema, parseMarketingVideoAnalysis } from "@/lib/marketing-video-analyzer";

describe("marketingVideoAnalysisSchema", () => {
  it("accepts a valid analysis payload", () => {
    const raw = {
      durationSec: 12.5,
      segments: [
        { start: 0, end: 6 },
        { start: 6, end: 12.5 },
      ],
      segmentationMethod: "optical_flow" as const,
      speechText: "hello",
      ocrText: "SALE",
      speechFromLocalAsr: true,
      textFromLocalOcr: true,
    };
    const p = parseMarketingVideoAnalysis(raw);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.data.durationSec).toBe(12.5);
      expect(p.data.segments).toHaveLength(2);
    }
  });

  it("rejects invalid segmentationMethod", () => {
    const p = parseMarketingVideoAnalysis({
      durationSec: 1,
      segments: [],
      segmentationMethod: "invalid",
      speechText: "",
      ocrText: "",
      speechFromLocalAsr: false,
      textFromLocalOcr: false,
    });
    expect(p.ok).toBe(false);
  });

  it("rejects missing fields", () => {
    const p = parseMarketingVideoAnalysis({ durationSec: 1 });
    expect(p.ok).toBe(false);
  });

  it("schema parse matches round-trip", () => {
    const v = marketingVideoAnalysisSchema.parse({
      durationSec: 3,
      segments: [{ start: 0, end: 3 }],
      segmentationMethod: "equal",
      speechText: "",
      ocrText: "",
      speechFromLocalAsr: false,
      textFromLocalOcr: false,
    });
    expect(v.segmentationMethod).toBe("equal");
  });
});
