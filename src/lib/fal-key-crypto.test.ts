import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptFalKey, encryptFalKey } from "./fal-key-crypto";

describe("fal-key-crypto", () => {
  const prev = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-at-least-16chars";
  });

  afterEach(() => {
    process.env.AUTH_SECRET = prev;
  });

  it("roundtrips a fal API key", () => {
    const plain = "abcd1234:key-material";
    const enc = encryptFalKey(plain);
    expect(enc).not.toContain(plain);
    expect(decryptFalKey(enc)).toBe(plain);
  });

  it("produces distinct ciphertext for same plaintext (random IV)", () => {
    const plain = "same";
    expect(encryptFalKey(plain)).not.toBe(encryptFalKey(plain));
  });
});
