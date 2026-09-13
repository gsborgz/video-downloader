import { describe, expect, it, vi, beforeEach } from "vitest";
import { getVideoMeta, downloadVideo, pickPreviewHeight, type RawFormat } from "./yt-dlp.js";

// child_process.execFile is mocked at the Node callback level (not via util.promisify's
// special custom hook) to match how lib/yt-dlp.ts's own execFileAsync wrapper calls it.
const execFileMock = vi.fn();
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const execFile = (...args: unknown[]) => execFileMock(...args);
  return { ...actual, execFile, default: { ...actual, execFile } };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const existsSync = vi.fn(() => true);
  return { ...actual, existsSync, default: { ...actual, existsSync } };
});

function mockYtDlpStdout(...jsonObjects: unknown[]) {
  const stdout = jsonObjects.map((o) => JSON.stringify(o)).join("\n");
  execFileMock.mockImplementation((_file, _args, _options, callback) => {
    callback(null, stdout, "");
  });
}

describe("pickPreviewHeight", () => {
  it("picks the highest height at or below 720p", () => {
    const formats: RawFormat[] = [
      { ext: "mp4", vcodec: "avc1", height: 360 },
      { ext: "mp4", vcodec: "avc1", height: 720 },
      { ext: "mp4", vcodec: "avc1", height: 1080 },
      { ext: "mp4", vcodec: "avc1", height: 2160 },
    ];
    expect(pickPreviewHeight(formats)).toBe(720);
  });

  it("falls back to the smallest available height when everything exceeds 720p", () => {
    const formats: RawFormat[] = [
      { ext: "mp4", vcodec: "avc1", height: 1080 },
      { ext: "mp4", vcodec: "avc1", height: 2160 },
    ];
    expect(pickPreviewHeight(formats)).toBe(1080);
  });

  it("returns null when no format reports a height (e.g. GIF-derived clips)", () => {
    const formats: RawFormat[] = [{ ext: "mp4", vcodec: undefined, height: undefined }];
    expect(pickPreviewHeight(formats)).toBeNull();
  });

  it("ignores audio-only formats (vcodec: none)", () => {
    const formats: RawFormat[] = [
      { ext: "mp4", vcodec: "none", height: 0 },
      { ext: "mp4", vcodec: "avc1", height: 480 },
    ];
    expect(pickPreviewHeight(formats)).toBe(480);
  });

  it("ignores non-mp4 formats", () => {
    const formats: RawFormat[] = [{ ext: "webm", vcodec: "vp9", height: 720 }];
    expect(pickPreviewHeight(formats)).toBeNull();
  });
});

describe("getVideoMeta", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("extracts title, thumbnail, duration and capped height from yt-dlp's JSON", async () => {
    mockYtDlpStdout({
      id: "123",
      title: "A rocket launch",
      thumbnail: "https://pbs.twimg.com/thumb.jpg",
      duration: 14.8,
      formats: [
        { ext: "mp4", vcodec: "avc1", height: 720 },
        { ext: "mp4", vcodec: "avc1", height: 1080 },
      ],
    });

    await expect(getVideoMeta("https://x.com/a/status/1")).resolves.toEqual({
      id: "123",
      title: "A rocket launch",
      thumbnail: "https://pbs.twimg.com/thumb.jpg",
      duration: 14.8,
      height: 720,
    });
  });

  it("only uses the first video when a tweet has several (newline-delimited JSON)", async () => {
    mockYtDlpStdout(
      { id: "first", title: "Video one", formats: [] },
      { id: "second", title: "Video two", formats: [] },
    );

    const result = await getVideoMeta("https://x.com/a/status/1");
    expect(result.id).toBe("first");
  });

  it("falls back to the tweet id as title when yt-dlp doesn't report one", async () => {
    mockYtDlpStdout({ id: "123", formats: [] });

    const result = await getVideoMeta("https://x.com/a/status/1");
    expect(result.title).toBe("123");
  });

  it("propagates yt-dlp failures (e.g. tweet has no video)", async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(new Error("ERROR: [twitter] 1: No video could be found in this tweet"));
    });

    await expect(getVideoMeta("https://x.com/a/status/1")).rejects.toThrow(/No video could be found/);
  });
});

describe("downloadVideo", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("calls yt-dlp with a format selector capped at 720p and the given output path", async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, "", "");
    });

    await downloadVideo("https://x.com/a/status/1", "/tmp/out.mp4");

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(args).toContain("-f");
    expect(args.join(" ")).toContain("height<=720");
    expect(args).toContain("--merge-output-format");
    expect(args).toContain("-o");
    expect(args).toContain("/tmp/out.mp4");
    expect(args).toContain("https://x.com/a/status/1");
  });

  it("works the same way for a YouTube URL", async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, "", "");
    });

    await downloadVideo("https://youtube.com/watch?v=dQw4w9WgXcQ", "/tmp/out.mp4");

    const [, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(args).toContain("https://youtube.com/watch?v=dQw4w9WgXcQ");
  });
});
