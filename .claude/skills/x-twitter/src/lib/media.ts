import { closeSync, openSync, readFileSync, readSync, statSync } from "fs";
import { randomBytes } from "crypto";
import { extname, resolve } from "path";
import type { Client } from "@xdevplatform/xdk";

type FetchLike = (
  input: string | URL,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | Uint8Array | string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}>;

const MAX_BYTES = 5 * 1024 * 1024;
const CHUNK_SIZE = 4 * 1024 * 1024;
const GIF_MAX_BYTES = 15 * 1024 * 1024;
const VIDEO_MAX_BYTES = 512 * 1024 * 1024;
const MAX_PROCESSING_WAIT_MS = 10 * 60 * 1000;
const DEFAULT_CHECK_AFTER_SECS = 5;

type OneShotImageMime = "image/png" | "image/jpeg" | "image/webp";
type ChunkedMime = "image/gif" | "video/mp4" | "video/quicktime" | "video/webm";
type ChunkedCategory = "tweet_gif" | "tweet_video";

const MIME_BY_EXT: Record<string, OneShotImageMime> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const CHUNKED_MIME_BY_EXT: Record<string, ChunkedMime> = {
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

const CATEGORY_BY_EXT: Record<string, ChunkedCategory> = {
  ".gif": "tweet_gif",
  ".mp4": "tweet_video",
  ".mov": "tweet_video",
  ".webm": "tweet_video",
};

export type MediaKind = "image" | "gif" | "video";

export function classifyMedia(filePath: string): MediaKind {
  const ext = extname(filePath).toLowerCase();
  if (ext in MIME_BY_EXT) return "image";
  if (ext === ".gif") return "gif";
  if (ext in CHUNKED_MIME_BY_EXT) return "video";
  const supported = [
    ...Object.keys(MIME_BY_EXT),
    ...Object.keys(CHUNKED_MIME_BY_EXT),
  ].join(", ");
  throw new Error(
    `Unsupported media extension "${ext}". Supported: ${supported}`,
  );
}

export async function uploadImage(
  client: Client,
  filePath: string,
): Promise<string> {
  const absolute = resolve(filePath);

  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    throw new Error(`Image file not found: ${absolute}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${absolute}`);
  }
  if (stats.size > MAX_BYTES) {
    throw new Error(
      `Image exceeds 5 MB limit (${stats.size} bytes): ${absolute}`,
    );
  }

  const ext = extname(absolute).toLowerCase();
  const mediaType = MIME_BY_EXT[ext];
  if (!mediaType) {
    throw new Error(
      `Unsupported image extension "${ext}". Supported: ${Object.keys(MIME_BY_EXT).join(", ")}`,
    );
  }

  const base64 = readFileSync(absolute).toString("base64");

  const response = (await client.media.upload({
    body: {
      media: base64,
      mediaCategory: "tweet_image",
      mediaType,
    },
  })) as { data?: { id?: string } };

  const mediaId = response?.data?.id;
  if (!mediaId) {
    throw new Error(
      `Media upload did not return an id for ${absolute}: ${JSON.stringify(response)}`,
    );
  }
  return mediaId;
}

export interface UploadChunkedOptions {
  sleep?: (ms: number) => Promise<void>;
  maxWaitMs?: number;
  chunkSize?: number;
  fetchImpl?: FetchLike;
}

