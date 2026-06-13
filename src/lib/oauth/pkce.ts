import { createHash, timingSafeEqual } from "node:crypto";

export function pkceS256(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function verifyPkceS256(codeVerifier: string, expectedChallenge: string) {
  const actual = pkceS256(codeVerifier);
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expectedChallenge);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
