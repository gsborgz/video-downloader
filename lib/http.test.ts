import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson } from "./http";

function makeReq(chunks: string[]): IncomingMessage {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield Buffer.from(chunk);
      }
    },
  } as unknown as IncomingMessage;
}

describe("readJsonBody", () => {
  it("parses a JSON body split across multiple chunks", async () => {
    const req = makeReq(['{"url":"https://x.', 'com/a/status/1"}']);
    await expect(readJsonBody(req)).resolves.toEqual({ url: "https://x.com/a/status/1" });
  });

  it("returns an empty object for an empty body", async () => {
    const req = makeReq([]);
    await expect(readJsonBody(req)).resolves.toEqual({});
  });

  it("rejects when the body is not valid JSON", async () => {
    const req = makeReq(["not json"]);
    await expect(readJsonBody(req)).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe("sendJson", () => {
  it("writes the status, JSON content-type header and serialized body", () => {
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    sendJson(res, 400, { error: "oops" });

    expect(res.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json; charset=utf-8" });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: "oops" }));
  });
});
