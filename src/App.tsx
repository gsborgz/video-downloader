import { useState, type FormEvent, type MouseEvent } from "react";

interface VideoMeta {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  height: number | null;
}

const COOKIES_STORAGE_KEY = "video-downloader:youtube-cookies";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function loadStoredCookies(): string {
  try {
    return localStorage.getItem(COOKIES_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoMeta | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [cookies, setCookies] = useState(loadStoredCookies);
  const [downloading, setDownloading] = useState(false);

  function updateCookies(value: string) {
    setCookies(value);
    try {
      if (value) {
        localStorage.setItem(COOKIES_STORAGE_KEY, value);
      } else {
        localStorage.removeItem(COOKIES_STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — cookies just won't persist.
    }
  }

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
        body: JSON.stringify(cookies ? { url, cookies } : { url }),
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

  // Without saved cookies this link just navigates normally (GET, native browser
  // download). With cookies we need to send them in a request body — too big/sensitive
  // for a URL — so we intercept the click and do it via fetch + blob instead.
  async function handleDownloadClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!cookies || !video || !resolvedUrl) return;
    e.preventDefault();
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: resolvedUrl, name: video.title, cookies }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Não foi possível baixar o vídeo.");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${video.title || "video"}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setDownloading(false);
    }
  }

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

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              required
              aria-label="Link do vídeo"
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
          </div>

          <details className="rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="cursor-pointer select-none px-4 py-2 text-zinc-600 dark:text-zinc-400">
              Problemas para baixar do YouTube? Usar cookies (avançado)
            </summary>
            <div className="flex flex-col gap-2 px-4 pb-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                O YouTube às vezes bloqueia downloads vindos deste servidor pedindo confirmação de
                login. Colar aqui o conteúdo de um arquivo <code>cookies.txt</code> exportado de uma
                sessão sua logada no YouTube (ex: com a extensão &quot;Get cookies.txt LOCALLY&quot;)
                pode contornar isso. Fica salvo só neste navegador e só é enviado quando você gera ou
                baixa um vídeo. Trate como uma senha — nunca cole cookies de uma conta que não seja
                sua — e use por sua conta e risco: pode violar os Termos de Serviço do YouTube.
              </p>
              <textarea
                value={cookies}
                onChange={(e) => updateCookies(e.target.value)}
                placeholder="# Netscape HTTP Cookie File..."
                rows={4}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
              />
              {cookies && (
                <button
                  type="button"
                  onClick={() => updateCookies("")}
                  className="self-start text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Remover cookies salvos
                </button>
              )}
            </div>
          </details>
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
              onClick={handleDownloadClick}
              aria-disabled={downloading}
              className="rounded-lg bg-black px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {downloading ? "Baixando…" : "Baixar MP4"}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
