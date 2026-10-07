import type { InstagramConfig } from "./config";
import {
  getInstagramProfile,
  MetaApiError,
  sendPrivateReply,
} from "./client";
import { claimComment } from "./idempotency";
import {
  isOlderThanPrivateReplyWindow,
  matchesTriggerKeywords,
  parseInstagramWebhook,
  renderDmTemplate,
  type InstagramCommentEvent,
} from "./webhook";

type OutcomeStatus = "sent" | "skipped" | "failed";

export type AutomationOutcome = {
  commentId: string;
  status: OutcomeStatus;
  reason: string;
  transient?: boolean;
};

export type AutomationSummary = {
  received: number;
  sent: number;
  skipped: number;
  failed: number;
  hasTransientFailure: boolean;
  outcomes: AutomationOutcome[];
};

function skipped(commentId: string, reason: string): AutomationOutcome {
  return { commentId, status: "skipped", reason };
}

async function processComment(
  config: InstagramConfig,
  event: InstagramCommentEvent,
): Promise<AutomationOutcome> {
  if (event.accountId !== config.accountId) {
    return skipped(event.commentId, "account-mismatch");
  }

  if (event.commenterId === config.accountId) {
    return skipped(event.commentId, "own-comment");
  }

  if (isOlderThanPrivateReplyWindow(event.timestamp)) {
    return skipped(event.commentId, "private-reply-window-expired");
  }

  if (!matchesTriggerKeywords(event.text, config.triggerKeywords)) {
    return skipped(event.commentId, "keyword-not-matched");
  }

  const claim = await claimComment(config, event.commentId);
  if (!claim.acquired) {
    return skipped(event.commentId, "duplicate-event");
  }

  try {
    if (config.requireFollower) {
      const profile = await getInstagramProfile(config, event.commenterId);
      const follows = profile.is_user_follow_business;

      if (follows === false) {
        await claim.complete("skipped:not-follower");
        return skipped(event.commentId, "not-follower");
      }

      if (follows !== true && config.unknownFollowerPolicy === "skip") {
        await claim.complete("skipped:follower-status-unknown");
        return skipped(event.commentId, "follower-status-unknown");
      }
    }

    const message = renderDmTemplate(config.dmTemplate, event, config.targetUrl);
    if (!message.trim()) {
      await claim.complete("skipped:empty-message");
      return skipped(event.commentId, "empty-message");
    }

    await sendPrivateReply(config, event.commentId, message);
    await claim.complete("sent");
    return { commentId: event.commentId, status: "sent", reason: "sent" };
  } catch (error) {
    const transient = error instanceof MetaApiError ? error.transient : true;

    if (transient) {
      await claim.release().catch(() => undefined);
    } else {
      await claim.complete("failed:permanent").catch(() => undefined);
    }

    console.error("[instagram] Comment automation failed", {
      commentId: event.commentId,
      error: error instanceof Error ? error.message : "Unknown error",
      transient,
      status: error instanceof MetaApiError ? error.status : undefined,
      code: error instanceof MetaApiError ? error.code : undefined,
      subcode: error instanceof MetaApiError ? error.subcode : undefined,
    });

    return {
      commentId: event.commentId,
      status: "failed",
      reason: error instanceof MetaApiError ? "meta-api-error" : "internal-error",
      transient,
    };
  }
}

export async function runInstagramCommentAutomation(
  config: InstagramConfig,
  payload: unknown,
): Promise<AutomationSummary> {
  const events = parseInstagramWebhook(payload);
  const outcomes: AutomationOutcome[] = [];

  // Meta는 보통 한 번에 이벤트 하나를 보내지만 순차 처리는 DM 순서를 보존하고
  // 계정 단위의 순간적인 API 호출 폭주를 줄여 줍니다.
  for (const event of events) {
    outcomes.push(await processComment(config, event));
  }

  return {
    received: events.length,
    sent: outcomes.filter((outcome) => outcome.status === "sent").length,
    skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    hasTransientFailure: outcomes.some(
      (outcome) => outcome.status === "failed" && outcome.transient,
    ),
    outcomes,
  };
}
