export type InstagramCommentEvent = {
  accountId: string;
  commentId: string;
  commenterId: string;
  username?: string;
  mediaId?: string;
  parentId?: string;
  text: string;
  timestamp?: string | number;
  isLive: boolean;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function parseInstagramWebhook(payload: unknown) {
  if (!isRecord(payload) || payload.object !== "instagram") return [];
  if (!Array.isArray(payload.entry)) return [];

  const events: InstagramCommentEvent[] = [];
  const seenCommentIds = new Set<string>();

  for (const rawEntry of payload.entry) {
    if (!isRecord(rawEntry)) continue;
    const accountId = stringValue(rawEntry.id);
    if (!accountId || !Array.isArray(rawEntry.changes)) continue;

    for (const rawChange of rawEntry.changes) {
      if (!isRecord(rawChange)) continue;
      const field = stringValue(rawChange.field);
      if (field !== "comments" && field !== "live_comments") continue;
      if (!isRecord(rawChange.value)) continue;

      const value = rawChange.value;
      const verb = stringValue(value.verb)?.toLowerCase();
      if (verb && !["add", "created", "comment_created"].includes(verb)) {
        continue;
      }

      const commentId = stringValue(value.id);
      const from = isRecord(value.from) ? value.from : undefined;
      const commenterId = from ? stringValue(from.id) : undefined;
      if (!commentId || !commenterId || seenCommentIds.has(commentId)) continue;

      seenCommentIds.add(commentId);
      events.push({
        accountId,
        commentId,
        commenterId,
        username: from ? stringValue(from.username) : undefined,
        mediaId: stringValue(value.media_id),
        parentId: stringValue(value.parent_id),
        text: stringValue(value.text) ?? "",
        timestamp:
          typeof value.timestamp === "string" ||
          typeof value.timestamp === "number"
            ? value.timestamp
            : undefined,
        isLive: field === "live_comments",
      });
    }
  }

  return events;
}

export function isOlderThanPrivateReplyWindow(
  timestamp: string | number | undefined,
  now = Date.now(),
) {
  if (timestamp === undefined) return false;

  const parsed =
    typeof timestamp === "number"
      ? timestamp < 10_000_000_000
        ? timestamp * 1000
        : timestamp
      : Date.parse(timestamp);

  if (!Number.isFinite(parsed)) return false;
  return now - parsed > 7 * 24 * 60 * 60 * 1000;
}

export function matchesTriggerKeywords(text: string, keywords: string[]) {
  if (keywords.length === 0) return true;
  const normalizedText = text.toLocaleLowerCase();
  return keywords.some((keyword) => normalizedText.includes(keyword));
}

export function renderDmTemplate(
  template: string,
  event: Pick<InstagramCommentEvent, "username" | "text">,
  targetUrl: string,
) {
  const rendered = template
    .replaceAll("{{username}}", event.username || "고객")
    .replaceAll("{{comment}}", event.text)
    .replaceAll("{{url}}", targetUrl);

  return Array.from(rendered).slice(0, 1000).join("");
}
