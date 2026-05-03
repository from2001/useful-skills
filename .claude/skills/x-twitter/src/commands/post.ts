import type { Client } from "@xdevplatform/xdk";
import { parseArgs } from "../lib/args.js";
import { resolveEnum } from "../lib/enums.js";
import { classifyMedia, uploadMedia } from "../lib/media.js";

interface PostFlags {
  text: string;
  replyTo?: string;
  quoteTweetId?: string;
  replySettings?: string;
  mediaPaths?: string[];
}

export async function post(
  client: Client,
  args: string[],
): Promise<unknown> {
  const flags = parseArgs<PostFlags>(args, {
    positional: { key: "text", label: "Post text" },
    flags: {
      "--reply-to": { key: "replyTo", type: "string" },
      "--quote": { key: "quoteTweetId", type: "string" },
      "--reply-settings": { key: "replySettings", type: "string" },
      "--media": { key: "mediaPaths", type: "string[]" },
    },
  });

  if (flags.replySettings) {
    flags.replySettings = resolveEnum("replySettings", flags.replySettings);
  }

  const body: Record<string, unknown> = { text: flags.text };

  if (flags.replyTo) {
    body.reply = { inReplyToTweetId: flags.replyTo };
  }
  if (flags.quoteTweetId) {
    body.quoteTweetId = flags.quoteTweetId;
  }
  if (flags.replySettings) {
    body.replySettings = flags.replySettings;
  }

  if (flags.mediaPaths && flags.mediaPaths.length > 0) {
    const kinds = flags.mediaPaths.map((p) => classifyMedia(p));
    const hasGifOrVideo = kinds.some((k) => k === "gif" || k === "video");
    const hasImage = kinds.some((k) => k === "image");
    if (hasGifOrVideo && (hasImage || flags.mediaPaths.length > 1)) {
      throw new Error(
        "--media: a tweet may include up to 4 images, OR exactly 1 animated GIF, OR exactly 1 video — not a mix",
      );
    }
    if (hasImage && flags.mediaPaths.length > 4) {
      throw new Error(
        `--media accepts at most 4 image paths (got ${flags.mediaPaths.length})`,
      );
    }
    const mediaIds: string[] = [];
    for (const path of flags.mediaPaths) {
      mediaIds.push(await uploadMedia(client, path));
    }
    body.media = { mediaIds };
  }

  return client.posts.create(body);
}
