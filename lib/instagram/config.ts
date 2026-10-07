export type InstagramLoginType = "instagram" | "facebook";
export type UnknownFollowerPolicy = "skip" | "send";

export type InstagramConfig = {
  appSecret: string;
  verifyToken: string;
  accessToken: string;
  accountId: string;
  apiVersion: string;
  graphBaseUrl: string;
  loginType: InstagramLoginType;
  triggerKeywords: string[];
  dmTemplate: string;
  targetUrl: string;
  requireFollower: boolean;
  unknownFollowerPolicy: UnknownFollowerPolicy;
  redis?: {
    url: string;
    token: string;
  };
};

const REQUIRED_ENV_KEYS = [
  "INSTAGRAM_APP_SECRET",
  "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_ACCOUNT_ID",
  "INSTAGRAM_API_VERSION",
] as const;

const DEFAULT_DM_TEMPLATE =
  "요청하신 채용공고 정보입니다.\n아래에서 확인해 주세요.\n\n{{url}}";
const DEFAULT_TARGET_URL = "https://gongbueong.career.co.kr/";

export class InstagramConfigurationError extends Error {
  constructor(public readonly missingKeys: string[]) {
    super(`Missing Instagram configuration: ${missingKeys.join(", ")}`);
    this.name = "InstagramConfigurationError";
  }
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

export function getInstagramConfigurationStatus() {
  const configuredKeys = REQUIRED_ENV_KEYS.filter(
    (key) => Boolean(process.env[key]?.trim()),
  );
  const missingKeys = REQUIRED_ENV_KEYS.filter(
    (key) => !process.env[key]?.trim(),
  );

  return {
    ready: missingKeys.length === 0,
    configuredCount: configuredKeys.length,
    requiredCount: REQUIRED_ENV_KEYS.length,
    missingKeys,
    hasAppId: Boolean(process.env.INSTAGRAM_APP_ID?.trim()),
    hasDurableIdempotency: Boolean(
      process.env.UPSTASH_REDIS_REST_URL?.trim() &&
        process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
    ),
  };
}

export function getInstagramConfig(): InstagramConfig {
  const status = getInstagramConfigurationStatus();
  if (!status.ready) {
    throw new InstagramConfigurationError(status.missingKeys);
  }

  const loginType: InstagramLoginType =
    process.env.INSTAGRAM_LOGIN_TYPE?.trim().toLowerCase() === "facebook"
      ? "facebook"
      : "instagram";

  const unknownFollowerPolicy: UnknownFollowerPolicy =
    process.env.INSTAGRAM_UNKNOWN_FOLLOWER_POLICY?.trim().toLowerCase() ===
    "send"
      ? "send"
      : "skip";

  const apiVersion = process.env.INSTAGRAM_API_VERSION!.trim();
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error(
      "INSTAGRAM_API_VERSION must look like v25.0 (including the leading v).",
    );
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  return {
    appSecret: process.env.INSTAGRAM_APP_SECRET!.trim(),
    verifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN!.trim(),
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN!.trim(),
    accountId: process.env.INSTAGRAM_ACCOUNT_ID!.trim(),
    apiVersion,
    graphBaseUrl:
      loginType === "instagram"
        ? "https://graph.instagram.com"
        : "https://graph.facebook.com",
    loginType,
    triggerKeywords: (process.env.INSTAGRAM_TRIGGER_KEYWORDS ?? "")
      .split(",")
      .map((keyword) => keyword.trim().toLocaleLowerCase())
      .filter(Boolean),
    dmTemplate:
      process.env.INSTAGRAM_DM_TEMPLATE?.trim() || DEFAULT_DM_TEMPLATE,
    targetUrl:
      process.env.INSTAGRAM_TARGET_URL?.trim() || DEFAULT_TARGET_URL,
    requireFollower: readBoolean(
      process.env.INSTAGRAM_REQUIRE_FOLLOWER,
      false,
    ),
    unknownFollowerPolicy,
    redis:
      redisUrl && redisToken ? { url: redisUrl, token: redisToken } : undefined,
  };
}
