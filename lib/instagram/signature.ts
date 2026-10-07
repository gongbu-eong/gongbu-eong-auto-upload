import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyWebhookToken(received: string | null, expected: string) {
  return received !== null && safeEqual(received, expected);
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
) {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const receivedDigest = signatureHeader.slice("sha256=".length);
  if (!/^[a-f\d]{64}$/i.test(receivedDigest)) return false;

  const expectedDigest = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  return safeEqual(receivedDigest.toLowerCase(), expectedDigest);
}
