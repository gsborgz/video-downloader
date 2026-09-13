import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

// Only the expensive part (spawning yt-dlp/ffmpeg) is mocked; it writes a small real
// file so the surrounding streaming/cleanup logic in the handler runs for real.
const downloadVideoMock = vi.fn<(url: string, outputPath: string) => Promise<void>>();
vi.mock("../lib/yt-dlp", () => ({
  downloadVideo: (url: string, outputPath: string) => downloadVideoMock(url, outputPath),
}));

import handler from "./download";

type FakeRes = PassThrough & { writeHead: ReturnType<typeof vi.fn> };

function makeReq(url: string): IncomingMessage {
  return { url } as unknown as IncomingMessage;
}

function makeRes(): FakeRes {
  const stream = new PassThrough() as FakeRes;
  stream.writeHead = vi.fn();
  return stream;
}

function call(req: IncomingMessage, res: FakeRes) {
  return handler(req, res as unknown as ServerResponse);
}

async function collect(stream: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  await once(stream, "end");
  return Buffer.concat(chunks);
}

describe("GET /api/download", () => {
  beforeEach(() => {
    downloadVideoMock.mockReset();
  });

  it("rejects a missing or unsupported video URL without touching yt-dlp", async () => {
    const res = makeRes();
    await call(makeReq("/api/download?url=https://example.com/evil"), res);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything());
    expect(downloadVideoMock).not.toHaveBeenCalled();
    res.end();
  });

  it("accepts a YouTube URL too", async () => {
    downloadVideoMock.mockImplementation(async (_url, outputPath) => {
      await writeFile(outputPath, "fake mp4 bytes");
    });

    const res = makeRes();
    const url = encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const done = collect(res);
    await call(makeReq(`/api/download?url=${url}`), res);
    await done;

    expect(downloadVideoMock).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      expect.any(String),
    );
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  });

  it("streams the downloaded file with a safe filename and cleans up the temp file", async () => {
    downloadVideoMock.mockImplementation(async (_url, outputPath) => {
      await writeFile(outputPath, "fake mp4 bytes");
    });

    const res = makeRes();
    const url = encodeURIComponent("https://x.com/a/status/1");
    const done = collect(res);
    await call(makeReq(`/api/download?url=${url}&name=Falcon 9! Launch`), res);
    const body = await done;

    expect(res.writeHead).toHaveBeenCalledTimes(1);
    const [status, headers] = res.writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(status).toBe(200);
    expect(headers["Content-Type"]).toBe("video/mp4");
    expect(headers["Content-Disposition"]).toBe('attachment; filename="Falcon_9_Launch.mp4"');
    expect(headers["Content-Length"]).toBe(String("fake mp4 bytes".length));
    expect(body.toString()).toBe("fake mp4 bytes");

    // the temp file used for the download must be removed once streamed
    const outputPath = downloadVideoMock.mock.calls[0][1];
    await vi.waitFor(() => expect(existsSync(outputPath)).toBe(false));
  });

  it("returns a 502 when the download itself fails", async () => {
    downloadVideoMock.mockRejectedValue(new Error("Requested format is not available"));

    const res = makeRes();
    const url = encodeURIComponent("https://x.com/a/status/1");
    const done = collect(res);
    await call(makeReq(`/api/download?url=${url}`), res);
    res.end();
    const body = await done;

    expect(res.writeHead).toHaveBeenCalledWith(502, expect.anything());
    expect(JSON.parse(body.toString())).toEqual({ error: "Requested format is not available" });
  });
});
