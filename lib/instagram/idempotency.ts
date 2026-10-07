import type { InstagramConfig } from "./config";

type MemoryRecord = { expiresAt: number; status: string };

const globalStore = globalThis as typeof globalThis & {
  __instagramCommentClaims?: Map<string, MemoryRecord>;
};

const memoryStore =
  globalStore.__instagramCommentClaims ?? new Map<string, MemoryRecord>();
globalStore.__instagramCommentClaims = memoryStore;

const PROCESSING_TTL_SECONDS = 10 * 60;
const COMPLETED_TTL_SECONDS = 8 * 24 * 60 * 60;

async function redisCommand(
  redis: NonNullable<InstagramConfig["redis"]>,
  command: (string | number)[],
) {
  const response = await fetch(redis.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redis.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(3_000),
  });

  if (!response.ok) {
    throw new Error(`Redis idempotency request failed (${response.status})`);
  }

  return (await response.json()) as { result: unknown };
}

function cleanupExpiredMemoryRecords(now: number) {
  for (const [key, record] of memoryStore) {
    if (record.expiresAt <= now) memoryStore.delete(key);
  }
}

function claimInMemory(key: string) {
  const now = Date.now();
  cleanupExpiredMemoryRecords(now);
  if (memoryStore.has(key)) return false;

  memoryStore.set(key, {
    status: "processing",
    expiresAt: now + PROCESSING_TTL_SECONDS * 1000,
  });
  return true;
}

export type CommentClaim = {
  acquired: boolean;
  backend: "redis" | "memory";
  complete: (status: string) => Promise<void>;
  release: () => Promise<void>;
};

export async function claimComment(
  config: InstagramConfig,
  commentId: string,
): Promise<CommentClaim> {
  const key = `instagram:comment:${commentId}`;

  if (config.redis) {
    try {
      const claimed = await redisCommand(config.redis, [
        "SET",
        key,
        "processing",
        "NX",
        "EX",
        PROCESSING_TTL_SECONDS,
      ]);

      return {
        acquired: claimed.result === "OK",
        backend: "redis",
        complete: async (status) => {
          await redisCommand(config.redis!, [
            "SET",
            key,
            status,
            "EX",
            COMPLETED_TTL_SECONDS,
          ]);
        },
        release: async () => {
          await redisCommand(config.redis!, ["DEL", key]);
        },
      };
    } catch (error) {
      console.error("[instagram] Redis unavailable; using process memory", {
        message: error instanceof Error ? error.message : "Unknown Redis error",
      });
    }
  }

  const acquired = claimInMemory(key);
  return {
    acquired,
    backend: "memory",
    complete: async (status) => {
      memoryStore.set(key, {
        status,
        expiresAt: Date.now() + COMPLETED_TTL_SECONDS * 1000,
      });
    },
    release: async () => {
      memoryStore.delete(key);
    },
  };
}
