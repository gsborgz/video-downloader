import { isTwitterStatusUrl } from "./twitter.js";
import { isYouTubeUrl } from "./youtube.js";

export function isSupportedVideoUrl(url: string): boolean {
  return isTwitterStatusUrl(url) || isYouTubeUrl(url);
}
