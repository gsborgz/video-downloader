import { describe, expect, it } from "vitest";
import { isSupportedVideoUrl } from "./video-url";

describe("isSupportedVideoUrl", () => {
  it.each([
    "https://x.com/NASA/status/1882872996031066248",
    "https://twitter.com/NASA/status/1882872996031066248",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
  ])("accepts %s", (url) => {
    expect(isSupportedVideoUrl(url)).toBe(true);
  });

  it.each([
    "https://example.com/video/123",
    "https://vimeo.com/12345",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isSupportedVideoUrl(url)).toBe(false);
  });
});
