import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { VideoMeta } from "../lib/yt-dlp.js";

const getVideoMetaMock = vi.fn<(url: string) => Promise<VideoMeta>>();
vi.mock("../lib/yt-dlp.js", () => ({
  getVideoMeta: (url: string) => getVideoMetaMock(url),
}));

import handler from "./info.js";

function makeReq(method: string, body?: unknown): IncomingMessage {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return {
    method,
    async *[Symbol.asyncIterator]() {
      if (raw) yield Buffer.from(raw);
    },
  } as unknown as IncomingMessage;
}

function makeRes() {
  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
  };
  return res as unknown as ServerResponse & typeof res;
}

function jsonOf(res: ReturnType<typeof makeRes>): unknown {
  return JSON.parse((res.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
}

describe("POST /api/info", () => {
  beforeEach(() => {
    getVideoMetaMock.mockReset();
  });

  it("rejects non-POST methods", async () => {
    const res = makeRes();
    await handler(makeReq("GET"), res);
    expect(res.writeHead).toHaveBeenCalledWith(405, expect.anything());
  });

  it("rejects a missing or unsupported video URL", async () => {
    const res = makeRes();
    await handler(makeReq("POST", { url: "https://vimeo.com/12345" }), res);
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything());
    expect(getVideoMetaMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON bodies", async () => {
    const req = {
      method: "POST",
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("{not json");
      },
    } as unknown as IncomingMessage;
    const res = makeRes();
    await handler(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything());
  });

  it("returns the resolved video metadata for a valid tweet URL", async () => {
    const meta: VideoMeta = {
      id: "1",
      title: "A video",
      thumbnail: null,
      duration: 10,
      height: 720,
    };
    getVideoMetaMock.mockResolvedValue(meta);

    const res = makeRes();
    await handler(makeReq("POST", { url: "https://x.com/a/status/1" }), res);

    expect(getVideoMetaMock).toHaveBeenCalledWith("https://x.com/a/status/1");
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(jsonOf(res)).toEqual({ video: meta });
  });

  it("accepts a YouTube URL too", async () => {
    const meta: VideoMeta = { id: "1", title: "A video", thumbnail: null, duration: 10, height: 720 };
    getVideoMetaMock.mockResolvedValue(meta);

    const res = makeRes();
    await handler(makeReq("POST", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }), res);

    expect(getVideoMetaMock).toHaveBeenCalledWith("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  });

  it("returns a 502 when yt-dlp fails", async () => {
    getVideoMetaMock.mockRejectedValue(new Error("Nenhum vídeo foi encontrado nesse tweet."));

    const res = makeRes();
    await handler(makeReq("POST", { url: "https://x.com/a/status/1" }), res);

    expect(res.writeHead).toHaveBeenCalledWith(502, expect.anything());
    expect(jsonOf(res)).toEqual({ error: "Nenhum vídeo foi encontrado nesse tweet." });
  });
});
