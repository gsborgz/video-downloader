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

    await user.type(
      screen.getByPlaceholderText(/x.com\/usuario\/status/i),
      "https://x.com/SpaceX/status/1",
    );
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

    await user.type(screen.getByPlaceholderText(/x.com\/usuario\/status/i), "https://example.com");
    await user.click(screen.getByRole("button", { name: /gerar vídeo/i }));

    expect(await screen.findByText("Link de tweet inválido.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /baixar mp4/i })).toBeNull();
  });

  it("shows a generic error message when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByPlaceholderText(/x.com\/usuario\/status/i), "https://x.com/a/status/1");
    await user.click(screen.getByRole("button", { name: /gerar vídeo/i }));

    await waitFor(() => expect(screen.getByText("network down")).toBeTruthy());
  });
});
