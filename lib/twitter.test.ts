import { describe, expect, it } from "vitest";
import { isTwitterStatusUrl } from "./twitter.js";

describe("isTwitterStatusUrl", () => {
  it.each([
    "https://x.com/NASA/status/1882872996031066248",
    "https://twitter.com/NASA/status/1882872996031066248",
    "https://www.x.com/NASA/status/1882872996031066248",
    "https://www.twitter.com/NASA/status/1882872996031066248",
    "http://x.com/NASA/status/1882872996031066248",
    "https://x.com/NASA/status/1882872996031066248?s=20",
  ])("accepts %s", (url) => {
    expect(isTwitterStatusUrl(url)).toBe(true);
  });

  it.each([
    ["not a url", "garbage input"],
    ["https://example.com/NASA/status/123", "wrong domain"],
    ["https://x.com/NASA", "no status path"],
    ["https://x.com/NASA/status/", "missing tweet id"],
    ["https://x.com/NASA/status/abc", "non-numeric tweet id"],
    ["https://evil.com/?redirect=https://x.com/NASA/status/123", "domain spoofing attempt"],
    ["https://x.com.evil.com/NASA/status/123", "subdomain spoofing attempt"],
    ["ftp://x.com/NASA/status/123", "non-http protocol"],
  ])("rejects %s (%s)", (url) => {
    expect(isTwitterStatusUrl(url)).toBe(false);
  });
});
