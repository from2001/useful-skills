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
      const appendUpload = mock.fn(async () => ({ data: {} }));
      const finalizeUpload = mock.fn(async () => ({
        data: { id: "media-1" },
      }));
      const getUploadStatus = mock.fn(async () => ({ data: {} }));
      const client = mockClient({
        media: {
          initializeUpload,
          appendUpload,
          finalizeUpload,
          getUploadStatus,
        },
      });

      const id = await uploadChunked(client, file, { sleep: noSleep });
      assert.equal(id, "media-1");
      assert.equal(initializeUpload.mock.callCount(), 1);
      const initBody = (
        initializeUpload.mock.calls[0].arguments[0] as { body: unknown }
      ).body as { mediaCategory: string; mediaType: string; totalBytes: number };
      assert.equal(initBody.mediaCategory, "tweet_gif");
      assert.equal(initBody.mediaType, "image/gif");
      assert.equal(initBody.totalBytes, 1024);
      assert.equal(appendUpload.mock.callCount(), 1);
      const [appendId, appendOpts] = appendUpload.mock.calls[0].arguments as [
        string,
        { body: { media: string; segmentIndex: number } },
      ];
      assert.equal(appendId, "media-1");
      assert.equal(appendOpts.body.segmentIndex, 0);
      assert.equal(
        appendOpts.body.media,
        Buffer.alloc(1024, 0xab).toString("base64"),
      );
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
      const appendUpload = mock.fn(async () => ({ data: {} }));
      const finalizeUpload = mock.fn(async () => ({ data: { id: "v-1" } }));
      const client = mockClient({
        media: { initializeUpload, appendUpload, finalizeUpload },
      });

      const id = await uploadChunked(client, file, {
        sleep: noSleep,
        chunkSize: 64 * 1024,
      });

      assert.equal(id, "v-1");
      assert.equal(appendUpload.mock.callCount(), 4);
      const segments = appendUpload.mock.calls.map(
        (c) =>
          (c.arguments[1] as { body: { segmentIndex: number } }).body
            .segmentIndex,
      );
      assert.deepEqual(segments, [0, 1, 2, 3]);
      const totalBytes = appendUpload.mock.calls.reduce((sum, c) => {
        const b = (c.arguments[1] as { body: { media: string } }).body.media;
        return sum + Buffer.from(b, "base64").length;
      }, 0);
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
      const appendUpload = mock.fn(async () => ({ data: {} }));
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
      const client = mockClient({
        media: {
          initializeUpload,
          appendUpload,
          finalizeUpload,
          getUploadStatus,
        },
      });

      const id = await uploadChunked(client, file, { sleep: noSleep });
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
      const appendUpload = mock.fn(async () => ({ data: {} }));
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
      const client = mockClient({
        media: {
          initializeUpload,
          appendUpload,
          finalizeUpload,
          getUploadStatus,
        },
      });

      await assert.rejects(
        () => uploadChunked(client, file, { sleep: noSleep }),
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
      const appendUpload = mock.fn(async () => ({ data: {} }));
      const finalizeUpload = mock.fn(async () => ({
        data: {
          id: "v-4",
          processingInfo: { state: "pending", checkAfterSecs: 1 },
        },
      }));
      const getUploadStatus = mock.fn(async () => ({
        data: { processingInfo: { state: "pending", checkAfterSecs: 1 } },
      }));
      const client = mockClient({
        media: {
          initializeUpload,
          appendUpload,
          finalizeUpload,
          getUploadStatus,
        },
      });

      const slowSleep = (_ms: number) =>
        new Promise<void>((r) => setTimeout(r, 5));
      await assert.rejects(
        () =>
          uploadChunked(client, file, { sleep: slowSleep, maxWaitMs: 1 }),
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
      const client = mockClient({
        media: { initializeUpload, appendUpload: async () => ({}) },
      });
      await assert.rejects(
        () => uploadChunked(client, file),
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
      const client = mockClient({ media: { initializeUpload } });
      await assert.rejects(
        () => uploadChunked(client, file),
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
      const client = mockClient({ media: { initializeUpload } });
      await assert.rejects(
        () => uploadChunked(client, file, { sleep: noSleep }),
        /Media INIT failed: boom-init/,
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
      const client = mockClient({
        media: { upload, initializeUpload, appendUpload: async () => ({}) },
      });
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
      const appendUpload = mock.fn(async () => ({ data: {} }));
      const finalizeUpload = mock.fn(async () => ({ data: { id: "g-1" } }));
      const client = mockClient({
        media: { upload, initializeUpload, appendUpload, finalizeUpload },
      });
      const id = await uploadMedia(client, file, { sleep: noSleep });
      assert.equal(id, "g-1");
      assert.equal(upload.mock.callCount(), 0);
      assert.equal(initializeUpload.mock.callCount(), 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
