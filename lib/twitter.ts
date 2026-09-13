const TWEET_URL_PATTERN =
  /^https?:\/\/(www\.)?(twitter|x)\.com\/[^/]+\/status\/\d+/i;

export function isTwitterStatusUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["twitter.com", "www.twitter.com", "x.com", "www.x.com"].includes(parsed.hostname.toLowerCase())) {
      return false;
    }
    return TWEET_URL_PATTERN.test(url);
  } catch {
    return false;
  }
}
