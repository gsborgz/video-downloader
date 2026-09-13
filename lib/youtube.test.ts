import { describe, expect, it } from "vitest";
import { isYouTubeUrl } from "./youtube";

describe("isYouTubeUrl", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
  ])("accepts %s", (url) => {
    expect(isYouTubeUrl(url)).toBe(true);
  });

  it.each([
    ["not a url", "garbage input"],
    ["https://example.com/watch?v=dQw4w9WgXcQ", "wrong domain"],
    ["https://www.youtube.com/", "homepage, no video id"],
    ["https://www.youtube.com/watch", "watch path without v param"],
    ["https://www.youtube.com/results?search_query=cats", "search results page"],
    ["https://www.youtube.com/c/SomeChannel", "channel page"],
    ["https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "subdomain spoofing attempt"],
    ["https://youtu.be/", "youtu.be with no id"],
  ])("rejects %s (%s)", (url) => {
    expect(isYouTubeUrl(url)).toBe(false);
  });
});
