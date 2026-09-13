import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("<App />", () => {
  it("shows the download link and video info after a successful lookup", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        video: { id: "1", title: "A rocket launch", thumbnail: null, duration: 65, height: 720 },
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: /link do vídeo/i }), "https://x.com/SpaceX/status/1");
    await user.click(screen.getByRole("button", { name: /gerar vídeo/i }));

    expect(await screen.findByText("A rocket launch")).toBeTruthy();
    expect(screen.getByText(/720p ·/)).toBeTruthy();

    const downloadLink = screen.getByRole("link", { name: /baixar mp4/i }) as HTMLAnchorElement;
    expect(downloadLink.href).toContain("/api/download?url=");
    expect(downloadLink.href).toContain(encodeURIComponent("https://x.com/SpaceX/status/1"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/info",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://x.com/SpaceX/status/1" }),
      }),
    );
  });

  it("shows the API's error message and no download link when the lookup fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "Link de tweet inválido." }));

    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: /link do vídeo/i }), "https://example.com");
    await user.click(screen.getByRole("button", { name: /gerar vídeo/i }));

    expect(await screen.findByText("Link de tweet inválido.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /baixar mp4/i })).toBeNull();
  });

  it("shows a generic error message when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: /link do vídeo/i }), "https://x.com/a/status/1");
    await user.click(screen.getByRole("button", { name: /gerar vídeo/i }));

    await waitFor(() => expect(screen.getByText("network down")).toBeTruthy());
  });
});

describe("<App /> YouTube cookies (advanced)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists pasted cookies to localStorage and reuses them after a remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByText(/usar cookies/i));
    await user.type(screen.getByPlaceholderText(/netscape/i), "# my cookies");

    expect(localStorage.getItem("video-downloader:youtube-cookies")).toBe("# my cookies");

    unmount();
    render(<App />);
    await user.click(screen.getByText(/usar cookies/i));
    const textarea = screen.getByPlaceholderText(/netscape/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("# my cookies");
  });

  it("includes saved cookies in the /api/info request", async () => {
    localStorage.setItem("video-downloader:youtube-cookies", "# my cookies");
    fetchMock.mockResolvedValue(
      jsonResponse(200, { video: { id: "1", title: "V", thumbnail: null, duration: 1, height: 360 } }),
    );

    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByRole("textbox", { name: /link do vídeo/i }),
      "https://www.youtube.com/watch?v=1",
    );
    await user.click(screen.getByRole("button", { name: /gerar vídeo/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/info",
        expect.objectContaining({
          body: JSON.stringify({ url: "https://www.youtube.com/watch?v=1", cookies: "# my cookies" }),
        }),
      ),
    );
  });

  it('"Remover cookies salvos" clears the stored value', async () => {
    localStorage.setItem("video-downloader:youtube-cookies", "# my cookies");
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText(/usar cookies/i));
    await user.click(screen.getByRole("button", { name: /remover cookies salvos/i }));

    expect(localStorage.getItem("video-downloader:youtube-cookies")).toBeNull();
    const textarea = screen.getByPlaceholderText(/netscape/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("downloads via fetch + blob instead of a plain GET link when cookies are saved", async () => {
    localStorage.setItem("video-downloader:youtube-cookies", "# my cookies");
    const blob = new Blob(["data"], { type: "video/mp4" });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { video: { id: "1", title: "V", thumbnail: null, duration: 1, height: 360 } }),
      )
      .mockResolvedValueOnce({ ok: true, blob: async () => blob });

    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByRole("textbox", { name: /link do vídeo/i }),
      "https://www.youtube.com/watch?v=1",
    );
    await user.click(screen.getByRole("button", { name: /gerar vídeo/i }));
    await screen.findByText("V");

    await user.click(screen.getByRole("link", { name: /baixar mp4/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/download",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ url: "https://www.youtube.com/watch?v=1", name: "V", cookies: "# my cookies" }),
        }),
      ),
    );
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });
});
