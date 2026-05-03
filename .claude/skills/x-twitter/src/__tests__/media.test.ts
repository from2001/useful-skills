import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockClient } from "./helpers/mock-client.js";
import {
  classifyMedia,
  uploadChunked,
  uploadMedia,
} from "../lib/media.js";

const noSleep = async (_ms: number) => {};

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer;
}

function makeFakeFetch(opts: {
  status?: number;
  statusText?: string;
  responseBody?: string;
  calls?: FetchCall[];
} = {}) {
  const status = opts.status ?? 200;
  const statusText = opts.statusText ?? "OK";
  const responseBody = opts.responseBody ?? "";
  const calls = opts.calls ?? [];
  return async (url: string | URL, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | Uint8Array | string;
  }) => {
    const bodyBuf =
      init?.body instanceof Buffer
        ? init.body
        : init?.body instanceof Uint8Array
          ? Buffer.from(init.body)
          : Buffer.from(typeof init?.body === "string" ? init.body : "");
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: bodyBuf,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      text: async () => responseBody,
    };
  };
}

function clientWithOAuth1(media: Record<string, unknown>): ReturnType<typeof mockClient> {
  return mockClient({
    media,
    oauth1: {
      buildRequestHeader: async () => "OAuth oauth_consumer_key=\"k\"",
    },
    baseUrl: "https://api.x.com",
  });
}

function parseMultipartFields(body: Buffer, boundary: string): {
  segmentIndex?: string;
  mediaBytes?: Buffer;
} {
  const sep = `--${boundary}`;
  const text = body.toString("binary");
  const parts = text.split(sep).filter((p) => p && p !== "--\r\n" && p !== "--");
  const out: { segmentIndex?: string; mediaBytes?: Buffer } = {};
  for (const partRaw of parts) {
    const part = partRaw.startsWith("\r\n") ? partRaw.slice(2) : partRaw;
    const trimmed = part.endsWith("\r\n") ? part.slice(0, -2) : part;
    const headerEnd = trimmed.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headerBlock = trimmed.slice(0, headerEnd);
    const value = trimmed.slice(headerEnd + 4);
    const nameMatch = /name="([^"]+)"/.exec(headerBlock);
    if (!nameMatch) continue;
    if (nameMatch[1] === "segment_index") {
      out.segmentIndex = value;
    } else if (nameMatch[1] === "media") {
      out.mediaBytes = Buffer.from(value, "binary");
    }
  }
  return out;
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "x-media-"));
}

