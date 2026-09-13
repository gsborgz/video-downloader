import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isTwitterStatusUrl } from "../lib/twitter";
import { downloadTweetVideo } from "../lib/yt-dlp";
import { sendJson } from "../lib/http";

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const { searchParams } = new URL(req.url ?? "", "http://localhost");
  const url = searchParams.get("url");
  const name = searchParams.get("name");

  if (!url || !isTwitterStatusUrl(url)) {
    sendJson(res, 400, { error: "Link de tweet inválido." });
    return;
  }

  const outputPath = path.join(tmpdir(), `video-downloader-${randomUUID()}.mp4`);

  try {
    await downloadTweetVideo(url, outputPath);
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
