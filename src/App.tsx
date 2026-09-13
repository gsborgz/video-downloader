import { useState, type FormEvent } from "react";

interface VideoMeta {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  height: number | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoMeta | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setVideo(null);
    setResolvedUrl(null);
    setLoading(true);
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Não foi possível processar esse link.");
      }
      setVideo(data.video);
      setResolvedUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const downloadHref =
    video && resolvedUrl
      ? `/api/download?url=${encodeURIComponent(resolvedUrl)}&name=${encodeURIComponent(video.title)}`
      : null;

  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-8 px-6 py-20">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Baixador de vídeos do X/Twitter e YouTube
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Cole o link do post ou do vídeo, gere o MP4 (até 720p) e baixe.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            required
            placeholder="https://x.com/usuario/status/... ou https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? "Gerando…" : "Gerar vídeo"}
          </button>
        </form>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {video && downloadHref && (
          <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex gap-4">
              {video.thumbnail && (
                <img
                  src={video.thumbnail}
                  alt=""
                  className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="flex flex-col justify-center gap-1 text-sm">
                <p className="font-medium text-black dark:text-zinc-50">{video.title}</p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {video.height ? `${video.height}p · ` : ""}
                  {formatDuration(video.duration)}
                </p>
              </div>
            </div>
            <a
              href={downloadHref}
              className="rounded-lg bg-black px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Baixar MP4
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
