import { getInstagramConfig, InstagramConfigurationError } from "@/lib/instagram/config";
import { runInstagramCommentAutomation } from "@/lib/instagram/automation";
import {
  verifyMetaSignature,
  verifyWebhookToken,
} from "@/lib/instagram/signature";

export const maxDuration = 30;

const MAX_WEBHOOK_BYTES = 1_000_000;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();

  if (
    mode !== "subscribe" ||
    !challenge ||
    !expectedToken ||
    !verifyWebhookToken(token, expectedToken)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return json({ error: "content-type-must-be-application-json" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return json({ error: "payload-too-large" }, 413);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return json({ error: "payload-too-large" }, 413);
  }

  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!appSecret) {
    console.error("[instagram] INSTAGRAM_APP_SECRET is not configured");
    return json({ error: "webhook-not-configured" }, 503);
  }

  if (
    !verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      appSecret,
    )
  ) {
    return json({ error: "invalid-signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid-json" }, 400);
  }

  try {
    const summary = await runInstagramCommentAutomation(
      getInstagramConfig(),
      payload,
    );

    if (summary.hasTransientFailure) {
      return json(
        {
          error: "temporary-processing-failure",
          received: summary.received,
          sent: summary.sent,
          skipped: summary.skipped,
          failed: summary.failed,
        },
        503,
      );
    }

    return json({
      ok: true,
      received: summary.received,
      sent: summary.sent,
      skipped: summary.skipped,
      failed: summary.failed,
    });
  } catch (error) {
    if (error instanceof InstagramConfigurationError) {
      console.error("[instagram] Webhook configuration is incomplete", {
        missingKeys: error.missingKeys,
      });
      return json(
        { error: "webhook-not-configured", missing: error.missingKeys },
        503,
      );
    }

    console.error("[instagram] Unexpected webhook failure", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return json({ error: "internal-error" }, 500);
  }
}
