// Downloads the standalone yt-dlp binary for the current platform into ./bin.
// Runs automatically on `npm install` (postinstall) so the binary matches whatever
// OS the install happens on (your machine locally, Vercel's Linux build servers in prod).
import { mkdirSync, existsSync, chmodSync, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const ASSET_BY_PLATFORM = {
  win32: "yt-dlp.exe",
  linux: "yt-dlp_linux",
  darwin: "yt-dlp_macos",
};

const asset = ASSET_BY_PLATFORM[process.platform];
if (!asset) {
  console.warn(`[download-yt-dlp] Unsupported platform "${process.platform}", skipping.`);
  process.exit(0);
}

const binDir = path.join(process.cwd(), "bin");
const destName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const destPath = path.join(binDir, destName);

if (existsSync(destPath)) {
  console.log(`[download-yt-dlp] ${destPath} already present, skipping download.`);
  process.exit(0);
}

const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;

try {
  mkdirSync(binDir, { recursive: true });
  console.log(`[download-yt-dlp] Downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(destPath));
  if (process.platform !== "win32") {
    chmodSync(destPath, 0o755);
  }
  console.log(`[download-yt-dlp] Saved to ${destPath}`);
} catch (err) {
  console.warn(
    `[download-yt-dlp] Could not download yt-dlp binary automatically: ${err.message}\n` +
      "The app will not be able to resolve videos until this succeeds. " +
      "Re-run 'node scripts/download-yt-dlp.mjs' once you have network access.",
  );
}