function writeFixture(dir: string, name: string, contents: Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

function writeSparseFixture(dir: string, name: string, size: number): string {
  const path = join(dir, name);
  const fd = openSync(path, "w");
  try {
    if (size > 0) {
      writeSync(fd, Buffer.from([0]), 0, 1, size - 1);
    }
    ftruncateSync(fd, size);
  } finally {
    closeSync(fd);
  }
  return path;
}

describe("classifyMedia", () => {
  it("returns 'image' for png/jpg/jpeg/webp", () => {
    assert.equal(classifyMedia("a.png"), "image");
    assert.equal(classifyMedia("a.jpg"), "image");
    assert.equal(classifyMedia("a.JPEG"), "image");
    assert.equal(classifyMedia("a.webp"), "image");
  });

  it("returns 'gif' for .gif", () => {
    assert.equal(classifyMedia("clip.gif"), "gif");
    assert.equal(classifyMedia("CLIP.GIF"), "gif");
  });

  it("returns 'video' for mp4/mov/webm", () => {
    assert.equal(classifyMedia("v.mp4"), "video");
    assert.equal(classifyMedia("v.MOV"), "video");
    assert.equal(classifyMedia("v.webm"), "video");
  });

  it("throws on unknown extension", () => {
    assert.throws(
      () => classifyMedia("doc.txt"),
      /Unsupported media extension/,
    );
  });
});

describe("uploadChunked", () => {
  it("happy path: GIF, single chunk, no processing", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "fun.gif", Buffer.alloc(1024, 0xab));
      const initializeUpload = mock.fn(async () => ({
        data: { id: "media-1" },
      }));
      const finalizeUpload = mock.fn(async () => ({
        data: { id: "media-1" },
      }));
      const getUploadStatus = mock.fn(async () => ({ data: {} }));
      const client = clientWithOAuth1({
        initializeUpload,
        finalizeUpload,
        getUploadStatus,
      });

      const fetchCalls: FetchCall[] = [];
      const id = await uploadChunked(client, file, {
        sleep: noSleep,
        fetchImpl: makeFakeFetch({ calls: fetchCalls }),
      });
      assert.equal(id, "media-1");
      assert.equal(initializeUpload.mock.callCount(), 1);
      const initBody = (
        initializeUpload.mock.calls[0].arguments[0] as { body: unknown }
      ).body as { mediaCategory: string; mediaType: string; totalBytes: number };
      assert.equal(initBody.mediaCategory, "tweet_gif");
      assert.equal(initBody.mediaType, "image/gif");
      assert.equal(initBody.totalBytes, 1024);
      assert.equal(fetchCalls.length, 1);
      const call = fetchCalls[0];
      assert.equal(call.method, "POST");
      assert.equal(
        call.url,
        "https://api.x.com/2/media/upload/media-1/append",
      );
      assert.match(call.headers.Authorization, /^OAuth /);
      const ctMatch = /multipart\/form-data; boundary=(.+)$/.exec(
        call.headers["Content-Type"],
      );
      assert.ok(ctMatch, "Content-Type must be multipart/form-data");
      const fields = parseMultipartFields(call.body, ctMatch![1]);
      assert.equal(fields.segmentIndex, "0");
      assert.deepEqual(fields.mediaBytes, Buffer.alloc(1024, 0xab));
      assert.equal(finalizeUpload.mock.callCount(), 1);
      assert.equal(finalizeUpload.mock.calls[0].arguments[0], "media-1");
      assert.equal(getUploadStatus.mock.callCount(), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("multi-chunk: 200 KB file with 64 KB chunkSize → 4 segments", async () => {
    const dir = makeTempDir();
    try {
      const total = 200 * 1024;
      const file = writeFixture(dir, "v.mp4", Buffer.alloc(total, 0x01));
      const initializeUpload = mock.fn(async () => ({
        data: { id: "v-1" },
      }));
      const finalizeUpload = mock.fn(async () => ({ data: { id: "v-1" } }));
      const client = clientWithOAuth1({ initializeUpload, finalizeUpload });

      const fetchCalls: FetchCall[] = [];
      const id = await uploadChunked(client, file, {
        sleep: noSleep,
        chunkSize: 64 * 1024,
        fetchImpl: makeFakeFetch({ calls: fetchCalls }),
      });

      assert.equal(id, "v-1");
      assert.equal(fetchCalls.length, 4);
      const segments: string[] = [];
      let totalBytes = 0;
      for (const call of fetchCalls) {
        const ctMatch = /boundary=(.+)$/.exec(call.headers["Content-Type"]);
        assert.ok(ctMatch);
        const fields = parseMultipartFields(call.body, ctMatch![1]);
        segments.push(fields.segmentIndex ?? "");
        totalBytes += fields.mediaBytes?.length ?? 0;
      }
      assert.deepEqual(segments, ["0", "1", "2", "3"]);
      assert.equal(totalBytes, total);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("processing: polls STATUS until succeeded", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "v.mp4", Buffer.alloc(512, 0x02));
      const initializeUpload = mock.fn(async () => ({
        data: { id: "v-2" },
      }));
      const finalizeUpload = mock.fn(async () => ({
        data: {
          id: "v-2",
          processingInfo: { state: "pending", checkAfterSecs: 1 },
        },
      }));
      let statusCalls = 0;
      const getUploadStatus = mock.fn(async () => {
        statusCalls += 1;
        if (statusCalls === 1) {
          return {
            data: {
              processingInfo: { state: "in_progress", checkAfterSecs: 1 },
            },
          };
        }
        return { data: { processingInfo: { state: "succeeded" } } };
      });
      const client = clientWithOAuth1({
        initializeUpload,
        finalizeUpload,
        getUploadStatus,
      });

      const id = await uploadChunked(client, file, {
        sleep: noSleep,
        fetchImpl: makeFakeFetch(),
      });
      assert.equal(id, "v-2");
      assert.equal(getUploadStatus.mock.callCount(), 2);
      const [statusId, statusOpts] =
        getUploadStatus.mock.calls[0].arguments as [
          string,
          { command: string },
        ];
      assert.equal(statusId, "v-2");
      assert.equal(statusOpts.command, "STATUS");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("processing: surfaces 'failed' state error message", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "v.mp4", Buffer.alloc(256, 0x03));
      const initializeUpload = mock.fn(async () => ({
        data: { id: "v-3" },
      }));
      const finalizeUpload = mock.fn(async () => ({
        data: {
          id: "v-3",
          processingInfo: { state: "pending", checkAfterSecs: 1 },
        },
      }));
      const getUploadStatus = mock.fn(async () => ({
        data: {
          processingInfo: {
            state: "failed",
            error: { message: "transcode failed" },
          },
        },
      }));
      const client = clientWithOAuth1({
        initializeUpload,
        finalizeUpload,
        getUploadStatus,
      });

      await assert.rejects(
        () =>
          uploadChunked(client, file, {
            sleep: noSleep,
            fetchImpl: makeFakeFetch(),
          }),
        /transcode failed/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("processing: throws on max-wait timeout", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "v.mp4", Buffer.alloc(256, 0x04));
      const initializeUpload = mock.fn(async () => ({
        data: { id: "v-4" },
      }));
      const finalizeUpload = mock.fn(async () => ({
        data: {
          id: "v-4",
          processingInfo: { state: "pending", checkAfterSecs: 1 },
        },
      }));
      const getUploadStatus = mock.fn(async () => ({
        data: { processingInfo: { state: "pending", checkAfterSecs: 1 } },
      }));
      const client = clientWithOAuth1({
        initializeUpload,
        finalizeUpload,
        getUploadStatus,
      });

      const slowSleep = (_ms: number) =>
        new Promise<void>((r) => setTimeout(r, 5));
      await assert.rejects(
        () =>
          uploadChunked(client, file, {
            sleep: slowSleep,
            maxWaitMs: 1,
            fetchImpl: makeFakeFetch(),
          }),
        /timed out/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects 0-byte files before INIT", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "empty.gif", Buffer.alloc(0));
      const initializeUpload = mock.fn(async () => ({
        data: { id: "x" },
      }));
      const client = clientWithOAuth1({ initializeUpload });
      await assert.rejects(
        () => uploadChunked(client, file, { fetchImpl: makeFakeFetch() }),
        /empty/,
      );
      assert.equal(initializeUpload.mock.callCount(), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects GIF over 15 MB cap", async () => {
    const dir = makeTempDir();
    try {
      const file = writeSparseFixture(dir, "huge.gif", 16 * 1024 * 1024);
      const initializeUpload = mock.fn(async () => ({
        data: { id: "x" },
      }));
      const client = clientWithOAuth1({ initializeUpload });
      await assert.rejects(
        () => uploadChunked(client, file, { fetchImpl: makeFakeFetch() }),
        /GIF exceeds 15 MB/,
      );
      assert.equal(initializeUpload.mock.callCount(), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tags errors with the failing phase", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "x.gif", Buffer.alloc(128, 0x05));
      const initializeUpload = mock.fn(async () => {
        throw new Error("boom-init");
      });
      const client = clientWithOAuth1({ initializeUpload });
      await assert.rejects(
        () =>
          uploadChunked(client, file, {
            sleep: noSleep,
            fetchImpl: makeFakeFetch(),
          }),
        /Media INIT failed: boom-init/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("surfaces APPEND HTTP errors with status, statusText, and body excerpt", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "fun.gif", Buffer.alloc(64, 0xab));
      const initializeUpload = mock.fn(async () => ({
        data: { id: "media-err" },
      }));
      const finalizeUpload = mock.fn(async () => ({ data: { id: "media-err" } }));
      const client = clientWithOAuth1({ initializeUpload, finalizeUpload });

      await assert.rejects(
        () =>
          uploadChunked(client, file, {
            sleep: noSleep,
            fetchImpl: makeFakeFetch({
              status: 400,
              statusText: "Bad Request",
              responseBody: JSON.stringify({
                errors: [{ message: "Invalid segment_index" }],
              }),
            }),
          }),
        /Media APPEND failed at segment 0: HTTP 400 Bad Request: Invalid segment_index/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("uploadMedia dispatch", () => {
  it("routes images to one-shot upload", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "a.png", Buffer.alloc(64, 0x06));
      const upload = mock.fn(async () => ({ data: { id: "img-1" } }));
      const initializeUpload = mock.fn(async () => ({ data: { id: "x" } }));
      const client = clientWithOAuth1({ upload, initializeUpload });
      const id = await uploadMedia(client, file);
      assert.equal(id, "img-1");
      assert.equal(upload.mock.callCount(), 1);
      assert.equal(initializeUpload.mock.callCount(), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("routes GIF to chunked upload", async () => {
    const dir = makeTempDir();
    try {
      const file = writeFixture(dir, "a.gif", Buffer.alloc(64, 0x07));
      const upload = mock.fn(async () => ({ data: { id: "ignored" } }));
      const initializeUpload = mock.fn(async () => ({ data: { id: "g-1" } }));
      const finalizeUpload = mock.fn(async () => ({ data: { id: "g-1" } }));
      const client = clientWithOAuth1({ upload, initializeUpload, finalizeUpload });
      const id = await uploadMedia(client, file, {
        sleep: noSleep,
        fetchImpl: makeFakeFetch(),
      });
      assert.equal(id, "g-1");
      assert.equal(upload.mock.callCount(), 0);
      assert.equal(initializeUpload.mock.callCount(), 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
