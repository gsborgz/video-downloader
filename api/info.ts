import type { IncomingMessage, ServerResponse } from "node:http";
import { isSupportedVideoUrl } from "../lib/video-url.js";
import { getVideoMeta } from "../lib/yt-dlp.js";
import { readJsonBody, sendJson } from "../lib/http.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "JSON inválido." });
    return;
  }

  const url = typeof body === "object" && body !== null ? (body as { url?: unknown }).url : undefined;
  if (typeof url !== "string" || !isSupportedVideoUrl(url)) {
    sendJson(res, 400, {
      error:
        "Informe um link válido de um post do Twitter/X ou de um vídeo do YouTube (ex: https://x.com/usuario/status/123 ou https://youtube.com/watch?v=abc).",
    });
    return;
  }

  try {
    const video = await getVideoMeta(url);
    sendJson(res, 200, { video });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido.";
    sendJson(res, 502, { error: message });
  }
}
