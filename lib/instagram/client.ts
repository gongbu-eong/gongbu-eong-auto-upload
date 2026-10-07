import type { InstagramConfig } from "./config";

type MetaErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class MetaApiError extends Error {
  readonly transient: boolean;

  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly subcode?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
    this.transient =
      status === 408 ||
      status === 429 ||
      status >= 500 ||
      (code !== undefined && [1, 2, 4, 17, 32, 613].includes(code));
  }
}

export type InstagramProfile = {
  id?: string;
  username?: string;
  is_user_follow_business?: boolean;
};

function graphUrl(config: InstagramConfig, path: string) {
  return `${config.graphBaseUrl}/${config.apiVersion}/${path.replace(/^\//, "")}`;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function graphRequest<T>(
  config: InstagramConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(graphUrl(config, path), {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new MetaApiError(
      error instanceof Error ? error.message : "Meta API network error",
      503,
    );
  }

  const payload = (await parseJson(response)) as MetaErrorPayload;
  if (!response.ok) {
    const metaError = payload.error;
    throw new MetaApiError(
      metaError?.message || `Meta API request failed (${response.status})`,
      response.status,
      metaError?.code,
      metaError?.error_subcode,
    );
  }

  return payload as T;
}

export async function getInstagramProfile(
  config: InstagramConfig,
  commenterId: string,
) {
  const fields = ["id", "username", "is_user_follow_business"].join(",");
  const params = new URLSearchParams({ fields });

  return graphRequest<InstagramProfile>(
    config,
    `${encodeURIComponent(commenterId)}?${params}`,
  );
}

export async function sendPrivateReply(
  config: InstagramConfig,
  commentId: string,
  text: string,
) {
  return graphRequest<{ id?: string; message_id?: string }>(
    config,
    `${encodeURIComponent(config.accountId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
      }),
    },
  );
}
