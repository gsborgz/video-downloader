import { isTwitterStatusUrl } from "./twitter";
import { isYouTubeUrl } from "./youtube";

export function isSupportedVideoUrl(url: string): boolean {
  return isTwitterStatusUrl(url) || isYouTubeUrl(url);
}
