import type { Client } from "@xdevplatform/xdk";
import { parseArgs, PAGINATION, RAW } from "../lib/args.js";
import { TWEET_FIELDS, TWEET_EXPANSIONS, TWEET_USER_FIELDS, MEDIA_FIELDS, inlineMedia } from "../lib/fields.js";

export async function quotes(client: Client, args: string[]): Promise<unknown> {
  const flags = parseArgs<{
    tweetId: string;
    maxResults?: number;
    nextToken?: string;
    raw: boolean;
  }>(args, {
    positional: { key: "tweetId", label: "A tweet ID" },
    flags: { ...PAGINATION, ...RAW },
  });

  const options: Record<string, unknown> = {
    tweetFields: TWEET_FIELDS,
    expansions: TWEET_EXPANSIONS,
    userFields: TWEET_USER_FIELDS,
    mediaFields: MEDIA_FIELDS,
    ...(flags.maxResults !== undefined && { maxResults: flags.maxResults }),
    ...(flags.nextToken !== undefined && { paginationToken: flags.nextToken }),
  };

  const response = await client.posts.getQuoted(flags.tweetId, options);
  return flags.raw
    ? response
    : inlineMedia(
        (response.data ?? []) as Record<string, unknown>[],
        response.includes as Record<string, unknown> | undefined,
      );
}
