import { getInstagramConfigurationStatus } from "@/lib/instagram/config";

export function GET(request: Request) {
  const status = getInstagramConfigurationStatus();
  const callbackUrl = new URL("/api/instagram/webhook", request.url).toString();

  return Response.json(
    {
      status: status.ready ? "ready" : "configuration-required",
      callbackUrl,
      configured: `${status.configuredCount}/${status.requiredCount}`,
      missing: status.missingKeys,
      followerCheck:
        process.env.INSTAGRAM_REQUIRE_FOLLOWER?.toLowerCase() === "true"
          ? "required"
          : "disabled",
      idempotency: status.hasDurableIdempotency ? "redis" : "process-memory",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
