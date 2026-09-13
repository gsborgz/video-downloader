import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
// ffmpeg-static is a CommonJS package whose .d.ts (a plain "export default") doesn't
// resolve cleanly under "moduleResolution": "nodenext" — TS infers the whole module
// namespace instead of the declared string type, so it's cast back explicitly here.
import ffmpegPathImport from "ffmpeg-static";
const ffmpegPath = ffmpegPathImport as unknown as string | null;

// A thin, explicit Promise wrapper instead of util.promisify(execFile): promisify relies
// on child_process's special promisify.custom hook (returning {stdout, stderr}) which a
// plain vi.mock replacement wouldn't have, so this keeps the code easy to unit test.
function execFileAsync(
  file: string,
  args: string[],
  options: { maxBuffer: number; timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
}

// Writes the (optional) Netscape-format cookies.txt content the user pasted in to a
// short-lived temp file so it can be passed to yt-dlp via --cookies, then always
// deletes it afterwards — this data never lives on disk longer than a single request.
async function withCookiesFile<T>(
  cookiesText: string | undefined,
  fn: (cookiesPath: string | null) => Promise<T>,
): Promise<T> {
  if (!cookiesText) return fn(null);

  const cookiesPath = path.join(tmpdir(), `video-downloader-cookies-${randomUUID()}.txt`);
  await writeFile(cookiesPath, cookiesText, "utf8");
  try {
    return await fn(cookiesPath);
  } finally {
    await unlink(cookiesPath).catch(() => {});
  }
}

export const MAX_COOKIES_LENGTH = 32 * 1024;

const MAX_HEIGHT = 720;
// Prefer a single progressive mp4 (already muxed) when the site offers one; otherwise
// fall back to merging the best video-only + audio-only streams (yt-dlp calls ffmpeg
// for that, via --ffmpeg-location below) — this is the common case for YouTube and for
// Twitter's "amplify_video" (non-GIF) uploads, which serve video/audio as separate HLS
// or DASH streams. Formats with no "height" field (e.g. Twitter's GIF-derived clips) are
// excluded from a [height<=N] filter entirely, so the chain ends with unfiltered
// fallbacks to still get *something* playable for those.
const FORMAT_SELECTOR = `best[ext=mp4][height<=${MAX_HEIGHT}]/bestvideo[ext=mp4][height<=${MAX_HEIGHT}]+bestaudio[ext=m4a]/best[height<=${MAX_HEIGHT}]/best[ext=mp4]/best`;

function resolveYtDlpPath(): string {
  const binName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const binPath = path.join(process.cwd(), "bin", binName);
  if (!existsSync(binPath)) {
    throw new Error(
      `yt-dlp binary not found at ${binPath}. Run "node scripts/download-yt-dlp.mjs" first.`,
    );
  }
  return binPath;
}

export interface RawFormat {
  ext: string;
  vcodec?: string;
  height?: number;
}

interface RawInfo {
  id: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  formats?: RawFormat[];
}

export interface VideoMeta {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  height: number | null;
}

async function getFirstInfo(videoUrl: string, cookiesText?: string): Promise<RawInfo> {
  const binPath = resolveYtDlpPath();

  const { stdout } = await withCookiesFile(cookiesText, (cookiesPath) =>
    execFileAsync(
      binPath,
      [
        "-j",
        "--no-warnings",
        "--no-playlist",
        "--playlist-items",
        "1",
        ...(cookiesPath ? ["--cookies", cookiesPath] : []),
        videoUrl,
      ],
      { maxBuffer: 1024 * 1024 * 20, timeout: 30_000 },
    ),
  );

  // A tweet with several attached videos (or a playlist/channel link) makes yt-dlp print
  // one JSON object per line (newline-delimited) even with --no-playlist. We only care
  // about the first video.
  const [info] = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RawInfo);

  if (!info) {
    throw new Error("Nenhum vídeo foi encontrado nesse link.");
  }
  return info;
}

// Best-effort resolution estimate for the preview card. Some formats omit vcodec
// entirely despite being real video (e.g. Twitter's GIF-derived clips) — only exclude
// when it's explicitly "none" (audio-only). Exported standalone so the edge cases (GIF
// clips with no height data, videos only available above 720p) are easy to unit test.
export function pickPreviewHeight(formats: RawFormat[]): number | null {
  const heights = formats
    .filter((f) => f.ext === "mp4" && f.vcodec !== "none" && typeof f.height === "number")
    .map((f) => f.height as number);
  const underLimit = heights.filter((h) => h <= MAX_HEIGHT);
  if (underLimit.length > 0) return Math.max(...underLimit);
  if (heights.length > 0) return Math.min(...heights);
  return null;
}

export async function getVideoMeta(videoUrl: string, cookiesText?: string): Promise<VideoMeta> {
  const info = await getFirstInfo(videoUrl, cookiesText);

  return {
    id: info.id,
    title: info.title ?? info.id,
    thumbnail: info.thumbnail ?? null,
    duration: info.duration ?? null,
    height: pickPreviewHeight(info.formats ?? []),
  };
}

export async function downloadVideo(
  videoUrl: string,
  outputPath: string,
  cookiesText?: string,
): Promise<void> {
  const binPath = resolveYtDlpPath();
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary not found (ffmpeg-static did not resolve a path).");
  }

  await withCookiesFile(cookiesText, (cookiesPath) =>
    execFileAsync(
      binPath,
      [
        "-f",
        FORMAT_SELECTOR,
        "--merge-output-format",
        "mp4",
        "--ffmpeg-location",
        ffmpegPath,
        "--no-playlist",
        "--playlist-items",
        "1",
        "--no-warnings",
        "--no-progress",
        ...(cookiesPath ? ["--cookies", cookiesPath] : []),
        "-o",
        outputPath,
        videoUrl,
      ],
      { maxBuffer: 1024 * 1024 * 20, timeout: 55_000 },
    ),
  );

  if (!existsSync(outputPath)) {
    throw new Error("O download do vídeo falhou.");
  }
}