// X v2 chunked APPEND endpoint expects multipart/form-data, but
// @xdevplatform/xdk@0.4.0 sends JSON and then double-reads the error body
// ("Body is unusable"). We bypass the SDK and POST multipart/form-data
// directly with an OAuth1-signed Authorization header. Multipart bodies
// are not part of the OAuth1 signature base string, so the body argument
// passed to buildRequestHeader is the empty string.
async function appendChunkMultipart(
  client: Client,
  mediaId: string,
  chunk: Buffer,
  segmentIndex: number,
  fetchImpl: FetchLike,
): Promise<void> {
  const oauth1 = (client as unknown as { oauth1?: { buildRequestHeader: (m: string, u: string, b: string) => Promise<string> } }).oauth1;
  if (!oauth1) {
    throw new Error("OAuth1 credentials are required for chunked media upload");
  }
  const baseUrl = (client as unknown as { baseUrl?: string }).baseUrl ?? "https://api.x.com";
  const url = `${baseUrl}/2/media/upload/${encodeURIComponent(mediaId)}/append`;
  const authHeader = await oauth1.buildRequestHeader("POST", url, "");

  const boundary = `----xskill${randomBytes(16).toString("hex")}`;
  const CRLF = "\r\n";
  const head = Buffer.from(
    `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="segment_index"${CRLF}${CRLF}` +
      `${segmentIndex}${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="media"; filename="blob"${CRLF}` +
      `Content-Type: application/octet-stream${CRLF}${CRLF}`,
    "utf8",
  );
  const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf8");
  const body = Buffer.concat([head, chunk, tail]);

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text) as {
        message?: string;
        errors?: { message?: string }[];
      };
      detail =
        parsed.message ??
        parsed.errors?.[0]?.message ??
        text;
    } catch {
      // not JSON; use raw text
    }
    const trimmed = detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${trimmed ? `: ${trimmed}` : ""}`,
    );
  }
}

interface ProcessingInfo {
  state?: string;
  checkAfterSecs?: number;
  error?: { code?: number | string; name?: string; message?: string };
  progressPercent?: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

async function pollProcessing(
  client: Client,
  mediaId: string,
  initialInfo: ProcessingInfo,
  opts: UploadChunkedOptions,
): Promise<void> {
  const sleep = opts.sleep ?? defaultSleep;
  const maxWait = opts.maxWaitMs ?? MAX_PROCESSING_WAIT_MS;
  const start = Date.now();
  let info: ProcessingInfo = initialInfo;

  while (info?.state === "pending" || info?.state === "in_progress") {
    const waitMs = (info.checkAfterSecs ?? DEFAULT_CHECK_AFTER_SECS) * 1000;
    await sleep(waitMs);
    if (Date.now() - start > maxWait) {
      throw new Error(
        `Media processing timed out after ${Math.round(
          (Date.now() - start) / 1000,
        )}s for ${mediaId}`,
      );
    }
    let status: { data?: { processingInfo?: ProcessingInfo } };
    try {
      status = (await client.media.getUploadStatus(mediaId, {
        command: "STATUS",
      })) as { data?: { processingInfo?: ProcessingInfo } };
    } catch (err) {
      throw new Error(
        `Media STATUS failed for ${mediaId}: ${(err as Error).message}`,
      );
    }
    info = status?.data?.processingInfo ?? {};
  }

  if (info?.state === "failed") {
    const msg = info.error?.message ?? info.error?.name ?? "unknown";
    throw new Error(`Media processing failed for ${mediaId}: ${msg}`);
  }
}

export async function uploadChunked(
  client: Client,
  filePath: string,
  opts: UploadChunkedOptions = {},
): Promise<string> {
  const absolute = resolve(filePath);
  const ext = extname(absolute).toLowerCase();
  const mediaType = CHUNKED_MIME_BY_EXT[ext];
  const mediaCategory = CATEGORY_BY_EXT[ext];
  if (!mediaType || !mediaCategory) {
    throw new Error(
      `Unsupported chunked media extension "${ext}". Supported: ${Object.keys(
        CHUNKED_MIME_BY_EXT,
      ).join(", ")}`,
    );
  }

  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    throw new Error(`Media file not found: ${absolute}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${absolute}`);
  }
  if (stats.size === 0) {
    throw new Error(`Media file is empty: ${absolute}`);
  }
  const sizeCap =
    mediaCategory === "tweet_gif" ? GIF_MAX_BYTES : VIDEO_MAX_BYTES;
  if (stats.size > sizeCap) {
    const limitMb = Math.round(sizeCap / 1024 / 1024);
    const label = mediaCategory === "tweet_gif" ? "GIF" : "Video";
    throw new Error(
      `${label} exceeds ${limitMb} MB limit (${stats.size} bytes): ${absolute}`,
    );
  }

  let mediaId: string;
  try {
    const init = (await client.media.initializeUpload({
      body: {
        mediaCategory,
        mediaType,
        totalBytes: stats.size,
      },
    })) as { data?: { id?: string } };
    const id = init?.data?.id;
    if (!id) {
      throw new Error(`no id returned: ${JSON.stringify(init)}`);
    }
    mediaId = id;
  } catch (err) {
    throw new Error(`Media INIT failed: ${(err as Error).message}`);
  }

  const chunkSize = opts.chunkSize ?? CHUNK_SIZE;
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const buffer = Buffer.alloc(chunkSize);
  const fd = openSync(absolute, "r");
  try {
    let segmentIndex = 0;
    let offset = 0;
    while (offset < stats.size) {
      const bytesRead = readSync(fd, buffer, 0, chunkSize, offset);
      if (bytesRead <= 0) break;
      const chunk = Buffer.from(buffer.subarray(0, bytesRead));
      try {
        await appendChunkMultipart(
          client,
          mediaId,
          chunk,
          segmentIndex,
          fetchImpl,
        );
      } catch (err) {
        throw new Error(
          `Media APPEND failed at segment ${segmentIndex}: ${(err as Error).message}`,
        );
      }
      offset += bytesRead;
      segmentIndex += 1;
    }
  } finally {
    closeSync(fd);
  }

  let processingInfo: ProcessingInfo | undefined;
  try {
    const fin = (await client.media.finalizeUpload(mediaId)) as {
      data?: { processingInfo?: ProcessingInfo };
    };
    processingInfo = fin?.data?.processingInfo;
  } catch (err) {
    throw new Error(`Media FINALIZE failed: ${(err as Error).message}`);
  }

  if (processingInfo) {
    await pollProcessing(client, mediaId, processingInfo, opts);
  }

  return mediaId;
}

export async function uploadMedia(
  client: Client,
  filePath: string,
  opts: UploadChunkedOptions = {},
): Promise<string> {
  const kind = classifyMedia(filePath);
  if (kind === "image") {
    return uploadImage(client, filePath);
  }
  return uploadChunked(client, filePath, opts);
}
