interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ status: "ok", runtime: "cloudflare-workers", publishingEnabled: false });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        error: "API migration is not complete.",
        publishingEnabled: false,
      }, 503);
    }

    return env.ASSETS.fetch(request);
  },
};
