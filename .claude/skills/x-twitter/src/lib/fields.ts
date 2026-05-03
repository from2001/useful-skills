export const TWEET_FIELDS = [
  "article",
  "attachments",
  "author_id",
  "created_at",
  "conversation_id",
  "public_metrics",
  "referenced_tweets",
  "in_reply_to_user_id",
  "text",
];

export const TWEET_EXPANSIONS = ["author_id", "attachments.media_keys"];
export const TWEET_USER_FIELDS = ["name", "username"];

export const MEDIA_FIELDS = [
  "url",
  "preview_image_url",
  "type",
  "width",
  "height",
  "alt_text",
];

// The @xdevplatform/xdk SDK camelCases all snake_case response fields
// (e.g. `media_key` -> `mediaKey`, `media_keys` -> `mediaKeys`). We also
// accept the snake_case form as a fallback so that raw API payloads or
// future SDK changes still work.
function getMediaKey(m: Record<string, unknown>): string | undefined {
  const k = m.mediaKey ?? m.media_key;
  return typeof k === "string" ? k : undefined;
}

function getMediaKeys(attachments: Record<string, unknown>): string[] | undefined {
  const keys = attachments.mediaKeys ?? attachments.media_keys;
  return Array.isArray(keys) ? (keys as string[]) : undefined;
}

export function inlineMedia(
  tweets: Record<string, unknown>[],
  includes?: Record<string, unknown>,
): Record<string, unknown>[] {
  const mediaArr = (includes?.media as Record<string, unknown>[] | undefined) ?? [];
  if (mediaArr.length === 0) return tweets;

  const mediaMap = new Map<string, Record<string, unknown>>();
  for (const m of mediaArr) {
    const key = getMediaKey(m);
    if (key) mediaMap.set(key, m);
  }
  if (mediaMap.size === 0) return tweets;

  return tweets.map((tweet) => {
    const attachments = tweet.attachments as Record<string, unknown> | undefined;
    if (!attachments) return tweet;
    const keys = getMediaKeys(attachments);
    if (!keys?.length) return tweet;
    const media = keys
      .map((k) => mediaMap.get(k))
      .filter(Boolean) as Record<string, unknown>[];
    if (media.length === 0) return tweet;
    return { ...tweet, attachments: { ...attachments, media } };
  });
}

export const USER_FIELDS = [
  "created_at",
  "description",
  "id",
  "name",
  "profile_image_url",
  "public_metrics",
  "username",
  "verified_type",
];

export const USER_FIELDS_EXTENDED = [
  ...USER_FIELDS,
  "connection_status",
  "location",
  "protected",
  "receives_your_dm",
  "url",
];

export const COMMUNITY_FIELDS = [
  "access",
  "created_at",
  "description",
  "id",
  "join_policy",
  "member_count",
  "name",
];

export const NEWS_FIELDS = [
  "category",
  "cluster_posts_results",
  "contexts",
  "disclaimer",
  "hook",
  "keywords",
  "name",
  "summary",
  "updated_at",
];
