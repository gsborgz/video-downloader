const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"];

const VIDEO_ID_PATH = /^\/(shorts|live|embed)\/[\w-]{6,}/;

export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.includes(host)) return false;

    if (host === "youtu.be") {
      return /^\/[\w-]{6,}/.test(parsed.pathname);
    }
    if (parsed.pathname === "/watch") {
      return parsed.searchParams.has("v");
    }
    return VIDEO_ID_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}
