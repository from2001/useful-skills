import type { Client } from "@xdevplatform/xdk";
import { parseArgs, PAGINATION, RAW } from "../lib/args.js";
import { TWEET_FIELDS, TWEET_EXPANSIONS, TWEET_USER_FIELDS, MEDIA_FIELDS, inlineMedia } from "../lib/fields.js";
import { resolveMyId } from "../lib/resolve.js";

export async function bookmark(
  client: Client,
  args: string[],
): Promise<unknown> {
  const { tweetId } = parseArgs<{ tweetId: string }>(args, {
    positional: { key: "tweetId", label: "A tweet ID" },
  });

  const myId = await resolveMyId(client);
  return client.users.createBookmark(myId, { tweetId });
}

export async function unbookmark(
  client: Client,
  args: string[],
): Promise<unknown> {
  const { tweetId } = parseArgs<{ tweetId: string }>(args, {
    positional: { key: "tweetId", label: "A tweet ID" },
  });

  const myId = await resolveMyId(client);
  return client.users.deleteBookmark(myId, tweetId);
}

export async function bookmarks(
  client: Client,
  args: string[],
): Promise<unknown> {
  const flags = parseArgs<{
    maxResults?: number;
    nextToken?: string;
    raw: boolean;
  }>(args, { flags: { ...PAGINATION, ...RAW } });

  const myId = await resolveMyId(client);

  const options: Record<string, unknown> = {
    tweetFields: TWEET_FIELDS,
    expansions: TWEET_EXPANSIONS,
    userFields: TWEET_USER_FIELDS,
    mediaFields: MEDIA_FIELDS,
    ...(flags.maxResults !== undefined && { maxResults: flags.maxResults }),
    ...(flags.nextToken !== undefined && { paginationToken: flags.nextToken }),
  };

  const response = await client.users.getBookmarks(myId, options);
  return flags.raw
    ? response
    : inlineMedia(
        (response.data ?? []) as Record<string, unknown>[],
        response.includes as Record<string, unknown> | undefined,
      );
}
