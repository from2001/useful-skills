import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mockClient } from "./helpers/mock-client.js";
import { _resetMyIdCache } from "../lib/resolve.js";
import { inlineMedia, MEDIA_FIELDS, TWEET_EXPANSIONS } from "../lib/fields.js";
import { get } from "../commands/get.js";
import { search } from "../commands/search.js";
import { timeline } from "../commands/timeline.js";
import { mentions } from "../commands/mentions.js";
import { quotes } from "../commands/quotes.js";
import { bookmarks } from "../commands/bookmark.js";
import { thread } from "../commands/thread.js";

// The @xdevplatform/xdk SDK camelCases all snake_case API response fields,
// so production payloads use `mediaKey` / `mediaKeys`. The fixtures below
// match that real shape. A separate test covers snake_case fallback for
// raw API payloads or future SDK changes.

describe("inlineMedia", () => {
  it("returns tweets unchanged when includes has no media", () => {
    const tweets = [{ id: "1", text: "no media" }];
    assert.deepEqual(inlineMedia(tweets, undefined), tweets);
    assert.deepEqual(inlineMedia(tweets, {}), tweets);
    assert.deepEqual(inlineMedia(tweets, { media: [] }), tweets);
  });

  it("returns tweet unchanged when it has no attachments", () => {
    const tweets = [{ id: "1", text: "plain text" }];
    const includes = {
      media: [{ mediaKey: "abc", type: "photo", url: "https://example.com/img.jpg" }],
    };
    const result = inlineMedia(tweets, includes);
    assert.deepEqual(result, tweets);
  });

  it("inlines media objects into tweet attachments (camelCase SDK shape)", () => {
    const mediaObj = { mediaKey: "abc", type: "photo", url: "https://example.com/img.jpg" };
    const tweets = [
      {
        id: "1",
        text: "has image",
        attachments: { mediaKeys: ["abc"] },
      },
    ];
    const includes = { media: [mediaObj] };
    const [result] = inlineMedia(tweets, includes);

    const attachments = result.attachments as Record<string, unknown>;
    assert.deepEqual(attachments.mediaKeys, ["abc"]);
    const media = attachments.media as unknown[];
    assert.equal(media?.length, 1);
    assert.deepEqual(media?.[0], mediaObj);
  });

  it("falls back to snake_case keys for raw API payloads", () => {
    const mediaObj = { media_key: "abc", type: "photo", url: "https://example.com/img.jpg" };
    const tweets = [{ id: "1", text: "has image", attachments: { media_keys: ["abc"] } }];
    const [result] = inlineMedia(tweets, { media: [mediaObj] });
    const media = (result.attachments as Record<string, unknown>)?.media as unknown[];
    assert.deepEqual(media, [mediaObj]);
  });

  it("inlines multiple media keys preserving tweet order", () => {
    const m1 = { mediaKey: "k1", type: "photo", url: "https://example.com/1.jpg" };
    const m2 = { mediaKey: "k2", type: "photo", url: "https://example.com/2.jpg" };
    const tweets = [{ id: "1", text: "two images", attachments: { mediaKeys: ["k1", "k2"] } }];
    const includes = { media: [m2, m1] }; // includes order is reversed
    const [result] = inlineMedia(tweets, includes);

    const media = (result.attachments as Record<string, unknown>)?.media as unknown[];
    assert.equal(media.length, 2);
    assert.deepEqual(media[0], m1); // tweet's mediaKeys order wins
    assert.deepEqual(media[1], m2);
  });

  it("handles multiple tweets with different media", () => {
    const m1 = { mediaKey: "k1", type: "photo", url: "https://example.com/1.jpg" };
    const m2 = { mediaKey: "k2", type: "photo", url: "https://example.com/2.jpg" };
    const tweets = [
      { id: "1", text: "one", attachments: { mediaKeys: ["k1"] } },
      { id: "2", text: "no media" },
      { id: "3", text: "two", attachments: { mediaKeys: ["k2"] } },
    ];
    const includes = { media: [m1, m2] };
    const result = inlineMedia(tweets, includes);

    const t1media = (result[0].attachments as Record<string, unknown>)?.media as unknown[];
    assert.deepEqual(t1media, [m1]);
    assert.deepEqual(result[1], { id: "2", text: "no media" });
    const t3media = (result[2].attachments as Record<string, unknown>)?.media as unknown[];
    assert.deepEqual(t3media, [m2]);
  });

  it("skips unknown media keys gracefully", () => {
    const tweets = [{ id: "1", text: "x", attachments: { mediaKeys: ["missing-key"] } }];
    const includes = { media: [{ mediaKey: "other", type: "photo", url: "https://example.com/x.jpg" }] };
    const [result] = inlineMedia(tweets, includes);
    assert.deepEqual(result, tweets[0]);
  });

  it("skips media entries with non-string keys instead of throwing", () => {
    const valid = { mediaKey: "ok", type: "photo", url: "https://example.com/ok.jpg" };
    const broken = { type: "photo", url: "https://example.com/broken.jpg" }; // no key at all
    const tweets = [{ id: "1", text: "x", attachments: { mediaKeys: ["ok"] } }];
    const [result] = inlineMedia(tweets, { media: [broken, valid] });
    const media = (result.attachments as Record<string, unknown>)?.media as unknown[];
    assert.deepEqual(media, [valid]);
  });
});

