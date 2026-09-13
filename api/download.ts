import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isSupportedVideoUrl } from "../lib/video-url.js";
import { downloadVideo, MAX_COOKIES_LENGTH } from "../lib/yt-dlp.js";
import { readJsonBody, sendJson } from "../lib/http.js";

function safeFilename(raw: string | null): string {
  const base =
    (raw ?? "video")
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || "video";
  return `${base}.mp4`;
}

interface DownloadRequest {
  url: string | null;
  name: string | null;
  cookies?: string;
}

// GET (no body, native <a href> download) is the default, memory-efficient path: the
// browser streams the response straight to disk. POST is only used when the user has
// pasted YouTube cookies — those can be several KB and don't fit safely in a URL, so
// that flow goes through fetch()+blob on the frontend instead of a plain link.
async function parseRequest(req: IncomingMessage, res: ServerResponse): Promise<DownloadRequest | null> {
  if (req.method === "GET") {
    const { searchParams } = new URL(req.url ?? "", "http://localhost");
    return { url: searchParams.get("url"), name: searchParams.get("name") };
  }

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "JSON inválido." });
      return null;
    }
    const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const url = typeof obj.url === "string" ? obj.url : null;
    const name = typeof obj.name === "string" ? obj.name : null;
    const cookies = typeof obj.cookies === "string" ? obj.cookies : undefined;
    if (cookies !== undefined && cookies.length > MAX_COOKIES_LENGTH) {
      sendJson(res, 400, { error: "Cookies muito grandes." });
      return null;
    }
    return { url, name, cookies: cookies || undefined };
  }

  sendJson(res, 405, { error: "Method not allowed." });
  return null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const parsed = await parseRequest(req, res);
  if (!parsed) return;

  const { url, name, cookies } = parsed;
  if (!url || !isSupportedVideoUrl(url)) {
    sendJson(res, 400, { error: "Link inválido." });
    return;
  }

  const outputPath = path.join(tmpdir(), `video-downloader-${randomUUID()}.mp4`);

  try {
    await downloadVideo(url, outputPath, cookies);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido.";
    sendJson(res, 502, { error: message });
    return;
  }

  const { size } = await stat(outputPath);
  const fileStream = createReadStream(outputPath);
  fileStream.on("close", () => {
    unlink(outputPath).catch(() => {});
  });

  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Disposition": `attachment; filename="${safeFilename(name)}"`,
    "Content-Length": String(size),
  });
  fileStream.pipe(res);
}
