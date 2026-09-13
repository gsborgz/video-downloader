/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

// Runs the same handlers from ./api/*.ts (our Vercel Serverless Functions) inside the
// Vite dev server, so `npm run dev` works end-to-end without the Vercel CLI. In
// production, Vercel picks up ./api/*.ts on its own — this plugin is dev-only.
function apiRoutesDevMiddleware(): Plugin {
  const routes: Record<string, string> = {
    "/api/info": "/api/info.ts",
    "/api/download": "/api/download.ts",
  };

  return {
    name: "api-routes-dev-middleware",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split("?")[0];
        const modulePath = pathname ? routes[pathname] : undefined;
        if (!modulePath) {
          next();
          return;
        }
        try {
          const mod = await server.ssrLoadModule(modulePath);
          await mod.default(req, res);
        } catch (err) {
          next(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiRoutesDevMiddleware()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