describe("media fields in API calls", () => {
  beforeEach(() => {
    _resetMyIdCache();
  });

  it("get: passes mediaFields to getById", async () => {
    const getById = mock.fn(async () => ({ data: { id: "1", text: "hi" } }));
    const client = mockClient({ posts: { getById } });

    await get(client, ["1"]);
    const opts = getById.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.deepEqual(opts.mediaFields, MEDIA_FIELDS);
    assert.ok((opts.expansions as string[]).includes("attachments.media_keys"));
  });

  it("get: inlines media in non-raw single result", async () => {
    const mediaObj = { mediaKey: "mk1", type: "photo", url: "https://pbs.twimg.com/img.jpg" };
    const getById = mock.fn(async () => ({
      data: { id: "1", text: "img post", attachments: { mediaKeys: ["mk1"] } },
      includes: { media: [mediaObj] },
    }));
    const client = mockClient({ posts: { getById } });

    const result = await get(client, ["1"]) as Record<string, unknown>;
    const media = (result.attachments as Record<string, unknown>)?.media as unknown[];
    assert.ok(Array.isArray(media), "media should be inlined");
    assert.deepEqual(media[0], mediaObj);
  });

  it("get: inlines media in non-raw multiple results", async () => {
    const mediaObj = { mediaKey: "mk2", type: "photo", url: "https://pbs.twimg.com/img2.jpg" };
    const getByIds = mock.fn(async () => ({
      data: [
        { id: "1", text: "post with media", attachments: { mediaKeys: ["mk2"] } },
        { id: "2", text: "plain post" },
      ],
      includes: { media: [mediaObj] },
    }));
    const client = mockClient({ posts: { getByIds } });

    const result = await get(client, ["1,2"]) as Record<string, unknown>[];
    const t1media = (result[0].attachments as Record<string, unknown>)?.media as unknown[];
    assert.deepEqual(t1media, [mediaObj]);
    assert.equal(result[1].attachments, undefined);
  });

  it("search: passes mediaFields", async () => {
    const searchRecent = mock.fn(async () => ({ data: [] }));
    const client = mockClient({ posts: { searchRecent } });

    await search(client, ["cats"]);
    const opts = searchRecent.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.deepEqual(opts.mediaFields, MEDIA_FIELDS);
    assert.ok((opts.expansions as string[]).includes("attachments.media_keys"));
  });

  it("search: inlines media in results", async () => {
    const mediaObj = { mediaKey: "sm1", type: "photo", url: "https://pbs.twimg.com/s.jpg" };
    const searchRecent = mock.fn(async () => ({
      data: [{ id: "1", text: "search hit", attachments: { mediaKeys: ["sm1"] } }],
      includes: { media: [mediaObj] },
    }));
    const client = mockClient({ posts: { searchRecent } });

    const result = await search(client, ["cats"]) as Record<string, unknown>[];
    const media = (result[0].attachments as Record<string, unknown>)?.media as unknown[];
    assert.deepEqual(media, [mediaObj]);
  });

  it("timeline: passes mediaFields", async () => {
    const getTimeline = mock.fn(async () => ({ data: [] }));
    const getMe = mock.fn(async () => ({ data: { id: "me1" } }));
    const client = mockClient({ users: { getTimeline, getMe } });

    await timeline(client, []);
    const opts = getTimeline.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.deepEqual(opts.mediaFields, MEDIA_FIELDS);
  });

  it("mentions: passes mediaFields", async () => {
    const getMentions = mock.fn(async () => ({ data: [] }));
    const getMe = mock.fn(async () => ({ data: { id: "me1" } }));
    const client = mockClient({ users: { getMentions, getMe } });

    await mentions(client, []);
    const opts = getMentions.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.deepEqual(opts.mediaFields, MEDIA_FIELDS);
  });

  it("quotes: passes mediaFields", async () => {
    const getQuoted = mock.fn(async () => ({ data: [] }));
    const client = mockClient({ posts: { getQuoted } });

    await quotes(client, ["1"]);
    const opts = getQuoted.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.deepEqual(opts.mediaFields, MEDIA_FIELDS);
  });

  it("bookmarks: passes mediaFields", async () => {
    const getBookmarks = mock.fn(async () => ({ data: [] }));
    const getMe = mock.fn(async () => ({ data: { id: "me1" } }));
    const client = mockClient({ users: { getBookmarks, getMe } });

    await bookmarks(client, []);
    const opts = getBookmarks.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.deepEqual(opts.mediaFields, MEDIA_FIELDS);
  });

  it("thread: passes mediaFields, aggregates includes.media across calls, dedups by mediaKey", async () => {
    // Seed fetch returns one media object that also appears in a later page —
    // exercising the dedup path.
    const sharedMedia = { mediaKey: "shared", type: "photo", url: "https://pbs.twimg.com/shared.jpg" };
    const replyMedia = { mediaKey: "reply", type: "photo", url: "https://pbs.twimg.com/reply.jpg" };

    const getById = mock.fn(async () => ({
      data: {
        id: "200",
        text: "seed",
        conversation_id: "100",
        created_at: "2024-06-02T00:00:00Z",
        attachments: { mediaKeys: ["shared"] },
      },
      includes: { media: [sharedMedia] },
    }));

    const searchRecent = mock.fn(async () => ({
      data: [
        {
          id: "100",
          text: "root",
          conversation_id: "100",
          created_at: "2024-06-01T00:00:00Z",
        },
        {
          id: "200",
          text: "seed",
          conversation_id: "100",
          created_at: "2024-06-02T00:00:00Z",
          attachments: { mediaKeys: ["shared"] },
        },
        {
          id: "300",
          text: "reply",
          conversation_id: "100",
          created_at: "2024-06-03T00:00:00Z",
          attachments: { mediaKeys: ["reply"] },
        },
      ],
      // Duplicate of sharedMedia plus a new replyMedia; thread must dedup.
      includes: { media: [sharedMedia, replyMedia] },
      meta: {},
    }));

    const client = mockClient({ posts: { getById, searchRecent } });

    const result = (await thread(client, ["200"])) as Record<string, unknown>[];

    const seedOpts = getById.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.deepEqual(seedOpts.mediaFields, MEDIA_FIELDS, "seed call should pass mediaFields");
    const searchOpts = searchRecent.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.deepEqual(searchOpts.mediaFields, MEDIA_FIELDS, "search call should pass mediaFields");

    assert.equal(result.length, 3);
    const seed = result.find((t) => t.id === "200") as Record<string, unknown>;
    const reply = result.find((t) => t.id === "300") as Record<string, unknown>;
    const seedMedia = (seed.attachments as Record<string, unknown>).media as unknown[];
    const replyInlined = (reply.attachments as Record<string, unknown>).media as unknown[];
    assert.deepEqual(seedMedia, [sharedMedia]);
    assert.deepEqual(replyInlined, [replyMedia]);
  });

  it("TWEET_EXPANSIONS includes attachments.media_keys", () => {
    assert.ok(TWEET_EXPANSIONS.includes("attachments.media_keys"));
  });
});
